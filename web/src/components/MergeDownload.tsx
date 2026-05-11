"use client";

import { useRef, useState } from "react";
import type { VideoFormat, VideoInfo } from "@/lib/innertube";

interface Props {
  info: VideoInfo;
  videoFormats: VideoFormat[];
  audioFormats: VideoFormat[];
}

type Phase =
  | "idle"
  | "loading-ffmpeg"
  | "fetching-video"
  | "fetching-audio"
  | "merging"
  | "done"
  | "error";

// ── Minimal Worker client ──────────────────────────────────────────────────
// Talks directly to /public/ffmpeg-worker.js (plain classic Worker, no webpack).
// No @ffmpeg/ffmpeg package involved — avoids all webpack/CSP/blob-URL issues.

interface WorkerReply {
  id?: string;
  ok?: boolean;
  data?: unknown;
  error?: string;
  type?: string;   // "progress" | "log"
  ratio?: number;
}

class FFWorker {
  private w: Worker;
  private pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  onProgress?: (ratio: number) => void;

  constructor() {
    this.w = new Worker("/ffmpeg-worker.js");
    this.w.onmessage = (evt: MessageEvent<WorkerReply>) => {
      const msg = evt.data;
      if (msg.type === "progress") {
        this.onProgress?.(msg.ratio ?? 0);
        return;
      }
      if (msg.type === "log") return; // ignore logs
      if (msg.id) {
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        if (msg.ok) p.resolve(msg.data);
        else p.reject(new Error(msg.error ?? "worker error"));
      }
    };
  }

  private send(type: string, data: unknown, transfers: Transferable[] = []): Promise<unknown> {
    const id = Math.random().toString(36).slice(2) + Date.now();
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.w.postMessage({ id, type, data }, transfers);
    });
  }

  async load(coreURL: string, wasmURL: string)           { await this.send("load",   { coreURL, wasmURL }); }
  async exec(args: string[])                              { await this.send("exec",   { args }); }
  async write(path: string, data: Uint8Array)             { await this.send("write",  { path, data }, [data.buffer]); }
  async read(path: string): Promise<Uint8Array>           { return this.send("read",  { path }) as Promise<Uint8Array>; }
  async del(path: string)                                 { await this.send("delete", { path }).catch(() => {}); }
  terminate()                                             { this.w.terminate(); }
}

// ── Simple byte fetcher ────────────────────────────────────────────────────
async function fetchBytes(url: string, onProgress?: (pct: number) => void): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (!res.body) return new Uint8Array(await res.arrayBuffer());

  const total = parseInt(res.headers.get("content-length") ?? "0", 10);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (total > 0) onProgress?.(received / total);
  }
  const out = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.length; }
  return out;
}

