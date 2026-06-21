"use client";

import { useEffect, useState } from "react";

export default function SplashScreen({ onDone }: { onDone: () => void }) {
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<"loading" | "done">("loading");

  useEffect(() => {
    let p = 0;
    const interval = setInterval(() => {
      p += Math.random() * 18 + 8;
      if (p >= 100) {
        p = 100;
        clearInterval(interval);
        setPhase("done");
        setTimeout(onDone, 600);
      }
      setProgress(Math.min(p, 100));
    }, 90);
    return () => clearInterval(interval);
  }, [onDone]);

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-bg transition-opacity duration-700 ${phase === "done" ? "opacity-0 pointer-events-none" : "opacity-100"}`}
    >
      <div className="grain" />
      <div className="scan-line" />

      {/* Logo mark */}
      <div className="relative mb-10 select-none">
        <div className="absolute inset-0 blur-3xl rounded-full bg-accent/20 scale-150" />
        <svg width="80" height="80" viewBox="0 0 80 80" fill="none" className="relative z-10">
          <rect width="80" height="80" rx="20" fill="#12121f" stroke="#1e1e30" strokeWidth="1" />
          <polygon points="30,22 62,40 30,58" fill="#ff3b3b" />
          <rect x="14" y="32" width="6" height="16" rx="2" fill="#ff3b3b" opacity="0.6" />
        </svg>
      </div>

      {/* Title */}
      <h1 className="font-mono text-3xl sm:text-4xl font-black tracking-tight text-text mb-2 relative z-10 text-center px-4">
        <span className="text-accent">Youtube</span> Downloader
      </h1>
      <p className="text-sub text-xs tracking-[0.3em] uppercase mb-12 relative z-10">
        Free · No Sign-in · No Limits
      </p>

      {/* Progress bar */}
      <div className="relative z-10 w-64">
        <div className="h-px bg-border rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-accent to-gold transition-all duration-100 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-center mt-3 text-muted text-xs font-mono">
          {progress < 100 ? "Initializing engine..." : "Ready"}
        </p>
      </div>

      {/* Corner decorations */}
      <div className="absolute top-6 left-6 w-8 h-8 border-l border-t border-accent/30" />
      <div className="absolute top-6 right-6 w-8 h-8 border-r border-t border-accent/30" />
      <div className="absolute bottom-6 left-6 w-8 h-8 border-l border-b border-accent/30" />
      <div className="absolute bottom-6 right-6 w-8 h-8 border-r border-b border-accent/30" />
    </div>
  );
}
