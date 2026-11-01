import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const distDir = path.resolve(repoRoot, "frontend", "confidence-panel", "dist");
const demoFile = path.resolve(repoRoot, "visuals", "confidence", "demo.html");

const PORT = Number(process.env.PORT || 3000);

const AGENT_ENV = {
    cto: "ELEVENLABS_AGENT_ID_CTO",
    tech_bro: "ELEVENLABS_AGENT_ID_TECH_BRO",
    interrogator: "ELEVENLABS_AGENT_ID_INTERROGATOR",
    sympathizer: "ELEVENLABS_AGENT_ID_SYMPATHIZER",
};

const CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
    ".mp4": "video/mp4",
};

function sendJson(res, status, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
        "content-type": "application/json; charset=utf-8",
        "content-length": Buffer.byteLength(body),
        "cache-control": "no-store",
    });
    res.end(body);
}

function sendHtml(res, status, html) {
    res.writeHead(status, {
        "content-type": "text/html; charset=utf-8",
        "content-length": Buffer.byteLength(html),
        "cache-control": "no-store",
    });
    res.end(html);
}

function placeholderHtml() {
    return [
        "<!doctype html>",
        '<html lang="en">',
        "<head>",
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        "<title>investor-verdict deploy</title>",
        "<style>",
        "body{font-family:system-ui,sans-serif;max-width:640px;margin:48px auto;padding:0 20px;line-height:1.5}",
        ".card{border:1px solid #ddd;border-radius:12px;padding:20px}",
        "code{background:#f4f4f4;padding:2px 6px;border-radius:6px}",
        "</style>",
        "</head>",
        "<body>",
        "<main class=\"card\">",
        "<h1>investor-verdict is live on Render</h1>",
        "<p>Static bundle not found on this deploy. The API is running.</p>",
        "<ul>",
        "<li>Health check: <code>GET /health</code> returns <code>ok true</code></li>",
        "<li>Signed URL endpoint: <code>POST /api/signed-url</code> with JSON body</li>",
        "</ul>",
        "<p>Frontend owner: build <code>frontend/confidence-panel</code> so its",
        "<code>dist</code> folder ships with the service, or add",
        "<code>visuals/confidence/demo.html</code> as the fallback page.</p>",
        "<p>Agent contracts and mock mode: see <code>agents/README.md</code> in the repo.</p>",
        "<p>Server Sentry is optional and disabled by default. See <code>deploy/SENTRY_SETUP.md</code>.</p>",
        "</main>",
        "</body>",
        "</html>",
        "",
    ].join("\n");
}

function safeJoin(root, requestPath) {
    let decoded;
    try {
        decoded = decodeURIComponent(requestPath);
    } catch {
        return undefined;
    }
    const joined = path.normalize(path.join(root, decoded));
    if (joined === root || joined.startsWith(root + path.sep)) {
        return joined;
    }
    return null;
}

function serveFile(res, filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const type = CONTENT_TYPES[ext] || "application/octet-stream";
    fs.stat(filePath, (statErr, stat) => {
        if (statErr || !stat.isFile()) {
            sendJson(res, 404, { ok: false, error: "not found" });
            return;
        }
        res.writeHead(200, { "content-type": type });
        fs.createReadStream(filePath).pipe(res);
    });
}

function serveStatic(req, res, urlPath) {
    const hasDist = fs.existsSync(path.join(distDir, "index.html"));
    if (hasDist) {
        const rel = urlPath === "/" ? "/index.html" : urlPath;
        const filePath = safeJoin(distDir, rel);
        if (filePath === undefined) {
            sendJson(res, 400, { ok: false, error: "invalid path encoding" });
            return;
        }
        if (!filePath) {
            sendJson(res, 403, { ok: false, error: "forbidden" });
            return;
        }
        fs.stat(filePath, (statErr, stat) => {
            if (!statErr && stat.isDirectory()) {
                serveFile(res, path.join(filePath, "index.html"));
                return;
            }
            if (!statErr && stat.isFile()) {
                serveFile(res, filePath);
                return;
            }
            serveFile(res, path.join(distDir, "index.html"));
        });
        return;
    }
    if (urlPath === "/" || urlPath === "/demo.html") {
        if (fs.existsSync(demoFile)) {
            serveFile(res, demoFile);
            return;
        }
        sendHtml(res, 200, placeholderHtml());
        return;
    }
    sendJson(res, 404, { ok: false, error: "not found" });
}

