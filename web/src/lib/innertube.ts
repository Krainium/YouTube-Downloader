// ---------------------------------------------------------------------------
// YouTube auth cookie loading.
// Priority: YOUTUBE_COOKIES env var > cookies.txt file in project root.
// The cookie string is the raw "Cookie" header value from an authenticated
// browser session on youtube.com (copy from DevTools > Network > any request).
// ---------------------------------------------------------------------------

// Lazy-loaded — only runs on the server side (Next.js API routes).
// No top-level Node.js imports so webpack can safely bundle this for the client.
let _ytCookies: string | undefined;
function getYtCookies(): string {
  if (_ytCookies !== undefined) return _ytCookies;
  if (process.env.YOUTUBE_COOKIES) {
    _ytCookies = process.env.YOUTUBE_COOKIES.trim();
    return _ytCookies;
  }
  // Only attempt fs access on the server side
  if (typeof window === "undefined") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require("fs") as typeof import("fs");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const path = require("path") as typeof import("path");
      const p = path.join(process.cwd(), "cookies.txt");
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, "utf-8").trim();
        if (raw && !raw.startsWith("PASTE_")) {
          _ytCookies = raw;
          return _ytCookies;
        }
      }
    } catch { /* no file, ignore */ }
  }
  _ytCookies = "";
  return _ytCookies;
}

// Generate the full SAPISIDHASH Authorization header that YouTube's web client sends.
// Browser format (Chrome 148+):
//   SAPISIDHASH {ts}_{sha1(SAPISID)}_u SAPISID1PHASH {ts}_{sha1(1PAPISID)}_u SAPISID3PHASH {ts}_{sha1(3PAPISID)}_u
// Uses Web Crypto SHA-1 — available in Node.js 16+ and all browsers.
async function buildSAPISIDHASH(cookieStr: string): Promise<string | null> {
  const getVal = (name: string): string | null => {
    const m = cookieStr.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
    return m ? m[1].trim() : null;
  };
  const sapisid    = getVal("SAPISID");
  if (!sapisid) return null;
  const sapisid1p  = getVal("__Secure-1PAPISID") || sapisid;
  const sapisid3p  = getVal("__Secure-3PAPISID") || sapisid;

  const ts = Math.floor(Date.now() / 1000);
  const origin = "https://www.youtube.com";

  const sha1hex = async (key: string): Promise<string> => {
    const buf = await crypto.subtle.digest(
      "SHA-1",
      new TextEncoder().encode(`${ts} ${key} ${origin}`)
    );
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  };

  try {
    const [h, h1, h3] = await Promise.all([
      sha1hex(sapisid),
      sha1hex(sapisid1p),
      sha1hex(sapisid3p),
    ]);
    return (
      `SAPISIDHASH ${ts}_${h}_u` +
      ` SAPISID1PHASH ${ts}_${h1}_u` +
      ` SAPISID3PHASH ${ts}_${h3}_u`
    );
  } catch {
    return null;
  }
}

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

// SCRAPE_HEADERS is kept as a function so it can use real auth cookies when available.
// This lets the page scrape method work for label-restricted content that requires
// a logged-in session — matching what a real Chrome browser sends to youtube.com.
function getScrapeHeaders(): Record<string, string> {
  const ytCookies = getYtCookies();
  const cookieStr = ytCookies ||
    "CONSENT=YES+cb; SOCS=CAESEwgDEgk0OTM1MDE2NzEaAmVuIAEaBgiA_LyoBg; YSC=DwKYExXM6hI; VISITOR_INFO1_LIVE=oFPXFMrLYLo";
  return {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Encoding": "identity",
    "Cookie": cookieStr,
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Upgrade-Insecure-Requests": "1",
    "DNT": "1",
  };
}

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
      const res = await fetch(pageUrl, { headers: getScrapeHeaders() });
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

// ANDROID_VR: sdkless variant (no androidSdkVersion) — bypasses PoToken requirement.
// Version and user agent synced from kkdai/youtube (commit 87a44626, 2026-03-21).
// Empty API key matches kkdai behavior (?key= with no value).
const ANDROID_VR_CLIENT = {
  clientName: "ANDROID_VR",
  clientVersion: "1.65.10",
  userAgent:
    "com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip",
  apiKey: "",
  clientId: "28",
};

// ANDROID: sdkless variant — androidSdkVersion omitted deliberately.
// Comment from kkdai/youtube: "androidVersion removed to avoid PoToken requirement".
const ANDROID_CLIENT = {
  clientName: "ANDROID",
  clientVersion: "20.10.38",
  userAgent:
    "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip",
  apiKey: "AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w",
  clientId: "3",
};

