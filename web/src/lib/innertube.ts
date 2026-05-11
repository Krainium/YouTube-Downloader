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

function extractPlayerData(html: string): Record<string, unknown> | null {
  const markerIdx = html.indexOf("ytInitialPlayerResponse");
  if (markerIdx === -1) return null;
  const eqIdx = html.indexOf("=", markerIdx);
  const startIdx = html.indexOf("{", eqIdx);
  if (startIdx === -1) return null;
  let depth = 0, endIdx = startIdx;
  const cap = Math.min(startIdx + 3_000_000, html.length);
  for (let i = startIdx; i < cap; i++) {
    if (html[i] === "{") depth++;
    else if (html[i] === "}") { depth--; if (depth === 0) { endIdx = i; break; } }
  }
  if (depth !== 0) return null;
  try { return JSON.parse(html.slice(startIdx, endIdx + 1)); } catch { return null; }
}

const SCRAPE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Encoding": "identity",
  "Cookie": "CONSENT=YES+cb; SOCS=CAESEwgDEgk0OTM1MDE2NzEaAmVuIAEaBgiA_LyoBg; YSC=DwKYExXM6hI; VISITOR_INFO1_LIVE=oFPXFMrLYLo",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Upgrade-Insecure-Requests": "1",
};

async function fetchViaPageScrape(videoId: string): Promise<VideoInfo> {
  const urls = [
    `https://www.youtube.com/watch?v=${videoId}&hl=en&gl=US`,
    `https://www.youtube.com/watch?v=${videoId}&hl=en&gl=US&bpctr=9999999999&has_verified=1`,
    `https://m.youtube.com/watch?v=${videoId}&hl=en`,
  ];

  let lastError = "Page scrape failed";
  let html = "";

  for (const pageUrl of urls) {
    try {
      const res = await fetch(pageUrl, { headers: SCRAPE_HEADERS });
      if (!res.ok) { lastError = `HTTP ${res.status} from ${pageUrl}`; continue; }
      html = await res.text();
      const data = extractPlayerData(html);
      if (data) {
        const ps = (data.playabilityStatus as Record<string, unknown>) || {};
        const status = ps.status as string;
        if (status && status !== "OK") {
          const reason = (ps.reason as string) || status;
          throw new Error(`Video not available: ${reason}`);
        }
        const details = (data.videoDetails as Record<string, unknown>) || {};
        const streaming = (data.streamingData as Record<string, unknown>) || {};
        const thumbArr = (details.thumbnail as Record<string, unknown[]> | undefined)
          ?.thumbnails as Array<{ url: string }> | undefined;
        const thumbnailUrl = thumbArr
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
      lastError = `ytInitialPlayerResponse not found (page size: ${html.length}, hint: ${html.slice(0, 80).replace(/\n/g, " ")})`;
    } catch (e) {
      if (e instanceof Error && e.message.includes("Video not available")) throw e;
      lastError = e instanceof Error ? e.message : String(e);
    }
  }

  throw new Error(`Scrape failed: ${lastError}`);
}

const ANDROID_VR_CLIENT = {
  clientName: "ANDROID_VR",
  clientVersion: "1.60.19",
  androidSdkVersion: 32,
  userAgent:
    "com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12; Build/SQ3A.220705.003.A1) gzip",
  apiKey: "AIzaSyDCU8hByM-4DrUqRUYnGn-3llEO78bcxq8",
  clientId: "28",
};

const ANDROID_CLIENT = {
  clientName: "ANDROID",
  clientVersion: "19.44.38",
  androidSdkVersion: 30,
  userAgent:
    "com.google.android.youtube/19.44.38(Linux; U; Android 11; en_US; sdk_gphone64_x86_64 Build/RSR1.201013.001) gzip",
  apiKey: "AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w",
  clientId: "3",
};

const ANDROID_EMBEDDED_CLIENT = {
  clientName: "ANDROID_EMBEDDED_PLAYER",
  clientVersion: "19.44.38",
  androidSdkVersion: 30,
  userAgent:
    "com.google.android.youtube/19.44.38(Linux; U; Android 11; en_US; sdk_gphone64_x86_64 Build/RSR1.201013.001) gzip",
  apiKey: "AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w",
  clientId: "55",
};

const IOS_CLIENT = {
  clientName: "IOS",
  clientVersion: "19.45.4",
  deviceModel: "iPhone16,2",
  userAgent:
    "com.google.ios.youtube/19.45.4 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X; en_US) gzip",
  apiKey: "AIzaSyB-63vPrdThhKuerbB2N_l7Kwwcxj6yUAc",
  clientId: "5",
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

type YoutubeClient = {
  clientName: string;
  clientVersion: string;
  androidSdkVersion?: number;
  deviceModel?: string;
  userAgent: string;
  apiKey: string;
  clientId: string;
};

async function fetchViaInnertube(videoId: string, client: YoutubeClient): Promise<VideoInfo> {
  const visitorData = randomVisitorData();
  const apiUrl = `https://www.youtube.com/youtubei/v1/player?key=${client.apiKey}&prettyPrint=false`;

  const clientContext: Record<string, unknown> = {
    clientName: client.clientName,
    clientVersion: client.clientVersion,
    userAgent: client.userAgent,
    platform: "MOBILE",
    visitorData,
    hl: "en",
    gl: "US",
    utcOffsetMinutes: 0,
  };
  if (client.androidSdkVersion) {
    clientContext.androidSdkVersion = client.androidSdkVersion;
    clientContext.osName = "Android";
    clientContext.osVersion = client.androidSdkVersion >= 30 ? "11" : "12";
  }
  if (client.deviceModel) {
    clientContext.deviceModel = client.deviceModel;
    clientContext.osName = "iOS";
    clientContext.osVersion = "17.5.1.21F90";
  }

  const body = {
    videoId,
    context: {
      client: clientContext,
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
      "User-Agent": client.userAgent,
      "X-YouTube-Client-Name": client.clientId,
      "X-YouTube-Client-Version": client.clientVersion,
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

function shouldTryNext(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes("sign in") ||
    m.includes("login") ||
    m.includes("bot") ||
    m.includes("login_required") ||
    m.includes("api error: 400") ||
    m.includes("api error: 403") ||
    m.includes("api error: 429") ||
    m.includes("unplayable") ||
    m.includes("unavailable")
  );
}

export async function getVideoInfo(urlOrId: string): Promise<VideoInfo> {
  const videoId = extractVideoId(urlOrId) || urlOrId;
  if (!videoId || videoId.length < 8) throw new Error("Invalid YouTube URL or video ID");

  const clients = [ANDROID_VR_CLIENT, ANDROID_CLIENT, ANDROID_EMBEDDED_CLIENT, IOS_CLIENT];
  let lastErr: Error | null = null;

  for (const client of clients) {
    try {
      const info = await fetchViaInnertube(videoId, client);
      if (info.formats.length > 0) return info;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      lastErr = e;
      if (!shouldTryNext(e.message)) throw e;
    }
  }

  try {
    const info = await fetchViaPageScrape(videoId);
    if (info.formats.length > 0) return info;
    throw new Error("No downloadable formats found");
  } catch (scrapeErr) {
    const se = scrapeErr instanceof Error ? scrapeErr : new Error(String(scrapeErr));
    if (se.message === "No downloadable formats found" && lastErr) throw lastErr;
    throw se;
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