const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60000;
const rateBuckets = new Map();

function clientIp(req) {
    const forwarded = req.headers && req.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.length > 0) {
        const first = forwarded.split(",")[0].trim();
        if (first) {
            return first;
        }
    }
    const addr = req.socket && req.socket.remoteAddress;
    return addr || "unknown";
}

function checkRateLimit(ip) {
    const now = Date.now();
    const entry = rateBuckets.get(ip);
    if (!entry || now - entry.start > RATE_LIMIT_WINDOW_MS) {
        rateBuckets.set(ip, { count: 1, start: now });
        return false;
    }
    entry.count += 1;
    if (rateBuckets.size > 2000) {
        for (const [key, value] of rateBuckets) {
            if (now - value.start > RATE_LIMIT_WINDOW_MS) {
                rateBuckets.delete(key);
            }
        }
    }
    return entry.count > RATE_LIMIT_MAX;
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on("data", (chunk) => {
            chunks.push(chunk);
            if (Buffer.concat(chunks).length > 65536) {
                reject(new Error("body too large"));
                req.destroy();
            }
        });
        req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        req.on("error", reject);
    });
}

async function handleSignedUrl(req, res) {
    // Note for private mode: add an Origin or Referer allowlist check here
    // before minting, plus auth, when the demo moves past public judging.
    const ip = clientIp(req);
    if (checkRateLimit(ip)) {
        sendJson(res, 429, { ok: false, error: "rate limited, try again soon" });
        return;
    }
    let payload;
    try {
        const raw = await readBody(req);
        payload = raw ? JSON.parse(raw) : {};
    } catch {
        sendJson(res, 400, { ok: false, error: "invalid JSON body, expected agentKey" });
        return;
    }
    const agentKey = payload && payload.agentKey;
    if (typeof agentKey !== "string" || !Object.hasOwn(AGENT_ENV, agentKey)) {
        sendJson(res, 400, {
            ok: false,
            error: "unknown agentKey, use cto, tech_bro, interrogator, or sympathizer",
        });
        return;
    }
    const envName = AGENT_ENV[agentKey];
    const agentId = process.env[envName];
    if (!agentId) {
        sendJson(res, 502, { ok: false, error: "agent id not configured on server" });
        return;
    }
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
        sendJson(res, 502, { ok: false, error: "signed URL service not configured" });
        return;
    }
    try {
        const upstream = await fetch(
            `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
            { headers: { "xi-api-key": apiKey } }
        );
        if (!upstream.ok) {
            sendJson(res, 502, { ok: false, error: "signed URL request failed" });
            return;
        }
        const data = await upstream.json();
        const signedUrl = data.signed_url || data.signedUrl;
        if (!signedUrl) {
            sendJson(res, 502, { ok: false, error: "signed URL request failed" });
            return;
        }
        sendJson(res, 200, { ok: true, signedUrl });
    } catch {
        sendJson(res, 502, { ok: false, error: "signed URL request failed" });
    }
}

const server = http.createServer((req, res) => {
    const method = (req.method || "GET").toUpperCase();
    const urlPath = (req.url || "/").split("?")[0];

    if (method === "GET" && urlPath === "/health") {
        sendJson(res, 200, { ok: true, service: "investor-verdict", time: new Date().toISOString() });
        return;
    }
    if (method === "POST" && urlPath === "/api/signed-url") {
        handleSignedUrl(req, res);
        return;
    }
    if (method === "GET" || method === "HEAD") {
        serveStatic(req, res, urlPath || "/");
        return;
    }
    sendJson(res, 405, { ok: false, error: "method not allowed" });
});

server.listen(PORT, () => {
    console.log(`investor-verdict deploy listening on port ${PORT}`);
});
