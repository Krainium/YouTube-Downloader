"use client";

export default function Header() {
  return (
    <header className="relative z-10 border-b border-border/60 bg-surface/80 backdrop-blur-xl sticky top-0">
      <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 blur-md bg-accent/30 rounded-lg" />
            <svg width="36" height="36" viewBox="0 0 80 80" fill="none" className="relative z-10">
              <rect width="80" height="80" rx="18" fill="#12121f" stroke="#1e1e30" strokeWidth="1" />
              <polygon points="30,22 62,40 30,58" fill="#ff3b3b" />
              <rect x="14" y="32" width="6" height="16" rx="2" fill="#ff3b3b" opacity="0.6" />
            </svg>
          </div>
          <div>
            <span className="font-mono text-xl font-black tracking-wider">
              <span className="text-accent">YT</span>DL
            </span>
            <span className="hidden sm:inline text-muted text-xs ml-2 font-mono">v2.0</span>
          </div>
        </div>

        {/* Title / nav */}
        <div className="hidden md:flex items-center gap-6 text-sm">
          <a
            href="https://github.com/Krainium/youtube"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sub hover:text-text transition-colors flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
            </svg>
            Source
          </a>
        </div>

        {/* Status pill */}
        <div className="flex items-center gap-2 text-xs text-sub">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="hidden sm:inline">Online</span>
        </div>
      </div>
    </header>
  );
}