// ANDROID_EMBEDDED: also sdkless. embedUrl triggers thirdParty context in the request.
const ANDROID_EMBEDDED_CLIENT = {
  clientName: "ANDROID_EMBEDDED_PLAYER",
  clientVersion: "20.10.38",
  userAgent:
    "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip",
  apiKey: "AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w",
  clientId: "55",
  embedUrl: "https://www.youtube.com/",
};

// TV_EMBEDDED: Tizen smart-TV embedded player. Often bypasses label-level
// restrictions that affect Android/iOS clients from datacenter IPs.
const TV_EMBEDDED_CLIENT = {
  clientName: "TVHTML5_SIMPLY_EMBEDDED_PLAYER",
  clientVersion: "2.0",
  userAgent:
    "Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/538.1 (KHTML, like Gecko) Version/6.0 TV Safari/538.1",
  apiKey: "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
  clientId: "85",
  embedUrl: "https://www.youtube.com/",
};

const IOS_CLIENT = {
  clientName: "IOS",
  clientVersion: "19.45.4",
  deviceModel: "iPhone16,2",
  userAgent:
    "com.google.ios.youtube/19.45.4 (iPhone16,2; U; CPU iOS 18_1_0 like Mac OS X;)",
  apiKey: "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
  clientId: "5",
};

// WEB client — uses real browser cookies + SAPISIDHASH for authentication.
// Bypasses label-level restrictions that Android/TV clients can't pass from
// datacenter IPs. Only attempted when auth cookies are available.
// Version synced from x-youtube-client-version observed in browser (2026-05-11).
const WEB_CLIENT = {
  clientName: "WEB",
  clientVersion: "2.20260508.01.0",
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
  apiKey: "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
  clientId: "1",
  isWebClient: true as const,
};

// ---------------------------------------------------------------------------
// Visitor ID — fetched from YouTube's homepage (real, YouTube-issued).
// Technique from kkdai/youtube: parse ytcfg.set( block, extract
// INNERTUBE_CONTEXT.Client.VisitorData. Cached 10 hours; falls back to a
// random proto-encoded value if the fetch fails.
// ---------------------------------------------------------------------------
const VISITOR_ID_MAX_AGE_MS = 10 * 60 * 60 * 1000; // 10 hours
let _cachedVisitorId = "";
let _cachedVisitorIdAt = 0;

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

// Balance-brace extract: find the end of a JSON object starting at str[0] === '{'
function extractJsonObject(str: string): string | null {
  let depth = 0;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === "{") depth++;
    else if (str[i] === "}") { depth--; if (depth === 0) return str.slice(0, i + 1); }
  }
  return null;
}

