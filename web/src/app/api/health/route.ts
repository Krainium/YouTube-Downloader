import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Health of the configured residential proxy. Works for ANY PROXY_URL — it
// just routes a tiny request through whatever proxy is set and checks it can
// reach YouTube. Used by the header's Online/Offline indicator.
//
// Result is cached briefly so repeated page loads don't each hit the proxy;
// the client polls this hourly.
let cached: { online: boolean; at: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const PING_TIMEOUT_MS = 15_000;

export async function GET() {
  const proxyUrl = process.env.PROXY_URL;
  // No proxy configured → the app cannot extract, so report offline.
  if (!proxyUrl) {
    return NextResponse.json({ online: false, reason: "no-proxy" }, { headers: { "Cache-Control": "no-store" } });
  }

  const now = Date.now();
  if (cached && now - cached.at < CACHE_TTL_MS) {
    return NextResponse.json({ online: cached.online, cached: true }, { headers: { "Cache-Control": "no-store" } });
  }

  let online = false;
  try {
    // webpackIgnore: undici is resolved at runtime by Node (externalized in next.config.js).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { ProxyAgent, fetch: undiciFetch } = (await import(/* webpackIgnore: true */ "undici")) as any;
    const agent = new ProxyAgent(proxyUrl);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PING_TIMEOUT_MS);
    try {
      // generate_204 is a tiny no-body endpoint — confirms the proxy is up AND can reach YouTube.
      const r = await undiciFetch("https://www.youtube.com/generate_204", {
        dispatcher: agent,
        signal: ctrl.signal,
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      online = r.status >= 200 && r.status < 400;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    online = false; // proxy unreachable / auth failed / timed out
  }

  cached = { online, at: now };
  return NextResponse.json({ online }, { headers: { "Cache-Control": "no-store" } });
}
