// Exit selection. Xray runs beside this server and exposes one local HTTP proxy
// port per VLESS node, so choosing an exit is choosing a port.
//
// YouTube signs CDN URLs against the requesting IP, so whichever exit fetched
// the format list must also fetch the bytes. /api/info returns a node index and
// /api/stream takes it back.

const BASE_PORT = Number(process.env.XRAY_BASE_PORT || 10809);
const PROXY_USER = process.env.XRAY_PROXY_USER || "ytdl";
const PROXY_PASS = process.env.XRAY_PROXY_PASS || "local";

/** Number of exits Xray is listening for. 0 means no pool is configured. */
export function poolSize(): number {
  return Number(process.env.VLESS_POOL_SIZE || 0);
}

export function vlessEnabled(): boolean {
  return poolSize() > 0;
}

/** Local proxy URL for an exit, or null if the index is out of range. */
export function proxyUrlFor(index: number): string | null {
  if (!Number.isInteger(index) || index < 0 || index >= poolSize()) return null;
  return `http://${PROXY_USER}:${PROXY_PASS}@127.0.0.1:${BASE_PORT + index}`;
}

/**
 * Every exit index, shuffled. Callers walk this so one dead or rate-limited
 * node costs a single attempt rather than the whole request.
 */
export function shuffledNodes(): number[] {
  const idx = Array.from({ length: poolSize() }, (_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}