async function getVisitorData(): Promise<string> {
  const now = Date.now();
  if (_cachedVisitorId && now - _cachedVisitorIdAt < VISITOR_ID_MAX_AGE_MS) {
    return _cachedVisitorId;
  }
  try {
    const res = await fetch("https://www.youtube.com", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    // YouTube may have multiple ytcfg.set( calls; iterate until we find visitorData.
    const SEP = "ytcfg.set(";
    let searchFrom = 0;
    let raw = "";
    while (true) {
      const idx = html.indexOf(SEP, searchFrom);
      if (idx === -1) break;
      const objStart = idx + SEP.length;
      if (html[objStart] !== "{") { searchFrom = objStart; continue; }
      const objStr = extractJsonObject(html.slice(objStart));
      if (!objStr) { searchFrom = objStart + 1; continue; }
      try {
        const parsed = JSON.parse(objStr);
        const candidate: string = parsed?.INNERTUBE_CONTEXT?.client?.visitorData ?? "";
        if (candidate) { raw = candidate; break; }
      } catch { /* try next */ }
      searchFrom = objStart + 1;
    }

    if (!raw) throw new Error("visitorData not found in any ytcfg.set() block");
    _cachedVisitorId = decodeURIComponent(raw);
    _cachedVisitorIdAt = now;
    return _cachedVisitorId;
  } catch {
    // Fallback: return a randomly generated visitor ID
    return randomVisitorData();
  }
}

type YoutubeClient = {
  clientName: string;
  clientVersion: string;
  deviceModel?: string;
  embedUrl?: string;
  userAgent: string;
  apiKey: string;
  clientId: string;
  isWebClient?: true;
};

async function fetchViaInnertube(videoId: string, client: YoutubeClient): Promise<VideoInfo> {
  // Use real YouTube-issued visitor ID (technique from kkdai/youtube).
  const visitorData = await getVisitorData();

  // key= is intentionally empty for ANDROID_VR (matches kkdai/youtube behavior).
  const apiUrl = `https://www.youtube.com/youtubei/v1/player?key=${client.apiKey}&prettyPrint=false`;

  // Context strictly mirrors kkdai/youtube: no platform, no osName/osVersion,
  // no androidSdkVersion (sdkless variant avoids PoToken requirement).
  // WEB client gets additional desktop-specific fields that YouTube expects.
  const clientContext: Record<string, unknown> = {
    clientName: client.clientName,
    clientVersion: client.clientVersion,
    userAgent: client.userAgent,
    hl: "en",
    gl: "US",
    timeZone: "UTC",
    utcOffsetMinutes: 0,
    visitorData,
  };
  if (client.deviceModel) {
    clientContext.deviceModel = client.deviceModel;
  }
  if (client.isWebClient) {
    clientContext.platform = "DESKTOP";
    clientContext.browserName = "Chrome";
    clientContext.browserVersion = "148.0.7778.96";
    clientContext.osName = "Windows";
    clientContext.osVersion = "10.0";
    clientContext.clientFormFactor = "UNKNOWN_FORM_FACTOR";
  }

  // thirdParty context is used by embedded/TV clients to indicate the embed origin.
  // It helps bypass label-level restrictions on certain videos.
  const contextObj: Record<string, unknown> = { client: clientContext };
  if (client.embedUrl) {
    contextObj.thirdParty = { embedUrl: client.embedUrl };
  }

  const body = {
    videoId,
    context: contextObj,
    playbackContext: {
      contentPlaybackContext: {
        html5Preference: "HTML5_PREF_WANTS",
      },
    },
    racyCheckOk: true,
    contentCheckOk: true,
  };

  // Use real auth cookies when available, otherwise fall back to static consent cookies.
  const ytCookies = getYtCookies();
  const cookieStr = ytCookies ||
    "CONSENT=YES+cb; SOCS=CAESEwgDEgk0OTM1MDE2NzEaAmVuIAEaBgiA_LyoBg; YSC=DwKYExXM6hI; VISITOR_INFO1_LIVE=oFPXFMrLYLo";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "User-Agent": client.userAgent,
    "X-YouTube-Client-Name": client.clientId,
    "X-YouTube-Client-Version": client.clientVersion,
    "X-Goog-Visitor-Id": visitorData,
    "Origin": "https://www.youtube.com",
    "Referer": "https://www.youtube.com/",
    "Cookie": cookieStr,
  };

  // SAPISIDHASH + auth headers only apply to the WEB client.
  // Android/TV/iOS clients use a different auth model (OAuth2) — sending
  // web session cookies to them is harmless but the SAPISIDHASH header is
  // web-specific and must not be sent to non-web endpoints.
  if (client.isWebClient && ytCookies) {
    const sapisidHash = await buildSAPISIDHASH(cookieStr);
    if (sapisidHash) {
      headers["Authorization"] = sapisidHash;
      headers["X-Origin"] = "https://www.youtube.com";
      headers["X-Goog-AuthUser"] = "0";
    }
  }

  const res = await fetch(apiUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`api error: ${res.status} (client: ${client.clientName})`);
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
    m.includes("api error: 404") ||
    m.includes("api error: 429") ||
    m.includes("unplayable") ||
    m.includes("unavailable") ||
    m.includes("no longer supported") ||
    m.includes("not supported") ||
    m.includes("age") ||
    m.includes("content warning")
  );
}

export async function getVideoInfo(urlOrId: string): Promise<VideoInfo> {
  const videoId = extractVideoId(urlOrId) || urlOrId;
  if (!videoId || videoId.length < 8) throw new Error("Invalid YouTube URL or video ID");

  // WEB_CLIENT is appended only when auth cookies are loaded — it's the only
  // client that honours session cookies + SAPISIDHASH and can bypass label
  // restrictions that Android/TV clients can't clear from datacenter IPs.
  const ytCookies = getYtCookies();
  const clients = [
    ANDROID_VR_CLIENT,
    ANDROID_CLIENT,
    ANDROID_EMBEDDED_CLIENT,
    TV_EMBEDDED_CLIENT,
    IOS_CLIENT,
    ...(ytCookies ? [WEB_CLIENT] : []),
  ];
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
