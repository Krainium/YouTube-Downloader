"use client";

import Image from "next/image";
import type { VideoInfo } from "@/lib/innertube";
import { humanDuration, humanViews } from "@/lib/innertube";

interface Props {
  info: VideoInfo;
}

export default function VideoCard({ info }: Props) {
  const duration = humanDuration(parseInt(info.lengthSeconds || "0"));
  const views = humanViews(parseInt(info.viewCount || "0"));

  return (
    <div className="gradient-border p-5 animate-slide-up">
      <div className="flex gap-4 items-start">
        {/* Thumbnail */}
        <div className="relative shrink-0 rounded-lg overflow-hidden w-40 aspect-video bg-surface">
          <Image
            src={info.thumbnail}
            alt={info.title}
            fill
            className="object-cover"
            unoptimized
          />
          {/* Duration overlay */}
          <div className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-xs font-mono px-1.5 py-0.5 rounded">
            {duration}
          </div>
        </div>

        {/* Meta */}
        <div className="flex-1 min-w-0">
          <h2 className="text-text font-semibold text-base leading-snug line-clamp-2 mb-2">
            {info.title}
          </h2>
          <p className="text-sub text-sm mb-3">{info.author}</p>

          <div className="flex flex-wrap gap-3 text-xs">
            <div className="flex items-center gap-1.5 text-muted">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              {views} views
            </div>
            <div className="flex items-center gap-1.5 text-muted">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              {duration}
            </div>
            <div className="flex items-center gap-1.5 text-muted">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              {info.formats.length} formats
            </div>
          </div>
        </div>
      </div>

      {info.description && (
        <p className="mt-4 text-sub text-xs leading-relaxed border-t border-border/50 pt-4 line-clamp-2">
          {info.description}
        </p>
      )}
    </div>
  );
}
