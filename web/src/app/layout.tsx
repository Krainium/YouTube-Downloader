import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "YTDL — YouTube Downloader",
  description: "Download any YouTube video or audio in full quality — no sign-in, no limits. Free forever.",
  keywords: ["youtube downloader", "download youtube video", "mp4", "mp3", "audio downloader", "free"],
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
  openGraph: {
    title: "YTDL — YouTube Downloader",
    description: "Download any YouTube video or audio in full quality. Free, fast, no limits.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
