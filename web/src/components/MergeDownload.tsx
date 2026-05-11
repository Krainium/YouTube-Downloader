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

// Fetch a URL and return its bytes — replaces @ffmpeg/util fetchFile
async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching stream`);
  return new Uint8Array(await res.arrayBuffer());
}

// Load the UMD build of @ffmpeg/ffmpeg via a plain <script> tag.
// This completely bypasses Next.js webpack so no Worker bundling issues occur.
// The UMD build auto-loads its worker chunk from the same directory (/814.ffmpeg.js).
async function loadFFmpegUMD(): Promise<unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const win = window as any;
  if (!win.FFmpegWASM) {
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "/ffmpeg.js";
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Failed to load /ffmpeg.js"));
      document.head.appendChild(s);
    });
  }
  return win.FFmpegWASM;
}

export default function MergeDownload({ info, videoFormats, audioFormats }: Props) {
  const [selectedItag, setSelectedItag] = useState<number>(videoFormats[0]?.itag ?? 0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState("");
  const [error, setError] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ffmpegRef = useRef<any>(null);

  const bestAudio = audioFormats[0];
  const selectedVideo = videoFormats.find(f => f.itag === selectedItag) ?? videoFormats[0];

  async function handleMerge() {
    if (!selectedVideo?.url || !bestAudio?.url) return;
    setPhase("loading-ffmpeg");
    setProgress(0);
    setError(null);
    setStatusMsg("Loading ffmpeg engine...");

    try {
      // Load UMD build — no webpack, no blob URLs, no CSP issues
      const FFmpegWASM = await loadFFmpegUMD() as { FFmpeg: new () => unknown };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ffmpeg: any = ffmpegRef.current ?? new FFmpegWASM.FFmpeg();

      if (!ffmpeg.loaded) {
        ffmpeg.on("progress", ({ progress: p }: { progress: number }) => {
          setProgress(Math.min(99, Math.round(p * 100)));
        });

        setStatusMsg("Loading ffmpeg engine (cached after first use)...");
        const origin = window.location.origin;
        await ffmpeg.load({
          // Proxy our own-origin URLs — worker uses importScripts() on these
          coreURL: `${origin}/api/ffmpeg-core?file=ffmpeg-core.js`,
          wasmURL: `${origin}/api/ffmpeg-core?file=ffmpeg-core.wasm`,
        });
        ffmpegRef.current = ffmpeg;
      } else {
        ffmpegRef.current = ffmpeg;
      }

      const proxied = info.proxied ? "1" : "0";

      const videoMB = selectedVideo.contentLength
        ? Math.round(parseInt(selectedVideo.contentLength) / 1024 / 1024)
        : "?";
      const audioMB = bestAudio.contentLength
        ? Math.round(parseInt(bestAudio.contentLength) / 1024 / 1024)
        : "?";

      setPhase("fetching-video");
      setStatusMsg(`Fetching video stream (~${videoMB} MB)...`);
      const videoProxy = `/api/stream?url=${encodeURIComponent(selectedVideo.url)}&filename=video.mp4&proxied=${proxied}`;
      await ffmpeg.writeFile("video.mp4", await fetchBytes(videoProxy));

      setPhase("fetching-audio");
      setStatusMsg(`Fetching audio stream (~${audioMB} MB)...`);
      const audioProxy = `/api/stream?url=${encodeURIComponent(bestAudio.url)}&filename=audio.m4a&proxied=${proxied}`;
      await ffmpeg.writeFile("audio.m4a", await fetchBytes(audioProxy));

      setPhase("merging");
      setStatusMsg("Muxing streams...");
      await ffmpeg.exec([
        "-i", "video.mp4",
        "-i", "audio.m4a",
        "-c:v", "copy",
        "-c:a", "copy",
        "-movflags", "+faststart",
        "-y",
        "output.mp4",
      ]);

      const data: Uint8Array = await ffmpeg.readFile("output.mp4");
      const ab = new Uint8Array(data).buffer as ArrayBuffer;
      const blob = new Blob([ab], { type: "video/mp4" });
      const blobUrl = URL.createObjectURL(blob);
      const safeName = info.title.replace(/[^a-zA-Z0-9 _-]/g, "").slice(0, 60).trim();
      const label = selectedVideo.qualityLabel ?? selectedVideo.quality ?? String(selectedVideo.itag);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `${safeName} [${label}].mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);

      await ffmpeg.deleteFile("video.mp4").catch(() => {});
      await ffmpeg.deleteFile("audio.m4a").catch(() => {});
      await ffmpeg.deleteFile("output.mp4").catch(() => {});

      setProgress(100);
      setPhase("done");
      setStatusMsg("Saved to your downloads folder!");
      setTimeout(() => { setPhase("idle"); setProgress(0); setStatusMsg(""); }, 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("MergeDownload error:", err);
      setError(msg);
      setPhase("error");
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
            const mb = f.contentLength ? `~${Math.round(parseInt(f.contentLength) / 1024 / 1024)}MB` : "";
            const fps = f.fps && f.fps > 30 ? ` @ ${f.fps}fps` : "";
            const label = (f.qualityLabel ?? f.quality ?? String(f.itag)) + fps;
            return (
              <option key={f.itag} value={f.itag}>
                {label}{mb ? `  (${mb} video)` : ""}
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
          {isBusy
            ? "Working..."
            : phase === "done"
            ? "Saved!"
            : `Merge & Download ${qlabel}`}
        </button>
      </div>

      {(statusMsg || phase === "error") && (
        <div className="mt-3 space-y-1.5">
          {(phase === "merging" || phase === "done") && (
            <div className="w-full bg-border rounded-full h-1.5 overflow-hidden">
              <div
                className="h-1.5 rounded-full transition-all duration-500"
                style={{
                  width: `${progress}%`,
                  background: phase === "done" ? "#22c55e" : "#7c3aed",
                }}
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
