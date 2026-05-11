"use client";

import Image from "next/image";
import type { VideoInfo } from "@/lib/innertube";
import { humanDuration, humanViews } from "@/lib/innertube";

interface Props {
  info: VideoInfo;
}

function formatPublishDate(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const d = new Date(raw);
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return raw;
  }
}

export default function VideoCard({ info }: Props) {
  const duration = humanDuration(parseInt(info.lengthSeconds || "0"));
  // viewCount may be a pre-formatted string ("6,570 views") or a raw number.
  const rawVC = info.viewCount || "0";
  const views = /\D/.test(rawVC)
    ? rawVC                                          // already formatted by next API
    : humanViews(parseInt(rawVC)) + " views";        // format raw numeric fallback
  // publishDate from next API is already human-readable ("May 10, 2026").
  // Fall back to ISO date formatting if it looks like "YYYY-MM-DD".
  const publishDate = info.publishDate
    ? (/^\d{4}-\d{2}-\d{2}/.test(info.publishDate)
        ? formatPublishDate(info.publishDate)
        : info.publishDate)
    : null;

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
          <div className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-xs font-mono px-1.5 py-0.5 rounded">
            {duration}
          </div>
        </div>

        {/* Meta */}
        <div className="flex-1 min-w-0">
          <h2 className="text-text font-semibold text-base leading-snug line-clamp-2 mb-1">
            {info.title}
          </h2>
          <p className="text-sub text-sm mb-3">{info.author}</p>

          <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
            {/* Views */}
            <div className="flex items-center gap-1.5 text-muted">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              {views} views
            </div>

            {/* Duration */}
            <div className="flex items-center gap-1.5 text-muted">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              {duration}
            </div>

            {/* Subscribers */}
            {info.subscriberCount && (
              <div className="flex items-center gap-1.5 text-muted">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                {info.subscriberCount}
              </div>
            )}

            {/* Comments */}
            {info.commentCount && (
              <div className="flex items-center gap-1.5 text-muted">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                {info.commentCount} comments
              </div>
            )}

            {/* Publish date */}
            {publishDate && (
              <div className="flex items-center gap-1.5 text-muted">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                {publishDate}
              </div>
            )}

            {/* Format count */}
            <div className="flex items-center gap-1.5 text-muted">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="21 8 21 21 3 21 3 8" />
                <rect x="1" y="3" width="22" height="5" />
                <line x1="10" y1="12" x2="14" y2="12" />
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
