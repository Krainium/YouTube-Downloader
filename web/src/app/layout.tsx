import type { Metadata, Viewport } from "next";
import "./globals.css";

const SITE_URL = "https://ytdl-web-zeta.vercel.app";
const SITE_NAME = "YTDL — YouTube Downloader";
const DESCRIPTION =
  "Download any YouTube video or audio in full quality — MP4 up to 4K, M4A, WebM. Free, no sign-in, no limits. Works on Android, iPhone, PC and Mac.";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#080810",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: `%s | YTDL`,
  },
  description: DESCRIPTION,
  keywords: [
    "youtube downloader",
    "download youtube video",
    "download youtube mp4",
    "youtube to mp3",
    "youtube to mp4",
    "youtube audio downloader",
    "download youtube 4k",
    "download youtube 1080p",
    "free youtube downloader",
    "online youtube downloader",
    "youtube video download no signup",
    "youtube downloader mobile",
    "youtube downloader android",
    "youtube downloader iphone",
    "ytdl",
    "yt-dlp web",
    "youtube shorts downloader",
    "download youtube music",
    "best youtube downloader 2025",
  ],
  authors: [{ name: "Krainium", url: "https://github.com/Krainium" }],
  creator: "Krainium",
  publisher: "YTDL",
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: DESCRIPTION,
    images: [
      {
        url: `${SITE_URL}/og-image.svg`,
        width: 1200,
        height: 630,
        alt: "YTDL — Free YouTube Video Downloader",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: DESCRIPTION,
    images: [`${SITE_URL}/og-image.svg`],
    creator: "@Krainium",
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
  manifest: "/manifest.json",
  category: "technology",
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebApplication",
      "@id": `${SITE_URL}/#webapp`,
      name: "YTDL",
      url: SITE_URL,
      description: DESCRIPTION,
      applicationCategory: "MultimediaApplication",
      operatingSystem: "All — Windows, macOS, Linux, Android, iOS",
      browserRequirements: "Requires JavaScript. Works in Chrome, Firefox, Safari, Edge.",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
      },
      featureList: [
        "Download YouTube videos up to 4K (2160p)",
        "Download YouTube audio as M4A or WebM",
        "In-browser Smart Merge — no server upload needed",
        "No sign-in or account required",
        "Supports youtube.com, youtu.be, Shorts, and embeds",
        "Works on Android, iPhone, tablet, and desktop",
        "MP4, WebM, M4A formats",
        "Up to 107 formats per video",
      ],
      screenshot: `${SITE_URL}/og-image.svg`,
      isAccessibleForFree: true,
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: "YTDL",
      description: DESCRIPTION,
      publisher: { "@id": `${SITE_URL}/#webapp` },
      potentialAction: {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/?url={youtube_url}` },
        "query-input": "required name=youtube_url",
      },
    },
    {
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "How do I download a YouTube video?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Paste the YouTube video URL into the input field and click 'Analyze & Get Formats'. Choose your preferred quality and format, then click Download.",
          },
        },
        {
          "@type": "Question",
          name: "Can I download YouTube videos in 1080p or 4K?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. Use the Video + Audio tab and click 'Smart Merge' to select up to 1080p (or higher if available). Smart Merge downloads the video and audio streams separately and merges them in your browser — no upload required.",
          },
        },
        {
          "@type": "Question",
          name: "Is YTDL free to use?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. YTDL is completely free with no sign-in, no file size limits, and no daily caps.",
          },
        },
        {
          "@type": "Question",
          name: "Does YTDL work on Android and iPhone?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. YTDL works fully in the mobile browser on Android (Chrome) and iPhone/iPad (Safari). No app download required.",
          },
        },
        {
          "@type": "Question",
          name: "Can I download just the audio from a YouTube video?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. Switch to the 'Audio Only' tab to see all available audio streams in M4A and WebM formats at various bitrates.",
          },
        },
      ],
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
