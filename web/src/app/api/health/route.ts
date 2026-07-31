import { NextResponse } from "next/server";
import { poolSize, proxyUrlFor, shuffledNodes } from "@/lib/vless";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Pings YouTube through an exit for the header's Online/Offline indicator.
// Two exits are tried before declaring the pool down, and the result is cached
// so repeated page loads don't each dial out.
let cached: { online: boolean; at: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const PING_TIMEOUT_MS = 15_000;
const HEALTH_EXIT_ATTEMPTS = 2;

export async function GET() {
  const size = poolSize();
  // No exits configured → the app cannot extract, so report offline.
  if (size === 0) {
    return NextResponse.json({ online: false, reason: "no-exits", exits: 0 }, { headers: { "Cache-Control": "no-store" } });
  }

  const now = Date.now();
  if (cached && now - cached.at < CACHE_TTL_MS) {
    return NextResponse.json({ online: cached.online, exits: size, cached: true }, { headers: { "Cache-Control": "no-store" } });
  }

  let online = false;
  try {
    // webpackIgnore: undici is resolved at runtime by Node (externalized in next.config.js).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { ProxyAgent, fetch: undiciFetch } = (await import(/* webpackIgnore: true */ "undici")) as any;

    for (const node of shuffledNodes().slice(0, HEALTH_EXIT_ATTEMPTS)) {
      const url = proxyUrlFor(node);
      if (!url) continue;
      const agent = new ProxyAgent(url);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), PING_TIMEOUT_MS);
      try {
        // generate_204 is a tiny no-body endpoint — confirms the exit is up AND can reach YouTube.
        const r = await undiciFetch("https://www.youtube.com/generate_204", {
          dispatcher: agent,
          signal: ctrl.signal,
          headers: { "User-Agent": "Mozilla/5.0" },
        });
        if (r.status >= 200 && r.status < 400) { online = true; break; }
      } catch {
        // this exit is down; fall through and try the next one
      } finally {
        clearTimeout(timer);
      }
    }
  } catch {
    online = false; // undici unavailable
  }

  cached = { online, at: now };
  return NextResponse.json({ online, exits: size }, { headers: { "Cache-Control": "no-store" } });
}
