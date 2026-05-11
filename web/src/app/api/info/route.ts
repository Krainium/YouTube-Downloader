import { NextRequest, NextResponse } from "next/server";
import { getVideoInfo } from "@/lib/innertube";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }
    const info = await getVideoInfo(url.trim());
    return NextResponse.json(info);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch video info";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
