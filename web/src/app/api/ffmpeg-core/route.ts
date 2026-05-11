import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const CDN = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm";

const ALLOWED: Record<string, string> = {
  "ffmpeg-core.js":   "text/javascript",
  "ffmpeg-core.wasm": "application/wasm",
};

export async function GET(req: NextRequest) {
  const file = req.nextUrl.searchParams.get("file") ?? "";
  const contentType = ALLOWED[file];
  if (!contentType) {
    return NextResponse.json({ error: "unknown file" }, { status: 404 });
  }

  const upstream = await fetch(`${CDN}/${file}`, {
    // Vercel Data Cache — reuse across invocations for the same version pin
    next: { revalidate: 86400 },
  } as RequestInit);

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: `cdn ${upstream.status}` }, { status: 502 });
  }

  return new NextResponse(upstream.body as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      // Immutable because the version is pinned in the query string
      "Cache-Control": "public, max-age=31536000, immutable",
      "Access-Control-Allow-Origin": "*",
      // Required for SharedArrayBuffer / Workers to be able to load this
      "Cross-Origin-Resource-Policy": "cross-origin",
    },
  });
}
