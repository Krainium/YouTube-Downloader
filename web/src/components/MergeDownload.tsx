"use client";

import { useRef, useState, useMemo } from "react";
import type { VideoFormat, VideoInfo } from "@/lib/innertube";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

interface Props {
  info: VideoInfo;
  videoFormats: VideoFormat[];
  /** All audio formats including every dubbed language — caller passes the full set. */
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
interface WorkerReply {
  id?: string;
  ok?: boolean;
  data?: unknown;
  error?: string;
  type?: string;
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
      if (msg.type === "progress") { this.onProgress?.(msg.ratio ?? 0); return; }
      if (msg.type === "log") return;
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

  async load(coreURL: string, wasmURL: string) { await this.send("load", { coreURL, wasmURL }); }
  async exec(args: string[])                    { await this.send("exec", { args }); }
  async write(path: string, data: Uint8Array)   { await this.send("write", { path, data }, [data.buffer]); }
  async read(path: string): Promise<Uint8Array> { return this.send("read", { path }) as Promise<Uint8Array>; }
  async del(path: string)                       { await this.send("delete", { path }).catch(() => {}); }
  terminate()                                   { this.w.terminate(); }
}

// ── Byte fetcher ──────────────────────────────────────────────────────────
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

// ── Language grouping ─────────────────────────────────────────────────────
// One entry per language; bestTrack = highest-bitrate stream for that language.
interface AudioLang {
  id: string;
  displayName: string;
  isDefault: boolean;
  bestTrack: VideoFormat;
}

function buildLangGroups(audioFormats: VideoFormat[]): AudioLang[] {
  const groups = new Map<string, AudioLang>();
  for (const f of audioFormats) {
    if (!f.url) continue;
    const id          = f.audioTrack?.id ?? "original";
    const displayName = f.audioTrack?.displayName ?? "Original";
    const isDefault   = f.audioTrack?.audioIsDefault ?? true;
    const existing    = groups.get(id);
    if (!existing || (f.bitrate ?? 0) > (existing.bestTrack.bitrate ?? 0)) {
      groups.set(id, { id, displayName, isDefault, bestTrack: f });
    }
  }
  // Default language first, then alphabetically
  return Array.from(groups.values()).sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    return a.displayName.localeCompare(b.displayName);
  });
}

