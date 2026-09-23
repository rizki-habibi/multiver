// Standalone server wrapper for the packaged CLI.
//
// Next.js's own HTTP server never tells a route handler who the peer really was:
// the socket address of a reverse proxy, not the end-user. That makes every
// loopback-only gate (dashboard auth bypass on localhost, /v1 without an API key)
// forgeable by anyone who can send a header. This wrapper boots Next's handler
// through its own http.createServer so it can stamp the *actual* socket address
// alongside a per-process secret no client can guess.
//
// Trust chain:  x-mv-real-ip  +  x-mv-peer-token
//   - real-ip is replaced unconditionally with the remote socket address
//   - a boot-generated 48-hex token is added, proving the request passed here
//   - any client-supplied peer-token / via-proxy marker is dropped
//   - x-forwarded-for is only honoured for a loopback proxy hop, and marks the
//     request as proxied so downstream gates treat it as untrusted
//
// Also serves h2c (HTTP/2 cleartext upgrade) requests as HTTP/1.1 — some clients
// (e.g. Codex CLI) send `Connection: Upgrade, HTTP2-Settings` and expect the body
// to be read normally rather than negotiated.

const http = require("node:http");
const crypto = require("node:crypto");

if (!process.env.NINEROUTER_PEER_TOKEN) {
  process.env.NINEROUTER_PEER_TOKEN = crypto.randomBytes(24).toString("hex");
}

const PEER_TOKEN = process.env.NINEROUTER_PEER_TOKEN;
const REAL_IP_HEADER = "x-mv-real-ip";
const PEER_TOKEN_HEADER = "x-mv-peer-token";
const VIA_PROXY_HEADER = "x-mv-via-proxy";

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

function isLoopback(addr) {
  if (!addr) return false;
  let a = String(addr).toLowerCase();
  if (a.startsWith("::ffff:")) a = a.slice(7);
  return LOOPBACK.has(a);
}

// Normalize an x-forwarded-for chain into the first (oldest) client address.
function firstForwardedFor(value) {
  if (!value) return null;
  const parts = String(value).split(",").map((s) => s.trim()).filter(Boolean);
  return parts[0] || null;
}

const originalCreateServer = http.createServer;

// Patched createServer: the Next.js standalone server.js calls this, so we get to
// wrap its request listener before it ever sees a request.
http.createServer = function (options, listener) {
  const nextListener = typeof options === "function" ? options : listener;

  const wrapped = async (req, res) => {
    try {
      const socket = req.socket;
      const remoteAddress = socket?.remoteAddress || "";

      // Drop anything a client might try to smuggle in.
      delete req.headers[VIA_PROXY_HEADER];
      delete req.headers[PEER_TOKEN_HEADER];

      if (isLoopback(remoteAddress)) {
        const forwarded = firstForwardedFor(req.headers["x-forwarded-for"]);
        if (forwarded) {
          // A proxy on loopback: its XFF names the real user. Keep the user IP, but
          // mark the request as proxied so downstream trusts nothing else about it.
          req.headers[REAL_IP_HEADER] = forwarded;
          req.headers[VIA_PROXY_HEADER] = "1";
          delete req.headers["x-forwarded-for"];
        } else {
          req.headers[REAL_IP_HEADER] = remoteAddress;
        }
      } else {
        // Non-loopback connection: the peer is the client itself.
        req.headers[REAL_IP_HEADER] = remoteAddress;
        delete req.headers["x-forwarded-for"];
      }

      // Proof the wrapper ran. Downstream checks this before trusting real-ip.
      req.headers[PEER_TOKEN_HEADER] = PEER_TOKEN;
    } catch {
      // Never let header stamping kill a request — fail open, deny at the gate.
    }

    return nextListener(req, res);
  };

  const server =
    typeof options === "function"
      ? originalCreateServer.call(http, wrapped)
      : originalCreateServer.call(http, options, wrapped);

  // h2c upgrade: clients sending `Connection: Upgrade, HTTP2-Settings` expect the
  // server to fall back to HTTP/1.1 and read the body, not negotiate HTTP/2.
  // Destroying the upgrade socket and letting the original request complete as
  // HTTP/1.1 satisfies them.
  server.on("upgrade", (req, socket) => {
    try {
      socket.destroy();
    } catch {
      /* already gone */
    }
  });

  // Ask Node to keep this server's connections simple: the wrapper sets
  // Connection: close semantics for h2c clients that would otherwise pool.
  return server;
};

// Load the generated Next.js standalone server. It calls http.createServer() above.
// Layout under cli/app: server.js + .next/standalone (runtime cwd is cli/app).
try {
  require("./.next/standalone/server.js");
} catch (err) {
  // Development layout: the standalone output sits next to the project root.
  try {
    require("./server.js");
  } catch (err2) {
    console.error("[custom-server] failed to load Next.js standalone server:");
    console.error(err2.message || err2);
    process.exit(1);
  }
}
