import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// User-Agent matching the ANDROID client used in innertube.ts.
// YouTube CDN validates the UA against the one used during the player API call.
const ANDROID_UA =
  "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const streamUrl = searchParams.get("url");
  const filename = searchParams.get("filename") || "download";
  // proxied=1 means the player API call went through the ISP proxy, so the
  // CDN URL is IP-bound to the proxy. We must fetch through the same proxy.
  const proxied = searchParams.get("proxied") === "1";

  if (!streamUrl) {
    return NextResponse.json({ error: "stream url required" }, { status: 400 });
  }

  try {
    const decoded = decodeURIComponent(streamUrl);

    const cdnHeaders = {
      "User-Agent": ANDROID_UA,
      "Referer": "https://www.youtube.com/",
      "Accept": "*/*",
      "Accept-Encoding": "identity",
    };

    let upstream: Response;

    if (proxied && process.env.PROXY_URL) {
      // Fetch through the same ISP proxy so the source IP matches the CDN URL.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      // @ts-ignore – undici resolved at runtime by Node; not in local TS paths
      const { ProxyAgent, fetch: undiciFetch } = await import(/* webpackIgnore: true */ "undici") as any;
      const agent = new ProxyAgent(process.env.PROXY_URL);
      upstream = await undiciFetch(decoded, { headers: cdnHeaders, dispatcher: agent });
    } else {
      // Direct fetch — CDN URL is bound to Vercel's IP, same network as this function.
      upstream = await fetch(decoded, { headers: cdnHeaders });
    }

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
      // RFC 5987 encoding so non-ASCII filenames (e.g. Korean, Japanese) work.
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-cache, no-store",
      "Access-Control-Allow-Origin": "*",
    });
    if (contentLength) responseHeaders.set("Content-Length", contentLength);

    // Stream the body — data flows through without being buffered, bypassing
    // Vercel's 4.5 MB static-response limit. The client receives bytes as they
    // arrive from the CDN, so the download starts immediately.
    return new NextResponse(upstream.body as ReadableStream, {
      status: 200,
      headers: responseHeaders,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "stream failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
