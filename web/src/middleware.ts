import { NextRequest, NextResponse } from "next/server";

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

export function middleware(req: NextRequest) {
  if (!BASE) return NextResponse.next();
  const dest = BASE + req.nextUrl.pathname + req.nextUrl.search;
  return NextResponse.redirect(dest, { status: 307 });
}

export const config = { matcher: "/api/:path*" };
