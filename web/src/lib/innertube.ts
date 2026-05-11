export interface VideoFormat {
  itag: number;
  mimeType: string;
  quality: string;
  qualityLabel?: string;
  bitrate?: number;
  width?: number;
  height?: number;
  fps?: number;
  contentLength?: string;
  approxDurationMs?: string;
  url?: string;
  type: "muxed" | "video" | "audio";
}

export interface VideoInfo {
  videoId: string;
  title: string;
  author: string;
  lengthSeconds: string;
  viewCount: string;
  thumbnail: string;
  description: string;
  publishDate?: string;
  formats: VideoFormat[];
}

function extractVideoId(input: string): string | null {
  try {
    const url = new URL(input);
    if (url.hostname.includes("youtu.be")) return url.pathname.slice(1).split("?")[0];
    if (url.hostname.includes("youtube.com")) {
      const v = url.searchParams.get("v");
      if (v) return v;
      const m = url.pathname.match(/\/(?:embed|shorts|v)\/([A-Za-z0-9_-]{11})/);
      if (m) return m[1];
    }
    return null;
  } catch {
    const m = input.match(/[A-Za-z0-9_-]{11}/);
    return m ? m[0] : null;
  }
}

function parseFormats(streaming: Record<string, unknown>): VideoFormat[] {
  const muxedRaw = (streaming.formats as Record<string, unknown>[] | undefined) || [];
  const adaptiveRaw = (streaming.adaptiveFormats as Record<string, unknown>[] | undefined) || [];

  const muxed: VideoFormat[] = muxedRaw.map((f) => ({
    itag: f.itag as number,
    mimeType: f.mimeType as string,
    quality: f.quality as string,
    qualityLabel: f.qualityLabel as string | undefined,
    bitrate: f.bitrate as number | undefined,
    width: f.width as number | undefined,
    height: f.height as number | undefined,
    fps: f.fps as number | undefined,
    contentLength: f.contentLength as string | undefined,
    approxDurationMs: f.approxDurationMs as string | undefined,
    url: f.url as string | undefined,
    type: "muxed" as const,
  }));

  const adaptive: VideoFormat[] = adaptiveRaw.map((f) => ({
    itag: f.itag as number,
    mimeType: f.mimeType as string,
    quality: f.quality as string,
    qualityLabel: f.qualityLabel as string | undefined,
    bitrate: f.bitrate as number | undefined,
    width: f.width as number | undefined,
    height: f.height as number | undefined,
    fps: f.fps as number | undefined,
    contentLength: f.contentLength as string | undefined,
    approxDurationMs: f.approxDurationMs as string | undefined,
    url: f.url as string | undefined,
    type: ((f.mimeType as string || "").startsWith("audio/") ? "audio" : "video") as "audio" | "video",
  }));

  return [...muxed, ...adaptive].filter((f) => f.url);
}

