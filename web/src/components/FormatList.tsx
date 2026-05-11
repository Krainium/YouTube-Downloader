"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { VideoFormat, VideoInfo } from "@/lib/innertube";
import { humanSize, mimeToExt, getCodec } from "@/lib/innertube";

const MergeDownload = dynamic(() => import("./MergeDownload"), { ssr: false });

interface Props {
  info: VideoInfo;
}

type Tab = "muxed" | "video" | "audio";

function byQuality(a: VideoFormat, b: VideoFormat): number {
  const ha = a.height ?? 0, hb = b.height ?? 0;
  if (hb !== ha) return hb - ha;
  return (b.bitrate ?? 0) - (a.bitrate ?? 0);
}

export default function FormatList({ info }: Props) {
  const [tab, setTab] = useState<Tab>("muxed");
  const [downloading, setDownloading] = useState<number | null>(null);

  const muxedFormats = info.formats
    .filter(f => f.type === "muxed")
    .sort(byQuality);

  const videoOnlyFormats = info.formats
    .filter(f => f.type === "video")
    .sort(byQuality);

  const audioFormats = info.formats
    .filter(f => f.type === "audio")
    .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));

  const current =
    tab === "muxed" ? muxedFormats :
    tab === "video" ? videoOnlyFormats :
    audioFormats;

  async function handleDownload(fmt: VideoFormat) {
    if (!fmt.url) return;
    setDownloading(fmt.itag);
    try {
      const ext = mimeToExt(fmt.mimeType);
      const safeName = info.title.replace(/[^a-zA-Z0-9 _-]/g, "").slice(0, 60).trim();
      const filename = `${safeName}.${ext}`;
      const proxied = info.proxied ? "1" : "0";
      const proxyUrl =
        `/api/stream?url=${encodeURIComponent(fmt.url)}&filename=${encodeURIComponent(filename)}&proxied=${proxied}`;
      const a = document.createElement("a");
      a.href = proxyUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      setTimeout(() => setDownloading(null), 2000);
    }
  }

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "muxed", label: "Video + Audio", count: muxedFormats.length },
    { id: "video", label: "Video Only",    count: videoOnlyFormats.length },
    { id: "audio", label: "Audio Only",    count: audioFormats.length },
  ];

  return (
    <div className="mt-6 animate-slide-up" style={{ animationDelay: "0.2s" }}>
      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-card rounded-xl p-1 border border-border">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 text-sm py-2 px-3 rounded-lg font-medium transition-all ${
              tab === t.id
                ? "bg-accent text-white shadow-lg"
                : "text-sub hover:text-text"
            }`}
          >
            {t.label}
            <span className={`ml-1.5 text-xs ${tab === t.id ? "text-white/70" : "text-muted"}`}>
              ({t.count})
            </span>
          </button>
        ))}
      </div>

      {/* Video+Audio tab: Smart Merge panel + pre-muxed list */}
      {tab === "muxed" && (
        <>
          <MergeDownload
            info={info}
            videoFormats={videoOnlyFormats}
            audioFormats={audioFormats}
          />

          <p className="text-xs text-muted mb-3 px-1 leading-relaxed">
            Pre-combined files below — YouTube only encodes these up to{" "}
            <span className="text-sub">360p</span>. For 720p–4K with audio use{" "}
            <strong className="text-purple-300">Smart Merge</strong> above, or download{" "}
            <button onClick={() => setTab("video")} className="text-accent hover:underline">Video Only</button>
            {" "}+{" "}
            <button onClick={() => setTab("audio")} className="text-accent hover:underline">Audio Only</button>
            {" "}and combine in any video editor.
          </p>
        </>
      )}

      {tab === "video" && (
        <p className="text-xs text-muted mb-3 px-1 leading-relaxed">
          Video stream only — <span className="text-yellow-400">no audio track</span>.
          Use <strong className="text-purple-300">Video + Audio → Smart Merge</strong> for a ready-to-play file,
          or download an{" "}
          <button onClick={() => setTab("audio")} className="text-accent hover:underline">Audio Only</button>{" "}
          file separately and merge them.
        </p>
      )}

      {tab === "audio" && (
        <p className="text-xs text-muted mb-3 px-1 leading-relaxed">
          Audio stream only. Works great for music, podcasts, or as the audio track to pair
          with a{" "}
          <button onClick={() => setTab("video")} className="text-accent hover:underline">Video Only</button>{" "}
          download. For a complete video file use{" "}
          <button onClick={() => setTab("muxed")} className="text-purple-300 hover:underline">Smart Merge</button>.
        </p>
      )}

      {/* Format cards */}
      <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
        {current.length === 0 && (
          <p className="text-center text-muted text-sm py-8">No formats in this category</p>
        )}
        {current.map(fmt => {
          const ext = mimeToExt(fmt.mimeType);
          const codec = getCodec(fmt.mimeType);
          const size = fmt.contentLength ? humanSize(parseInt(fmt.contentLength)) : null;
          const isLoading = downloading === fmt.itag;

          return (
            <div key={fmt.itag} className="format-card rounded-xl p-4 bg-card flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {(fmt.qualityLabel || fmt.quality) && (
                    <span className="text-xs font-mono font-bold text-accent border border-accent/30 rounded px-1.5 py-0.5">
                      {fmt.qualityLabel || fmt.quality}
                    </span>
                  )}
                  <span className="text-xs text-gold font-mono uppercase">.{ext}</span>
                  {codec && <span className="text-xs text-muted">{codec}</span>}
                  {fmt.fps && fmt.fps > 0 && (
                    <span className="text-xs text-muted">{fmt.fps}fps</span>
                  )}
                  {fmt.type === "muxed" && (
                    <span className="text-xs bg-green-500/10 text-green-400 border border-green-500/20 rounded px-1.5 py-0.5">
                      +audio
                    </span>
                  )}
                  {fmt.type === "video" && (
                    <span className="text-xs bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 rounded px-1.5 py-0.5">
                      video only
                    </span>
                  )}
                  {fmt.type === "audio" && (
                    <span className="text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded px-1.5 py-0.5">
                      audio only
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1">
                  {size && <span className="text-xs text-sub font-mono">{size}</span>}
                  {fmt.bitrate && (
                    <span className="text-xs text-sub font-mono">
                      {fmt.bitrate >= 1000000
                        ? `${(fmt.bitrate / 1000000).toFixed(1)} Mbps`
                        : `${Math.round(fmt.bitrate / 1000)} kbps`}
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={() => handleDownload(fmt)}
                disabled={isLoading || !fmt.url}
                className="btn-primary shrink-0 px-4 py-2 rounded-lg text-sm font-medium text-white flex items-center gap-2 disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                      <path d="M12 2a10 10 0 0 1 10 10" />
                    </svg>
                    Starting...
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Download
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
