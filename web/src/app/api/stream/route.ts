import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// User-Agent matching the ANDROID client used in innertube.ts.
const ANDROID_UA =
  "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip";

// Build a fetch function that routes through PROXY_URL when proxied=true.
// Uses undici ProxyAgent (Node.js 18+ built-in, available in Vercel Edge).
async function buildFetch(useProxy: boolean): Promise<typeof fetch> {
  if (!useProxy || !process.env.PROXY_URL) return fetch;
  try {
    // webpackIgnore tells webpack to skip static analysis of this import.
    // @ts-ignore – undici resolved at runtime by Node; not in local TS paths
    const { ProxyAgent, fetch: undiciFetch } = await import(/* webpackIgnore: true */ "undici") as any;
    const agent = new ProxyAgent(process.env.PROXY_URL);
    return (url: RequestInfo | URL, init?: RequestInit) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      undiciFetch(url as string, { ...init, dispatcher: agent } as any);
  } catch {
    return fetch;
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const streamUrl = searchParams.get("url");
  const filename = searchParams.get("filename") || "download";
  // proxied=1 means the CDN URL's ip= param is bound to the proxy IP.
  // In that (rare) fallback case we must route the CDN fetch through the
  // same proxy so the IPs match and YouTube serves the content.
  const proxied = searchParams.get("proxied") === "1";

  if (!streamUrl) {
    return NextResponse.json({ error: "stream url required" }, { status: 400 });
  }

  try {
    const decoded = decodeURIComponent(streamUrl);
    const fetchFn = await buildFetch(proxied);

    // With params=2AMB (innertube.ts), all formats have ratebypass=yes and
    // the CDN URL's ip= is signed for the calling server's own IP.
    // Direct fetch (no proxy) returns 200 for all formats in normal operation.
    // The proxy path is a safety net for the rare case where the direct
    // player API call was bot-blocked and fell back to the ISP proxy.
    const upstream = await fetchFn(decoded, {
      redirect: "follow",
      headers: {
        "User-Agent": ANDROID_UA,
        "Referer": "https://www.youtube.com/",
        "Accept": "*/*",
        "Accept-Encoding": "identity",
        "Origin": "https://www.youtube.com",
      },
    } as RequestInit);

    if (!upstream.ok || !upstream.body) {
      return NextResponse.json(
        { error: `CDN returned ${upstream.status}` },
        { status: upstream.status === 403 ? 403 : 502 }
      );
    }

    const contentType =
      upstream.headers.get("content-type") || "application/octet-stream";
    const contentLength = upstream.headers.get("content-length");

    const responseHeaders = new Headers({
      "Content-Type": contentType,
      // RFC 5987 so non-ASCII filenames (Korean, Japanese, etc.) work.
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-cache, no-store",
      "Access-Control-Allow-Origin": "*",
    });
    if (contentLength) responseHeaders.set("Content-Length", contentLength);

    // Stream the body — data flows through without buffering so there is no
    // 4.5 MB cap on the download. The client receives bytes as they arrive.
    return new NextResponse(upstream.body as ReadableStream, {
      status: 200,
      headers: responseHeaders,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "stream failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
