"use client";

import { useState, useCallback, useRef } from "react";
import SplashScreen from "@/components/SplashScreen";
import Header from "@/components/Header";
import VideoCard from "@/components/VideoCard";
import FormatList from "@/components/FormatList";
import type { VideoInfo } from "@/lib/innertube";

export default function Home() {
  const [splashDone, setSplashDone] = useState(false);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFetch = useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch");
      setInfo(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [url]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleFetch();
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.includes("youtube.com") || text.includes("youtu.be")) {
        setUrl(text.trim());
      }
    } catch {
      // clipboard not available
    }
  };

  return (
    <>
      {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}
      <div className={`min-h-screen flex flex-col transition-opacity duration-500 ${splashDone ? "opacity-100" : "opacity-0"}`}>
        <div className="grain" />
        <div className="scan-line" />

        {/* Ambient glows */}
        <div className="fixed top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full bg-accent/5 blur-3xl pointer-events-none" />
        <div className="fixed bottom-1/4 left-1/4 w-[400px] h-[200px] rounded-full bg-gold/3 blur-3xl pointer-events-none" />

        <Header />

        <main className="relative z-10 flex-1 max-w-2xl mx-auto w-full px-6 py-12">
          {/* Hero */}
          <div className="text-center mb-10 animate-fade-in">
            <div className="inline-flex items-center gap-2 text-xs text-muted bg-card border border-border rounded-full px-4 py-1.5 mb-6 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              Zero dependencies · All formats · Free forever
            </div>
            <h1 className="text-5xl font-black tracking-tight text-text mb-4 leading-none">
              Download any<br />
              <span className="text-accent">YouTube</span> video/Music
            </h1>
            <p className="text-sub text-base max-w-md mx-auto leading-relaxed">
              Paste a URL below. Get every available format — MP4, WebM, M4A — direct from YouTube&apos;s servers.
            </p>
          </div>

          {/* Input area */}
          <div className="relative animate-slide-up" style={{ animationDelay: "0.1s" }}>
            <div className="gradient-border p-4">
              <div className="flex gap-3 items-center">
                {/* YouTube icon */}
                <div className="shrink-0 text-muted">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                  </svg>
                </div>

                {/* Input */}
                <input
                  ref={inputRef}
                  type="url"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="input-glow flex-1 bg-transparent text-text text-sm placeholder:text-muted border border-border rounded-lg px-3 py-2.5 transition-all font-mono"
                />

                {/* Paste btn */}
                <button
                  onClick={handlePaste}
                  title="Paste from clipboard"
                  className="shrink-0 text-muted hover:text-text transition-colors p-2 rounded-lg hover:bg-surface"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Get button */}
            <button
              onClick={handleFetch}
              disabled={loading || !url.trim()}
              className="btn-primary w-full mt-3 py-3.5 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2.5"
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                    <path d="M12 2a10 10 0 0 1 10 10" />
                  </svg>
                  Fetching video info...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  Analyze &amp; Get Formats
                </>
              )}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="mt-5 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm flex items-start gap-3 animate-fade-in">
              <svg className="w-4 h-4 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {error}
            </div>
          )}

          {/* Results */}
          {info && (
            <div className="mt-8 space-y-2">
              <VideoCard info={info} />
              <FormatList info={info} />
            </div>
          )}

          {/* Empty state */}
          {!info && !error && !loading && (
            <div className="mt-16 text-center animate-fade-in" style={{ animationDelay: "0.3s" }}>
              <div className="flex justify-center gap-6 text-sub/50 text-xs mb-8">
                {["MP4", "WebM", "M4A", "4K", "1080p", "720p"].map(f => (
                  <span key={f} className="font-mono">{f}</span>
                ))}
              </div>
              <p className="text-muted text-sm">
                Supports youtube.com, youtu.be, shorts, and embeds
              </p>
            </div>
          )}
        </main>

        {/* Footer */}
        <footer className="relative z-10 border-t border-border/40 py-6">
          <div className="max-w-2xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted">
            <span>Built by <a href="https://github.com/Krainium" className="text-sub hover:text-text transition-colors">Krainium</a></span>
            <a
              href="https://github.com/Krainium/youtube"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 hover:text-text transition-colors"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
              </svg>
              Krainium/youtube
            </a>
          </div>
        </footer>
      </div>
    </>
  );
}
