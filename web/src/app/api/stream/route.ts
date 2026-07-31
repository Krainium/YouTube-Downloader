import { NextRequest, NextResponse } from "next/server";
import { proxyUrlFor } from "@/lib/vless";

export const runtime = "nodejs";

// User-Agent matching the ANDROID client used in innertube.ts.
const ANDROID_UA =
  "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip";

// Fetch pinned to one VLESS exit, via undici ProxyAgent.
async function buildFetch(proxyUrl: string | null): Promise<typeof fetch> {
  if (!proxyUrl) return fetch;
  try {
    // webpackIgnore tells webpack to skip static analysis of this import.
    // @ts-ignore – undici resolved at runtime by Node; not in local TS paths
    const { ProxyAgent, fetch: undiciFetch } = await import(/* webpackIgnore: true */ "undici") as any;
    const agent = new ProxyAgent(proxyUrl);
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
  // proxied=1 means the CDN URL is bound to a VLESS exit; node says which one.
  // The bytes must come through that same exit or the CDN answers 403.
  const proxied = searchParams.get("proxied") === "1";
  const nodeParam = searchParams.get("node");
  const node = nodeParam === null ? NaN : Number(nodeParam);

  if (!streamUrl) {
    return NextResponse.json({ error: "stream url required" }, { status: 400 });
  }
  if (proxied && !Number.isInteger(node)) {
    return NextResponse.json(
      { error: "node is required when proxied=1" },
      { status: 400 }
    );
  }

  try {
    const decoded = decodeURIComponent(streamUrl);
    const proxyUrl = proxied ? proxyUrlFor(node) : null;
    if (proxied && !proxyUrl) {
      return NextResponse.json({ error: `unknown exit ${node}` }, { status: 400 });
    }
    const fetchFn = await buildFetch(proxyUrl);

    // With params=2AMB (innertube.ts), all formats have ratebypass=yes and the
    // CDN URL's ip= is signed for the calling server's (or proxy's) own IP.
    // Residential proxies are flaky and a freshly-rotated exit can transiently
    // 403 or drop the connection, so retry a few times before giving up — each
    // attempt re-establishes the proxy connection.
    const reqInit = {
      redirect: "follow",
      headers: {
        "User-Agent": ANDROID_UA,
        "Referer": "https://www.youtube.com/",
        "Accept": "*/*",
        "Accept-Encoding": "identity",
        "Origin": "https://www.youtube.com",
      },
    } as RequestInit;

    const MAX_TRIES = 4;
    let upstream: Response | null = null;
    let lastStatus = 0;
    for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
      try {
        const r = await fetchFn(decoded, reqInit);
        if (r.ok && r.body) { upstream = r; break; }
        lastStatus = r.status;
      } catch {
        lastStatus = 0; // network-level failure (reset/timeout)
      }
      if (attempt < MAX_TRIES) {
        await new Promise((res) => setTimeout(res, 400 * attempt));
      }
    }

    if (!upstream || !upstream.ok || !upstream.body) {
      return NextResponse.json(
        { error: `CDN returned ${lastStatus || "no response"}` },
        { status: lastStatus === 403 ? 403 : 502 }
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
