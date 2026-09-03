"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { VideoFormat, VideoInfo } from "@/lib/innertube";
import { humanSize, mimeToExt, getCodec } from "@/lib/innertube";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

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

  // All audio formats including every dubbed language — passed to Smart Merge
  // so users can pick which language to mux with the video.
  const allAudioFormats = info.formats
    .filter(f => f.type === "audio")
    .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));

  // Audio Only tab shows only the original/default-language tracks to keep it clean.
  const audioFormats = allAudioFormats
    .filter(f => !f.audioTrack || f.audioTrack.audioIsDefault);

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
      // Pins the download to the exit that issued the URL.
      const node = info.node !== undefined ? `&node=${info.node}` : "";
      const proxyUrl =
        `${API_BASE}/api/stream?url=${encodeURIComponent(fmt.url)}&filename=${encodeURIComponent(filename)}&proxied=${proxied}${node}`;
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

  const tabs: { id: Tab; label: string; shortLabel: string; count: number }[] = [
    { id: "muxed", label: "Video + Audio", shortLabel: "V+A",   count: muxedFormats.length },
    { id: "video", label: "Video Only",    shortLabel: "Video", count: videoOnlyFormats.length },
    { id: "audio", label: "Audio Only",    shortLabel: "Audio", count: audioFormats.length },
  ];

  return (
    <div className="mt-4 sm:mt-6 animate-slide-up" style={{ animationDelay: "0.2s" }}>
      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-card rounded-xl p-1 border border-border" role="tablist" aria-label="Format categories">
        {tabs.map(t => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 text-xs sm:text-sm py-2 px-1 sm:px-3 rounded-lg font-medium transition-all min-h-[44px] ${
              tab === t.id
                ? "bg-accent text-white shadow-lg"
                : "text-sub hover:text-text"
            }`}
          >
            {/* Show short label on very small screens */}
            <span className="sm:hidden">{t.shortLabel}</span>
            <span className="hidden sm:inline">{t.label}</span>
            <span className={`ml-1 sm:ml-1.5 text-xs ${tab === t.id ? "text-white/70" : "text-muted"}`}>
              ({t.count})
            </span>
          </button>
        ))}
      </div>

      {/* Video+Audio tab: Smart Merge panel + pre-muxed list */}
      {tab === "muxed" && (
        <>
          {videoOnlyFormats.length > 0 ? (
            <MergeDownload
              info={info}
              videoFormats={videoOnlyFormats}
              audioFormats={allAudioFormats}
            />
          ) : (
            <div className="mb-4 rounded-xl border border-border bg-card/50 p-4 text-center">
              <p className="text-sm text-muted">
                Smart Merge unavailable — YouTube hasn&apos;t provided separate video and audio streams for this video.
              </p>
              <p className="text-xs text-muted/60 mt-1">
                This is common for new uploads or some channel types. Only the pre-combined file below is available.
              </p>
            </div>
          )}

          <p className="text-xs text-muted mb-3 px-1 leading-relaxed">
            {videoOnlyFormats.length > 0
              ? <>Or grab a pre-combined file below (up to <span className="text-sub">360p</span>).</>
              : <>Pre-combined file (up to <span className="text-sub">360p</span>):</>
            }
          </p>
        </>
      )}

      {tab === "video" && (
        <p className="text-xs text-muted mb-3 px-1 leading-relaxed">
          Video stream only — <span className="text-yellow-400">no audio</span>.
          Use <button onClick={() => setTab("muxed")} className="text-purple-300 hover:underline">Smart Merge</button> for a complete file.
        </p>
      )}

      {tab === "audio" && (
        <p className="text-xs text-muted mb-3 px-1 leading-relaxed">
          Audio only. Use <button onClick={() => setTab("muxed")} className="text-purple-300 hover:underline">Smart Merge</button> for video+audio.
        </p>
      )}

      {/* Format cards */}
      <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1 -mr-1" role="tabpanel">
        {current.length === 0 && (
          <p className="text-center text-muted text-sm py-8">No formats in this category</p>
        )}
        {current.map(fmt => {
          const ext = mimeToExt(fmt.mimeType);
          const codec = getCodec(fmt.mimeType);
          const size = fmt.contentLength ? humanSize(parseInt(fmt.contentLength)) : null;
          const isLoading = downloading === fmt.itag;
          // Unique key: itag alone isn't unique when dubbed tracks share it
          const fmtKey = `${fmt.itag}-${fmt.audioTrack?.id ?? ""}`;

          return (
            <div key={fmtKey} className="format-card rounded-xl p-3 sm:p-4 bg-card flex items-center justify-between gap-3 sm:gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
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
                    <span className="text-xs bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 rounded px-1.5 py-0.5 hidden sm:inline">
                      video only
                    </span>
                  )}
                  {fmt.type === "audio" && (
                    <span className="text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded px-1.5 py-0.5 hidden sm:inline">
                      audio only
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 sm:gap-3 mt-1">
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
                aria-label={`Download ${fmt.qualityLabel || fmt.quality || fmt.itag} ${ext}`}
                className="btn-primary shrink-0 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium text-white flex items-center gap-1.5 sm:gap-2 disabled:opacity-50 min-h-[44px]"
              >
                {isLoading ? (
                  <>
                    <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                      <path d="M12 2a10 10 0 0 1 10 10" />
                    </svg>
                    <span className="hidden sm:inline">Starting...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
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