// ── Component ─────────────────────────────────────────────────────────────
export default function MergeDownload({ info, videoFormats, audioFormats }: Props) {
  const langGroups    = useMemo(() => buildLangGroups(audioFormats), [audioFormats]);
  const defaultLangId = langGroups.find(g => g.isDefault)?.id ?? langGroups[0]?.id ?? "";

  const [selectedItag,   setSelectedItag]   = useState<number>(videoFormats[0]?.itag ?? 0);
  const [selectedLangId, setSelectedLangId] = useState<string>(defaultLangId);
  const [phase,          setPhase]          = useState<Phase>("idle");
  const [progress,       setProgress]       = useState(0);
  const [statusMsg,      setStatusMsg]      = useState("");
  const [error,          setError]          = useState<string | null>(null);
  const workerRef = useRef<FFWorker | null>(null);

  const hasDubbedTracks = langGroups.length > 1;
  const selectedVideo   = videoFormats.find(f => f.itag === selectedItag) ?? videoFormats[0];
  const selectedLang    = langGroups.find(g => g.id === selectedLangId) ?? langGroups[0];
  const selectedAudio   = selectedLang?.bestTrack;

  async function handleMerge() {
    if (!selectedVideo?.url || !selectedAudio?.url) return;
    setPhase("loading-ffmpeg");
    setProgress(0);
    setError(null);
    setStatusMsg("Loading ffmpeg engine...");

    try {
      if (!workerRef.current) workerRef.current = new FFWorker();
      const ff = workerRef.current;
      ff.onProgress = (ratio) => setProgress(Math.min(99, Math.round(ratio * 100)));

      const origin  = window.location.origin;
      const coreURL = `${origin}/api/ffmpeg-core?file=ffmpeg-core.js`;
      const wasmURL = `${origin}/api/ffmpeg-core?file=ffmpeg-core.wasm`;

      setStatusMsg("Loading ffmpeg engine (cached after first use)...");
      await ff.load(coreURL, wasmURL);

      const proxied  = info.proxied ? "1" : "0";
      // Pins both fetches to the exit that issued the URLs.
      const node     = info.node !== undefined ? `&node=${info.node}` : "";
      const videoMB  = selectedVideo.contentLength
        ? Math.round(parseInt(selectedVideo.contentLength) / 1024 / 1024) : "?";
      const audioMB  = selectedAudio.contentLength
        ? Math.round(parseInt(selectedAudio.contentLength) / 1024 / 1024) : "?";

      setPhase("fetching-video");
      setStatusMsg(`Fetching video (~${videoMB} MB)...`);
      const videoProxy = `${API_BASE}/api/stream?url=${encodeURIComponent(selectedVideo.url)}&filename=video.mp4&proxied=${proxied}${node}`;
      const videoBytes = await fetchBytes(videoProxy, p => {
        setProgress(Math.round(p * 50));
        setStatusMsg(`Fetching video (~${videoMB} MB)… ${Math.round(p * 100)}%`);
      });

      setPhase("fetching-audio");
      const langLabel = hasDubbedTracks ? ` [${selectedLang?.displayName ?? "audio"}]` : "";
      setStatusMsg(`Fetching audio${langLabel} (~${audioMB} MB)...`);
      const audioProxy = `${API_BASE}/api/stream?url=${encodeURIComponent(selectedAudio.url)}&filename=audio.m4a&proxied=${proxied}${node}`;
      const audioBytes = await fetchBytes(audioProxy, p => {
        setProgress(50 + Math.round(p * 10));
        setStatusMsg(`Fetching audio${langLabel} (~${audioMB} MB)… ${Math.round(p * 100)}%`);
      });

      setPhase("merging");
      setStatusMsg("Writing files to ffmpeg...");
      setProgress(62);
      await ff.write("video.mp4", videoBytes);
      await ff.write("audio.m4a", audioBytes);

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

      setProgress(90);
      setStatusMsg("Saving file...");
      const out  = await ff.read("output.mp4");
      const blob = new Blob([new Uint8Array(out).buffer as ArrayBuffer], { type: "video/mp4" });
      const blobUrl = URL.createObjectURL(blob);
      const safe  = info.title.replace(/[^a-zA-Z0-9 _-]/g, "").slice(0, 60).trim();
      const lbl   = selectedVideo.qualityLabel ?? selectedVideo.quality ?? String(selectedVideo.itag);
      const lang  = hasDubbedTracks ? ` [${selectedLang?.displayName ?? ""}]` : "";
      const a     = document.createElement("a");
      a.href = blobUrl; a.download = `${safe} [${lbl}]${lang}.mp4`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);

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
      workerRef.current?.terminate();
      workerRef.current = null;
    }
  }

  if (!videoFormats.length || !selectedAudio) return null;

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
        {hasDubbedTracks && (
          <span className="text-purple-300/70"> {langGroups.length} audio languages available.</span>
        )}
      </p>

      <div className="flex flex-col gap-2">
        {/* Row 1: video quality + merge button */}
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

          <span className="text-xs text-muted shrink-0">+</span>

          {/* Audio language selector — always visible; one option for non-dubbed, all languages for dubbed */}
          <select
            value={selectedLangId}
            onChange={e => setSelectedLangId(e.target.value)}
            disabled={isBusy || !hasDubbedTracks}
            aria-label="Audio language"
            className={`text-sm rounded-lg px-3 py-2 flex-1 min-w-0 disabled:opacity-70 ${
              hasDubbedTracks
                ? "bg-card border border-purple-500/50 text-purple-200"
                : "bg-card border border-border text-muted"
            }`}
            style={{ maxWidth: 230 }}
          >
            {hasDubbedTracks ? (
              langGroups.map(g => (
                <option key={g.id} value={g.id}>
                  {g.displayName}{g.isDefault ? " ✓" : ""}
                </option>
              ))
            ) : (
              <option value="original">Best audio</option>
            )}
          </select>

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

        {/* Language count hint */}
        {hasDubbedTracks && (
          <p className="text-xs text-purple-400/60">
            {langGroups.length} audio languages available — select one above
          </p>
        )}
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