// ── Component ──────────────────────────────────────────────────────────────
export default function MergeDownload({ info, videoFormats, audioFormats }: Props) {
  const [selectedItag, setSelectedItag] = useState<number>(videoFormats[0]?.itag ?? 0);
  const [phase, setPhase]               = useState<Phase>("idle");
  const [progress, setProgress]         = useState(0);
  const [statusMsg, setStatusMsg]       = useState("");
  const [error, setError]               = useState<string | null>(null);
  const workerRef                       = useRef<FFWorker | null>(null);

  const bestAudio    = audioFormats[0];
  const selectedVideo = videoFormats.find(f => f.itag === selectedItag) ?? videoFormats[0];

  async function handleMerge() {
    if (!selectedVideo?.url || !bestAudio?.url) return;
    setPhase("loading-ffmpeg");
    setProgress(0);
    setError(null);
    setStatusMsg("Loading ffmpeg engine...");

    try {
      // Create worker once; reuse on subsequent calls
      if (!workerRef.current) {
        workerRef.current = new FFWorker();
      }
      const ff = workerRef.current;
      ff.onProgress = (ratio) => {
        setProgress(Math.min(99, Math.round(ratio * 100)));
      };

      const origin  = window.location.origin;
      const coreURL = `${origin}/api/ffmpeg-core?file=ffmpeg-core.js`;
      const wasmURL = `${origin}/api/ffmpeg-core?file=ffmpeg-core.wasm`;

      setStatusMsg("Loading ffmpeg engine (cached after first use)...");
      await ff.load(coreURL, wasmURL);

      const proxied = info.proxied ? "1" : "0";
      const videoMB = selectedVideo.contentLength
        ? Math.round(parseInt(selectedVideo.contentLength) / 1024 / 1024) : "?";
      const audioMB = bestAudio.contentLength
        ? Math.round(parseInt(bestAudio.contentLength) / 1024 / 1024) : "?";

      // Fetch video
      setPhase("fetching-video");
      setStatusMsg(`Fetching video (~${videoMB} MB)...`);
      const videoProxy = `/api/stream?url=${encodeURIComponent(selectedVideo.url)}&filename=video.mp4&proxied=${proxied}`;
      const videoBytes = await fetchBytes(videoProxy, p => {
        setProgress(Math.round(p * 50)); // 0–50%
        setStatusMsg(`Fetching video (~${videoMB} MB)… ${Math.round(p * 100)}%`);
      });

      // Fetch audio
      setPhase("fetching-audio");
      setStatusMsg(`Fetching audio (~${audioMB} MB)...`);
      const audioProxy = `/api/stream?url=${encodeURIComponent(bestAudio.url)}&filename=audio.m4a&proxied=${proxied}`;
      const audioBytes = await fetchBytes(audioProxy, p => {
        setProgress(50 + Math.round(p * 10)); // 50–60%
        setStatusMsg(`Fetching audio (~${audioMB} MB)… ${Math.round(p * 100)}%`);
      });

      // Write to ffmpeg FS
      setPhase("merging");
      setStatusMsg("Writing files to ffmpeg...");
      setProgress(62);
      await ff.write("video.mp4", videoBytes);
      await ff.write("audio.m4a", audioBytes);

      // Mux — stream copy, very fast
      setProgress(65);
      setStatusMsg("Muxing streams (stream copy)...");
      await ff.exec([
        "-i", "video.mp4",
        "-i", "audio.m4a",
        "-c:v", "copy",
        "-c:a", "copy",
        "-movflags", "+faststart",
        "-y",
        "output.mp4",
      ]);

      // Read result
      setProgress(90);
      setStatusMsg("Saving file...");
      const out  = await ff.read("output.mp4");
      const blob = new Blob([new Uint8Array(out).buffer as ArrayBuffer], { type: "video/mp4" });
      const url  = URL.createObjectURL(blob);
      const safe = info.title.replace(/[^a-zA-Z0-9 _-]/g, "").slice(0, 60).trim();
      const lbl  = selectedVideo.qualityLabel ?? selectedVideo.quality ?? String(selectedVideo.itag);
      const a    = document.createElement("a");
      a.href = url; a.download = `${safe} [${lbl}].mp4`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);

      // Cleanup ffmpeg FS
      await ff.del("video.mp4");
      await ff.del("audio.m4a");
      await ff.del("output.mp4");

      setProgress(100);
      setPhase("done");
      setStatusMsg("Saved to downloads!");
      setTimeout(() => { setPhase("idle"); setProgress(0); setStatusMsg(""); }, 4000);

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("MergeDownload:", err);
      setError(msg);
      setPhase("error");
      // Recreate worker on next attempt so state is clean
      workerRef.current?.terminate();
      workerRef.current = null;
    }
  }

  if (!videoFormats.length || !bestAudio) return null;

  const isBusy = phase !== "idle" && phase !== "done" && phase !== "error";
  const qlabel = selectedVideo?.qualityLabel ?? selectedVideo?.quality ?? "";

  return (
    <div className="mb-4 rounded-xl border border-purple-500/30 bg-purple-500/5 p-4">
      <div className="flex items-center gap-2 mb-2">
        <svg className="w-4 h-4 text-purple-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/>
          <path d="M2 17l10 5 10-5"/>
          <path d="M2 12l10 5 10-5"/>
        </svg>
        <span className="text-sm font-semibold text-purple-300">Smart Merge</span>
        <span className="text-xs bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded px-1.5 py-0.5 ml-auto">
          in-browser · no upload
        </span>
      </div>

      <p className="text-xs text-muted mb-3 leading-relaxed">
        Full-quality video with audio — up to{" "}
        <span className="text-purple-300">
          {videoFormats[0]?.qualityLabel ?? videoFormats[0]?.quality ?? "4K"}
        </span>.
      </p>

      <div className="flex gap-2 items-center flex-wrap">
        <select
          value={selectedItag}
          onChange={e => setSelectedItag(Number(e.target.value))}
          disabled={isBusy}
          className="bg-card border border-border text-sm text-text rounded-lg px-3 py-2 flex-1 min-w-0 disabled:opacity-50"
          style={{ maxWidth: 230 }}
        >
          {videoFormats.slice(0, 14).map(f => {
            const mb  = f.contentLength ? `~${Math.round(parseInt(f.contentLength) / 1024 / 1024)}MB` : "";
            const fps = f.fps && f.fps > 30 ? ` @ ${f.fps}fps` : "";
            const lbl = (f.qualityLabel ?? f.quality ?? String(f.itag)) + fps;
            return (
              <option key={f.itag} value={f.itag}>
                {lbl}{mb ? `  (${mb} video)` : ""}
              </option>
            );
          })}
        </select>

        <span className="text-xs text-muted">+ best audio</span>

        <button
          onClick={handleMerge}
          disabled={isBusy}
          className="shrink-0 px-4 py-2 rounded-lg text-sm font-semibold text-white flex items-center gap-2 disabled:opacity-60 transition-colors"
          style={{ background: isBusy ? "#7c3aed80" : "#7c3aed" }}
          onMouseEnter={e => { if (!isBusy) (e.currentTarget as HTMLButtonElement).style.background = "#6d28d9"; }}
          onMouseLeave={e => { if (!isBusy) (e.currentTarget as HTMLButtonElement).style.background = "#7c3aed"; }}
        >
          {isBusy ? (
            <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/>
              <path d="M12 2a10 10 0 0 1 10 10"/>
            </svg>
          ) : phase === "done" ? (
            <svg className="w-3.5 h-3.5 text-green-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          )}
          {isBusy ? "Working..."
            : phase === "done" ? "Saved!"
            : `Merge & Download ${qlabel}`}
        </button>
      </div>

      {(statusMsg || phase === "error") && (
        <div className="mt-3 space-y-1.5">
          {phase !== "idle" && phase !== "error" && (
            <div className="w-full bg-border rounded-full h-1.5 overflow-hidden">
              <div
                className="h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${progress}%`, background: phase === "done" ? "#22c55e" : "#7c3aed" }}
              />
            </div>
          )}
          <p className={`text-xs ${
            phase === "error" ? "text-red-400"
            : phase === "done" ? "text-green-400"
            : "text-muted"
          }`}>
            {phase === "error" ? `Error: ${error}` : statusMsg}
          </p>
        </div>
      )}
    </div>
  );
}
