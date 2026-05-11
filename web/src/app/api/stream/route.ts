import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const streamUrl = searchParams.get("url");
  const filename = searchParams.get("filename") || "download";

  if (!streamUrl) {
    return NextResponse.json({ error: "stream url required" }, { status: 400 });
  }

  try {
    const decoded = decodeURIComponent(streamUrl);

    const upstream = await fetch(decoded, {
      headers: {
        "User-Agent":
          "com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12; Build/SQ3A.220705.003.A1) gzip",
        Referer: "https://www.youtube.com/",
        Accept: "*/*",
        "Accept-Encoding": "identity",
      },
    });

    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: `upstream ${upstream.status}` }, { status: 502 });
    }

    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    const contentLength = upstream.headers.get("content-length");

    const headers = new Headers({
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-cache",
      "Access-Control-Allow-Origin": "*",
    });
    if (contentLength) headers.set("Content-Length", contentLength);

    return new NextResponse(upstream.body, {
      status: 200,
      headers,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "stream failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
