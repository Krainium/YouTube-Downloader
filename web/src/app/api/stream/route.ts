import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const streamUrl = searchParams.get("url");

  if (!streamUrl) {
    return NextResponse.json({ error: "stream url required" }, { status: 400 });
  }

  try {
    const decoded = decodeURIComponent(streamUrl);
    // Redirect the browser directly to YouTube's CDN.
    // Proxying through a serverless function hits Vercel's 4.5 MB response
    // body limit and 10 s timeout — both far too small for video files.
    // The signed CDN URLs are public once issued; the browser fetches them
    // directly, so there is no size or speed constraint.
    return NextResponse.redirect(decoded, { status: 302 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "stream failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