async function fetchViaPageScrape(videoId: string): Promise<VideoInfo> {
  const pageUrl = `https://www.youtube.com/watch?v=${videoId}&hl=en`;

  const res = await fetch(pageUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Encoding": "identity",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Upgrade-Insecure-Requests": "1",
    },
  });

  if (!res.ok) throw new Error(`YouTube page fetch failed: ${res.status}`);
  const html = await res.text();

  const patterns = [
    /ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;(?:var |<\/script>)/s,
    /ytInitialPlayerResponse\s*=\s*(\{.+?\});/s,
  ];

  let playerData: Record<string, unknown> | null = null;
  for (const pat of patterns) {
    const m = html.match(pat);
    if (m) {
      try {
        playerData = JSON.parse(m[1]);
        break;
      } catch {
        continue;
      }
    }
  }

  if (!playerData) throw new Error("Could not extract player data from page");

  const ps = (playerData.playabilityStatus as Record<string, unknown>) || {};
  const status = ps.status as string;
  if (status && status !== "OK") {
    const reason = (ps.reason as string) || status;
    throw new Error(`Video not available: ${reason}`);
  }

  const details = (playerData.videoDetails as Record<string, unknown>) || {};
  const streaming = (playerData.streamingData as Record<string, unknown>) || {};

  const thumbArr = (details.thumbnail as Record<string, unknown[]> | undefined)
    ?.thumbnails as Array<{ url: string }> | undefined;
  const thumbnailUrl =
    thumbArr
      ? thumbArr[thumbArr.length - 1]?.url
      : `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;

  return {
    videoId,
    title: (details.title as string) || "Unknown Title",
    author: (details.author as string) || "Unknown",
    lengthSeconds: (details.lengthSeconds as string) || "0",
    viewCount: (details.viewCount as string) || "0",
    thumbnail: thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
    description: ((details.shortDescription as string) || "").slice(0, 200),
    formats: parseFormats(streaming),
  };
}

const ANDROID_VR_CLIENT = {
  clientName: "ANDROID_VR",
  clientVersion: "1.60.19",
  androidSdkVersion: 32,
  userAgent:
    "com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12; Build/SQ3A.220705.003.A1) gzip",
  apiKey: "AIzaSyDCU8hByM-4DrUqRUYnGn-3llEO78bcxq8",
};

function randStr(n: number): string {
  const a = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  return Array.from({ length: n }, () => a[Math.floor(Math.random() * a.length)]).join("");
}

function varint(val: number): Uint8Array {
  const bytes: number[] = [];
  while (val > 0) {
    let b = val & 0x7f;
    val >>>= 7;
    if (val !== 0) b |= 0x80;
    bytes.push(b);
  }
  return new Uint8Array(bytes.length ? bytes : [0]);
}

function protoField(fieldNum: number, wireType: number): Uint8Array {
  return varint((fieldNum << 3) | (wireType & 0x07));
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) { out.set(a, offset); offset += a.length; }
  return out;
}

function protoString(fieldNum: number, s: string): Uint8Array {
  const enc = new TextEncoder().encode(s);
  return concat(protoField(fieldNum, 2), varint(enc.length), enc);
}

function protoBytes(fieldNum: number, data: Uint8Array): Uint8Array {
  return concat(protoField(fieldNum, 2), varint(data.length), data);
}

function randomVisitorData(): string {
  const e2 = concat(
    protoString(2, ""),
    concat(protoField(4, 0), varint(Math.floor(Math.random() * 255) + 1))
  );
  const e = concat(protoString(1, "US"), protoBytes(2, e2));
  const ts = Math.floor(Date.now() / 1000) - Math.floor(Math.random() * 600000);
  const pb = concat(
    protoString(1, randStr(11)),
    protoField(5, 0),
    varint(ts),
    protoBytes(6, e),
  );
  const b64 = btoa(Array.from(pb).map((b) => String.fromCharCode(b)).join(""));
  return encodeURIComponent(b64.replace(/\+/g, "-").replace(/\//g, "_"));
}

async function fetchViaInnertube(videoId: string): Promise<VideoInfo> {
  const visitorData = randomVisitorData();
  const apiUrl = `https://www.youtube.com/youtubei/v1/player?key=${ANDROID_VR_CLIENT.apiKey}&prettyPrint=false`;

  const body = {
    videoId,
    context: {
      client: {
        clientName: ANDROID_VR_CLIENT.clientName,
        clientVersion: ANDROID_VR_CLIENT.clientVersion,
        androidSdkVersion: ANDROID_VR_CLIENT.androidSdkVersion,
        userAgent: ANDROID_VR_CLIENT.userAgent,
        osName: "Android",
        osVersion: "12",
        platform: "MOBILE",
        visitorData,
        hl: "en",
        gl: "US",
        utcOffsetMinutes: 0,
      },
      thirdParty: { embedUrl: "https://www.youtube.com/" },
    },
    playbackContext: {
      contentPlaybackContext: {
        html5Preference: "HTML5_PREF_WANTS",
        signatureTimestamp: 19950,
      },
    },
    racyCheckOk: true,
    contentCheckOk: true,
  };

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": ANDROID_VR_CLIENT.userAgent,
      "X-YouTube-Client-Name": "28",
      "X-YouTube-Client-Version": ANDROID_VR_CLIENT.clientVersion,
      "X-Goog-Visitor-Id": visitorData,
      "Origin": "https://www.youtube.com",
      "Referer": "https://www.youtube.com/",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`YouTube API error: ${res.status}`);
  const data = await res.json();

  const status = data?.playabilityStatus?.status;
  if (status && status !== "OK") {
    const reason = data?.playabilityStatus?.reason || status;
    throw new Error(`Video not available: ${reason}`);
  }

  const details = data?.videoDetails || {};
  const streaming = data?.streamingData || {};
  const thumb = details?.thumbnail?.thumbnails;
  const thumbnailUrl = thumb
    ? thumb[thumb.length - 1]?.url
    : `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;

  return {
    videoId,
    title: details.title || "Unknown Title",
    author: details.author || "Unknown",
    lengthSeconds: details.lengthSeconds || "0",
    viewCount: details.viewCount || "0",
    thumbnail: thumbnailUrl,
    description: ((details.shortDescription as string) || "").slice(0, 200),
    formats: parseFormats(streaming),
  };
}

export async function getVideoInfo(urlOrId: string): Promise<VideoInfo> {
  const videoId = extractVideoId(urlOrId) || urlOrId;
  if (!videoId || videoId.length < 8) throw new Error("Invalid YouTube URL or video ID");

  try {
    const info = await fetchViaPageScrape(videoId);
    if (info.formats.length > 0) return info;
    throw new Error("No formats from page scrape");
  } catch (scrapeErr) {
    try {
      return await fetchViaInnertube(videoId);
    } catch {
      throw scrapeErr;
    }
  }
}

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let size = bytes;
  let i = -1;
  do { size /= 1024; i++; } while (size >= 1024 && i < 2);
  return `${size.toFixed(1)} ${units[i]}`;
}

export function humanDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function humanViews(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

export function mimeToExt(mimeType: string): string {
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("audio/mp4") || mimeType.includes("m4a")) return "m4a";
  if (mimeType.includes("audio/webm")) return "weba";
  return "bin";
}

export function getCodec(mimeType: string): string {
  const m = mimeType.match(/codecs="([^"]+)"/);
  if (!m) return "";
  const codec = m[1].split(",")[0].trim();
  if (codec.startsWith("avc1")) return "H.264";
  if (codec.startsWith("vp9") || codec === "vp09") return "VP9";
  if (codec.startsWith("av01")) return "AV1";
  if (codec.startsWith("mp4a")) return "AAC";
  if (codec.startsWith("opus")) return "Opus";
  return codec;
}
