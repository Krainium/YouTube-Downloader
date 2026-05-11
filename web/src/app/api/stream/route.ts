import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// User-Agent matching the ANDROID client used in innertube.ts.
const ANDROID_UA =
  "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const streamUrl = searchParams.get("url");
  const filename = searchParams.get("filename") || "download";

  if (!streamUrl) {
    return NextResponse.json({ error: "stream url required" }, { status: 400 });
  }

  try {
    const decoded = decodeURIComponent(streamUrl);

    // YouTube CDN uses a redirect chain for adaptive streams when the request
    // IP doesn't match the signed `ip=` param.  The final redirect destination
    // carries `ipbypass=yes` so any IP can download it. We follow redirects
    // by default and serve the result — no proxy agent needed.
    const upstream = await fetch(decoded, {
      redirect: "follow",
      headers: {
        "User-Agent": ANDROID_UA,
        "Referer": "https://www.youtube.com/",
        "Accept": "*/*",
        "Accept-Encoding": "identity",
        "Origin": "https://www.youtube.com",
      },
    });

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
    // 4.5 MB cap on the download.  The client receives bytes as they arrive.
    return new NextResponse(upstream.body as ReadableStream, {
      status: 200,
      headers: responseHeaders,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "stream failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
