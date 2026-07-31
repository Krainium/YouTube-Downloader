#!/usr/bin/env node
// Builds an Xray config from the VLESS_NODES env var and prints the node count.
//
// One HTTP inbound per node, each routed only to its own outbound. YouTube signs
// CDN URLs against the requesting IP, so a caller picks an exit by port and pins
// the download to it. A shared balancer would scatter them and the CDN would 403.
//
//   node build-xray-config.js <out.json>
const fs = require("fs");

const BASE_PORT = Number(process.env.XRAY_BASE_PORT || 10809);
const USER = process.env.XRAY_PROXY_USER || "ytdl";
const PASS = process.env.XRAY_PROXY_PASS || "local";

function parse(uri) {
  const [main, frag = ""] = uri.slice("vless://".length).split("#");
  const at = main.lastIndexOf("@");
  const [hostport, qs = ""] = main.slice(at + 1).split("?");
  const q = new URLSearchParams(qs);
  const colon = hostport.lastIndexOf(":");
  return {
    uuid: main.slice(0, at),
    host: hostport.slice(0, colon),
    port: Number(hostport.slice(colon + 1)),
    security: q.get("security") || "none",
    pbk: q.get("pbk") || "",
    sni: q.get("sni") || "",
    sid: q.get("sid") || "",
    fp: q.get("fp") || "chrome",
    flow: q.get("flow") || "",
    network: q.get("type") || "tcp",
  };
}

function outbound(n, tag) {
  const stream = { network: n.network, security: n.security };
  if (n.security === "reality") {
    // The fingerprint is not cosmetic: the server matches it against the ClientHello.
    stream.realitySettings = {
      serverName: n.sni, fingerprint: n.fp,
      publicKey: n.pbk, shortId: n.sid, spiderX: "",
    };
  } else if (n.security === "tls") {
    stream.tlsSettings = { serverName: n.sni, fingerprint: n.fp };
  }
  return {
    tag,
    protocol: "vless",
    settings: {
      vnext: [{
        address: n.host, port: n.port,
        users: [{ id: n.uuid, encryption: "none", flow: n.flow }],
      }],
    },
    streamSettings: stream,
  };
}

const nodes = (process.env.VLESS_NODES || "")
  .split("\n").map((s) => s.trim())
  .filter((s) => s.startsWith("vless://"))
  .map(parse);

if (nodes.length === 0) {
  console.error("VLESS_NODES is empty or has no vless:// entries");
  process.exit(1);
}

const inbounds = [];
const outbounds = [];
const rules = [];

nodes.forEach((n, i) => {
  inbounds.push({
    tag: `in${i}`,
    port: BASE_PORT + i,
    listen: "127.0.0.1",
    protocol: "http",
    settings: { accounts: [{ user: USER, pass: PASS }] },
  });
  outbounds.push(outbound(n, `out${i}`));
  rules.push({ type: "field", inboundTag: [`in${i}`], outboundTag: `out${i}` });
});

// Unmatched traffic would otherwise leave via the first outbound and be
// attributed to the wrong exit.
outbounds.push({ tag: "blocked", protocol: "blackhole" });

fs.writeFileSync(process.argv[2], JSON.stringify({
  log: { loglevel: "warning" },
  inbounds,
  outbounds,
  routing: { domainStrategy: "AsIs", rules },
}));

process.stdout.write(String(nodes.length));
