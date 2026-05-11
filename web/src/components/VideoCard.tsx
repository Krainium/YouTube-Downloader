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
  const rawVC = info.viewCount || "0";
  const views = /\D/.test(rawVC)
    ? rawVC
    : humanViews(parseInt(rawVC)) + " views";
  const publishDate = info.publishDate
    ? (/^\d{4}-\d{2}-\d{2}/.test(info.publishDate)
        ? formatPublishDate(info.publishDate)
        : info.publishDate)
    : null;

  return (
    <article className="gradient-border p-4 sm:p-5 animate-slide-up">
      <div className="flex gap-3 sm:gap-4 items-start">
        {/* Thumbnail — smaller on mobile to leave room for text */}
        <div className="relative shrink-0 rounded-lg overflow-hidden w-24 sm:w-40 aspect-video bg-surface">
          <Image
            src={info.thumbnail}
            alt={info.title}
            fill
            className="object-cover"
            unoptimized
            priority
          />
          <div className="absolute bottom-1 right-1 sm:bottom-1.5 sm:right-1.5 bg-black/80 text-white text-xs font-mono px-1.5 py-0.5 rounded">
            {duration}
          </div>
        </div>

        {/* Meta */}
        <div className="flex-1 min-w-0">
          <h2 className="text-text font-semibold text-sm sm:text-base leading-snug line-clamp-2 mb-1">
            {info.title}
          </h2>
          <p className="text-sub text-xs sm:text-sm mb-2 sm:mb-3 truncate">{info.author}</p>

          <div className="flex flex-wrap gap-x-3 sm:gap-x-4 gap-y-1.5 sm:gap-y-2 text-xs">
            {/* Views */}
            <div className="flex items-center gap-1 sm:gap-1.5 text-muted">
              <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <span>{views}</span>
            </div>

            {/* Duration */}
            <div className="flex items-center gap-1 sm:gap-1.5 text-muted">
              <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span>{duration}</span>
            </div>

            {/* Subscribers */}
            {info.subscriberCount && (
              <div className="flex items-center gap-1 sm:gap-1.5 text-muted">
                <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                <span>{info.subscriberCount}</span>
              </div>
            )}

            {/* Comments */}
            {info.commentCount && (
              <div className="hidden sm:flex items-center gap-1.5 text-muted">
                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <span>{info.commentCount} comments</span>
              </div>
            )}

            {/* Publish date */}
            {publishDate && (
              <div className="flex items-center gap-1 sm:gap-1.5 text-muted">
                <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                <span>{publishDate}</span>
              </div>
            )}

            {/* Format count */}
            <div className="flex items-center gap-1 sm:gap-1.5 text-muted">
              <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <polyline points="21 8 21 21 3 21 3 8" />
                <rect x="1" y="3" width="22" height="5" />
                <line x1="10" y1="12" x2="14" y2="12" />
              </svg>
              <span>{info.formats.length} formats</span>
            </div>
          </div>
        </div>
      </div>

      {info.description && (
        <p className="mt-3 sm:mt-4 text-sub text-xs leading-relaxed border-t border-border/50 pt-3 sm:pt-4 line-clamp-2">
          {info.description}
        </p>
      )}
    </article>
  );
}
