import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { once } from "node:events";
import * as nodeModule from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const distDir = path.resolve(repoRoot, "frontend", "confidence-panel", "dist");
const demoFile = path.resolve(repoRoot, "visuals", "confidence", "demo.html");
const agentsServerDir = path.resolve(repoRoot, "agents", "server");
const vendorStubUrl = pathToFileURL(path.join(here, "elevenlabs-stub.mjs")).href;
const vendorNames = new Set(["@elevenlabs/client", "@elevenlabs/elevenlabs-js"]);

function vendorResolve(specifier, context, next) {
    if (vendorNames.has(specifier)) {
        let result;
        try {
            result = next(specifier, context);
        } catch {
            return { url: vendorStubUrl, shortCircuit: true };
        }
        if (result && typeof result.then === "function") {
            return result.catch(() => ({ url: vendorStubUrl, shortCircuit: true }));
        }
        return result;
    }
    return next(specifier, context);
}

try {
    if (typeof nodeModule.registerHooks === "function") {
        nodeModule.registerHooks({ resolve: vendorResolve });
    } else if (typeof nodeModule.register === "function") {
        nodeModule.register("./elevenlabs-resolve.mjs", import.meta.url);
    }
} catch {
    console.log("Vendor fallback hooks skipped.");
}

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

async function initSentryOptional() {
    const dsn = process.env.SENTRY_DSN || "";
    if (!dsn) {
        return;
    }
    try {
        const mod = await import("@sentry/node");
        const init = mod.init || (mod.default && mod.default.init);
        if (typeof init === "function") {
            init({
                dsn: dsn,
                tracesSampleRate: 1.0,
                beforeSend(event) {
                    return scrubSentryEvent(event);
                },
                beforeBreadcrumb(crumb) {
                    if (shouldDropSentryBreadcrumb(crumb)) {
                        return null;
                    }
                    return deepScrubSentry(crumb);
                },
            });
            console.log("Server Sentry enabled with scrubber.");
        } else {
            console.log("Server Sentry skipped: init not found in @sentry/node.");
        }
    } catch {
        console.log("Server Sentry skipped: @sentry/node not installed.");
    }
}

function isSentrySensitiveKey(key) {
    if (typeof key !== "string") {
        return false;
    }
    return (/signed[_-]?url/i.test(key)
        || /transcript/i.test(key)
        || /^pitch$/i.test(key)
        || /founder/i.test(key)
        || /^reply$/i.test(key)
        || /pending[_-]?concern/i.test(key)
        || /^message$/i.test(key)
        || /^text$/i.test(key));
}

function scrubSentryString(text) {
    if (typeof text !== "string") {
        return text;
    }
    let out = text;
    out = out.replace(/wss:\/\/[^\s"'`]+/gi, "[wss url removed]");
    if (/signed[_-]?url/i.test(out)) {
        out = out
            .replace(/https?:\/\/[^\s"'`]+/gi, "[signed url removed]")
            .replace(/signed[_-]?url[^\s"'`;,]*/gi, "[signed url removed]");
    }
    return out;
}

function deepScrubSentry(node, depth, seen) {
    if (node === null || node === undefined) {
        return node;
    }
    if (typeof node === "string") {
        return scrubSentryString(node);
    }
    if (typeof node !== "object") {
        return node;
    }
    const currentDepth = typeof depth === "number" ? depth : 0;
    if (currentDepth > 8) {
        return "[removed depth limit]";
    }
    let activeSeen = seen;
    if (!activeSeen) {
        activeSeen = new WeakSet();
    }
    if (activeSeen.has(node)) {
        return node;
    }
    activeSeen.add(node);
    if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i += 1) {
            node[i] = deepScrubSentry(node[i], currentDepth + 1, activeSeen);
        }
        return node;
    }
    for (const key of Object.keys(node)) {
        if (isSentrySensitiveKey(key)) {
            node[key] = "[removed]";
        } else {
            node[key] = deepScrubSentry(node[key], currentDepth + 1, activeSeen);
        }
    }
    return node;
}

function shouldDropSentryBreadcrumb(crumb) {
    try {
        const text = JSON.stringify(crumb || {});
        return (/signed[_-]?url/i.test(text)
            || /transcript/i.test(text)
            || /wss:\/\//i.test(text)
            || /pitch/i.test(text));
    } catch {
        return false;
    }
}

function scrubSentryEvent(event) {
    if (!event || typeof event !== "object") {
        return event;
    }
    if (event.request && typeof event.request === "object") {
        if (typeof event.request.url === "string") {
            event.request.url = scrubSentryString(event.request.url);
            if (/signed[_-]?url/i.test(event.request.url)) {
                event.request.url = "[signed url removed]";
            }
        }
        if (event.request.query_string !== undefined) {
            event.request.query_string = deepScrubSentry(event.request.query_string);
        }
        if (event.request.data !== undefined) {
            event.request.data = deepScrubSentry(event.request.data);
        }
        if (event.request.headers !== undefined) {
            event.request.headers = deepScrubSentry(event.request.headers);
        }
        if (event.request.cookies !== undefined) {
            event.request.cookies = deepScrubSentry(event.request.cookies);
        }
        deepScrubSentry(event.request);
    }
    if (event.contexts && typeof event.contexts === "object") {
        deepScrubSentry(event.contexts);
    }
    if (event.extra && typeof event.extra === "object") {
        deepScrubSentry(event.extra);
    }
    const exc = event.exception;
    if (exc && typeof exc === "object" && Array.isArray(exc.values)) {
        for (const value of exc.values) {
            deepScrubSentry(value);
            if (value && typeof value.value === "string") {
                value.value = scrubSentryString(value.value);
            }
        }
    } else if (exc && typeof exc === "object") {
        deepScrubSentry(exc);
    }
    const crumbs = event.breadcrumbs;
    if (Array.isArray(crumbs)) {
        event.breadcrumbs = crumbs.map((crumb) => deepScrubSentry(crumb));
    } else if (crumbs && typeof crumbs === "object" && Array.isArray(crumbs.values)) {
        crumbs.values = crumbs.values.map((crumb) => deepScrubSentry(crumb));
    }
    if (typeof event.message === "string") {
        event.message = scrubSentryString(event.message);
    }
    return event;
}

void initSentryOptional();

let g_agentBridge = null;
let g_textPanel = null;
let g_replyAudio = null;
let g_replyCoach = null;
let g_getSignedUrl = null;
let g_getVoiceToken = null;
let g_servicesLoaded = false;
let g_servicesLoading = null;
let g_servicesNote = "";

async function ensureServices() {
    if (g_servicesLoaded) {
        return;
    }
    if (g_servicesLoading) {
        await g_servicesLoading;
        return;
    }
    g_servicesLoading = (async () => {
        try {
            const bridgeUrl = pathToFileURL(path.join(agentsServerDir, "agent-bridge.mjs")).href;
            const bridgeMod = await import(bridgeUrl);
            g_agentBridge = bridgeMod.createAgentBridge();
            const coachMod = await import(pathToFileURL(path.join(agentsServerDir, "reply-coach.mjs")).href);
            g_replyCoach = coachMod.createReplyCoach();
        } catch {
            g_servicesNote = "agent bridge unavailable";
            g_servicesLoaded = true;
            return;
        }
        try {
            const providerUrl = pathToFileURL(path.join(agentsServerDir, "panel-provider.mjs")).href;
            const providerMod = await import(providerUrl);
            const created = providerMod.createPanelProvider();
            g_getSignedUrl = created.getSignedUrl;
            const client = created.client;
            const textUrl = pathToFileURL(path.join(agentsServerDir, "text-panel.mjs")).href;
            const textMod = await import(textUrl);
            g_textPanel = textMod.createTextPanelService({ getSignedUrl: g_getSignedUrl });
            const replyUrl = pathToFileURL(path.join(agentsServerDir, "reply-audio.mjs")).href;
            const replyMod = await import(replyUrl);
            g_replyAudio = replyMod.createReplyAudio({
                textPanel: g_textPanel,
                synthesize: ({ voiceId, text, signal }) => client.textToSpeech.stream(
                    voiceId,
                    { text: text, modelId: "eleven_v4_turbo", outputFormat: "mp3_44100_128" },
                    { abortSignal: signal, timeoutInSeconds: 45, maxRetries: 0 }
                ),
            });
            g_getVoiceToken = async () => (
                await client.tokens.singleUse.create("realtime_scribe", { maxRetries: 0, timeoutInSeconds: 15 })
            ).token;
            g_servicesNote = "panel services ready";
        } catch {
            g_servicesNote = "panel services unavailable, bridge only";
        }
        g_servicesLoaded = true;
    })();
    await g_servicesLoading;
}

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
        '<main class="card">',
        "<h1>investor-verdict is live on Render</h1>",
        "<p>Static bundle not found on this deploy. The API is running.</p>",
        "<ul>",
        "<li>Health check: <code>GET /health</code> returns <code>ok true</code></li>",
        "<li>Signed URL endpoint: <code>POST /api/signed-url</code> with JSON body</li>",
        "<li>Panel text round: <code>POST /api/evaluate</code> with JSON body</li>",
        "<li>Panel reset: <code>POST /api/reset</code> with JSON body</li>",
        "<li>Investor audio: <code>GET /api/reply-audio?turn=1&amp;role=cto</code></li>",
        "<li>Voice token: <code>POST /api/voice-token</code> with JSON body</li>",
        "<li>Coding agent bridge: <code>/api/agent-bridge/*</code> (connect, session, mode, reject, ready, disconnect, context, job, suggest)</li>",
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
const RATE_BUCKET_MAX = 2000;
const rateBuckets = new Map();

const VOICE_LIMIT_MAX = 12;
const VOICE_LIMIT_WINDOW_MS = 60000;
const voiceBuckets = new Map();
const VOICE_BUCKET_MAX = 2000;

function isTrustedProxy() {
    const value = String(process.env.TRUST_PROXY || "").toLowerCase().trim();
    return value === "1" || value === "true" || value === "yes";
}

function clientIp(req) {
    if (isTrustedProxy()) {
        const forwarded = req.headers && req.headers["x-forwarded-for"];
        if (typeof forwarded === "string" && forwarded.length > 0) {
            const first = forwarded.split(",")[0].trim();
            if (first) {
                return first;
            }
        }
        const realIp = req.headers && req.headers["x-real-ip"];
        if (typeof realIp === "string" && realIp.trim()) {
            return realIp.trim();
        }
    }
    const addr = req.socket && req.socket.remoteAddress;
    return addr || "unknown";
}

function pruneRateBuckets(now) {
    for (const [key, value] of rateBuckets) {
        if (now - value.start > RATE_LIMIT_WINDOW_MS) {
            rateBuckets.delete(key);
        }
    }
    while (rateBuckets.size > RATE_BUCKET_MAX) {
        const oldest = rateBuckets.keys().next();
        if (oldest.done) {
            break;
        }
        rateBuckets.delete(oldest.value);
    }
}

function pruneVoiceBuckets(now) {
    for (const [key, value] of voiceBuckets) {
        if (now - value.start > VOICE_LIMIT_WINDOW_MS) {
            voiceBuckets.delete(key);
        }
    }
    while (voiceBuckets.size > VOICE_BUCKET_MAX) {
        const oldest = voiceBuckets.keys().next();
        if (oldest.done) {
            break;
        }
        voiceBuckets.delete(oldest.value);
    }
}

function checkRateLimit(ip) {
    const now = Date.now();
    pruneRateBuckets(now);
    const entry = rateBuckets.get(ip);
    if (!entry || now - entry.start > RATE_LIMIT_WINDOW_MS) {
        rateBuckets.delete(ip);
        rateBuckets.set(ip, { count: 1, start: now });
        return false;
    }
    entry.count += 1;
    rateBuckets.delete(ip);
    rateBuckets.set(ip, entry);
    return entry.count > RATE_LIMIT_MAX;
}

function checkVoiceLimit(ip) {
    const now = Date.now();
    pruneVoiceBuckets(now);
    const key = ip || "unknown";
    const entry = voiceBuckets.get(key);
    if (!entry || now - entry.start > VOICE_LIMIT_WINDOW_MS) {
        voiceBuckets.delete(key);
        voiceBuckets.set(key, { count: 1, start: now });
        return false;
    }
    entry.count += 1;
    voiceBuckets.delete(key);
    voiceBuckets.set(key, entry);
    return entry.count > VOICE_LIMIT_MAX;
}

function appOrigin() {
    const configured = String(process.env.APP_ORIGIN || "").trim();
    if (configured) {
        return configured;
    }
    return "";
}

function isLoopbackHost(host) {
    const value = String(host || "").toLowerCase().split(":")[0].trim();
    return value === "localhost"
        || value === "127.0.0.1"
        || value === "::1"
        || value === "[::1]"
        || value.endsWith(".localhost");
}

function checkOrigin(req) {
    const origin = req.headers && req.headers.origin;
    if (typeof origin === "string" && origin) {
        const allowed = appOrigin();
        if (allowed && origin === allowed) {
            return true;
        }
        const host = req.headers && req.headers.host;
        if (host && (origin === "https://" + host || origin === "http://" + host)) {
            return true;
        }
        if (!allowed) {
            return false;
        }
        return false;
    }
    const site = req.headers && req.headers["sec-fetch-site"];
    if (typeof site === "string" && site.toLowerCase() === "cross-site") {
        return false;
    }
    return true;
}

function denyOrigin(req, res) {
    if (!checkOrigin(req)) {
        sendJson(res, 403, { ok: false, error: "origin not allowed" });
        return true;
    }
    return false;
}

function isSecureRequest(req) {
    const proto = String((req.headers && req.headers["x-forwarded-proto"]) || "").toLowerCase().split(",")[0].trim();
    if (proto === "https") {
        return true;
    }
    if (req.socket && req.socket.encrypted) {
        return true;
    }
    if (String(process.env.NODE_ENV || "").toLowerCase() === "production") {
        const host = String((req.headers && req.headers.host) || "");
        if (host && !isLoopbackHost(host)) {
            return true;
        }
    }
    return false;
}

function isPrivateSignedUrlMode() {
    const value = String(process.env.SIGNED_URL_PRIVATE || process.env.PRIVATE_AGENT_MODE || "").toLowerCase().trim();
    return value === "1" || value === "true" || value === "yes";
}

function checkSignedUrlGate(req) {
    if (!isPrivateSignedUrlMode()) {
        return true;
    }
    const cookies = parseCookies(req);
    if (cookieValue(cookies, "verdict_room")) {
        return true;
    }
    const gateToken = String(process.env.SIGNED_URL_GATE_TOKEN || "");
    if (gateToken) {
        const headerToken = String((req.headers && req.headers["x-gate-token"]) || "");
        if (headerToken && headerToken === gateToken) {
            return true;
        }
    }
    return false;
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

function readJsonLimited(req, maxBytes) {
    return new Promise((resolve, reject) => {
        let raw = "";
        req.on("data", (chunk) => {
            raw += chunk;
            if (raw.length > maxBytes) {
                reject(Object.assign(new Error("Request too large."), { status: 413 }));
                req.destroy();
            }
        });
        req.on("end", () => {
            try {
                resolve(raw ? JSON.parse(raw) : {});
            } catch {
                reject(Object.assign(new Error("Invalid JSON."), { status: 400 }));
            }
        });
        req.on("error", reject);
    });
}

function requiresJson(req) {
    const ctype = String((req.headers && req.headers["content-type"]) || "");
    return ctype.includes("application/json");
}

function parseCookies(req) {
    const header = String((req.headers && req.headers.cookie) || "");
    const out = {};
    const parts = header.split(";");
    for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) {
            continue;
        }
        const eq = trimmed.indexOf("=");
        if (eq < 0) {
            continue;
        }
        const key = trimmed.slice(0, eq).trim();
        const value = trimmed.slice(eq + 1).trim();
        if (key && Object.hasOwn(out, key) === false) {
            out[key] = value;
        }
    }
    return out;
}

function cookieValue(cookies, name) {
    const value = cookies[name];
    if (typeof value !== "string" || !value) {
        return undefined;
    }
    return value;
}

function appendCookie(res, value) {
    const prior = res.getHeader("Set-Cookie");
    if (Array.isArray(prior)) {
        res.setHeader("Set-Cookie", [...prior, value]);
    } else if (typeof prior === "string") {
        res.setHeader("Set-Cookie", [prior, value]);
    } else {
        res.setHeader("Set-Cookie", [value]);
    }
}

function roomCookie(value, req) {
    const secure = req && isSecureRequest(req) ? "; Secure" : "";
    return "verdict_room=" + value + "; HttpOnly; SameSite=Strict; Path=/; Max-Age=1800" + secure;
}

function sessionCookie(value, req, maxAge = 120) {
    const secure = req && isSecureRequest(req) ? "; Secure" : "";
    return "verdict_session=" + value + "; HttpOnly; SameSite=Strict; Path=/; Max-Age=" + maxAge + secure;
}

function clearSessionCookie(req) {
    const secure = req && isSecureRequest(req) ? "; Secure" : "";
    return "verdict_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0" + secure;
}

function statusOf(error, fallback) {
    if (error && typeof error.status === "number") {
        return error.status;
    }
    return fallback;
}

function messageOf(error, fallback) {
    if (error && typeof error.status === "number" && typeof error.message === "string" && error.message) {
        return error.message;
    }
    return fallback;
}

async function handleSignedUrl(req, res) {
    if (denyOrigin(req, res)) {
        return;
    }
    const ip = clientIp(req);
    if (checkRateLimit(ip)) {
        sendJson(res, 429, { ok: false, error: "rate limited, try again soon" });
        return;
    }
    if (!checkSignedUrlGate(req)) {
        sendJson(res, 403, { ok: false, error: "signed URL minting requires owner session in private mode" });
        return;
    }
    if (!requiresJson(req)) {
        sendJson(res, 415, { ok: false, error: "JSON required" });
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

async function mintRoleSignedUrl(req, res) {
    if (denyOrigin(req, res)) {
        return;
    }
    const ip = clientIp(req);
    if (checkRateLimit(ip)) {
        sendJson(res, 429, { ok: false, error: "rate limited, try again soon" });
        return;
    }
    if (!checkSignedUrlGate(req)) {
        sendJson(res, 403, { ok: false, error: "signed URL minting requires owner session in private mode" });
        return;
    }
    if (!requiresJson(req)) {
        sendJson(res, 415, { ok: false, error: "JSON required" });
        return;
    }
    let payload;
    try {
        payload = await readJsonLimited(req, 1024);
    } catch (error) {
        sendJson(res, statusOf(error, 400), { ok: false, error: messageOf(error, "Invalid JSON.") });
        return;
    }
    const role = payload && payload.role;
    if (typeof role !== "string" || !Object.hasOwn(AGENT_ENV, role)) {
        sendJson(res, 400, { ok: false, error: "unknown investor role" });
        return;
    }
    const agentId = process.env[AGENT_ENV[role]];
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
        if (typeof signedUrl !== "string" || !signedUrl) {
            sendJson(res, 502, { ok: false, error: "signed URL request failed" });
            return;
        }
        sendJson(res, 200, { ok: true, signedUrl });
    } catch {
        sendJson(res, 502, { ok: false, error: "signed URL request failed" });
    }
}

function handleElevenlabsConfig(req, res) {
    const ip = clientIp(req);
    if (checkRateLimit(ip)) {
        sendJson(res, 429, { ok: false, error: "rate limited, try again soon" });
        return;
    }
    let configured = false;
    try {
        configured = Boolean(process.env.ELEVENLABS_API_KEY)
            && Object.keys(AGENT_ENV).every((key) => Boolean(process.env[AGENT_ENV[key]]));
    } catch {
        configured = false;
    }
    sendJson(res, 200, { ok: true, configured: configured, startScore: 50 });
}

async function handlePanel(req, res, urlPath) {
    if ((req.method || "GET").toUpperCase() === "POST" && denyOrigin(req, res)) {
        return;
    }
    const ip = clientIp(req);
    if (checkRateLimit(ip)) {
        sendJson(res, 429, { ok: false, error: "rate limited, try again soon" });
        return;
    }
    if (!requiresJson(req)) {
        sendJson(res, 415, { ok: false, error: "JSON required" });
        return;
    }
    await ensureServices();
    if (!g_agentBridge || !g_textPanel) {
        sendJson(res, 502, { ok: false, error: "evaluation service unavailable" });
        return;
    }
    const cookies = parseCookies(req);
    const incomingRoom = cookieValue(cookies, "verdict_room");
    const sessionId = cookieValue(cookies, "verdict_session");
    if (urlPath === "/api/offer-decision" && !sessionId) {
        sendJson(res, 409, { error: "An offer decision requires the live call cookie." });
        return;
    }
    let roomId = incomingRoom;
    try {
        roomId = g_agentBridge.ensure(incomingRoom);
    } catch (error) {
        sendJson(res, statusOf(error, 502), { ok: false, error: messageOf(error, "App connection failed.") });
        return;
    }
    appendCookie(res, roomCookie(roomId, req));
    if (urlPath === "/api/reset") {
        try {
            await readJsonLimited(req, 20000);
            try {
                g_agentBridge.reset(roomId);
                g_replyCoach?.reset(roomId);
            } catch (error) {
                sendJson(res, statusOf(error, 502), { ok: false, error: messageOf(error, "Reset failed.") });
                return;
            }
            if (g_replyAudio && sessionId) {
                try {
                    g_replyAudio.reset(sessionId);
                } catch {
                    sendJson(res, 502, { ok: false, error: "Reset failed." });
                    return;
                }
            }
            await g_textPanel.reset(sessionId);
            appendCookie(res, clearSessionCookie(req));
            sendJson(res, 200, { scores: [50, 50, 50, 50] });
        } catch (error) {
            sendJson(res, statusOf(error, 502), { ok: false, error: messageOf(error, "Reset failed.") });
        }
        return;
    }
    let ticket = null;
    try {
        const body = await readJsonLimited(req, 20000);
        const offerDecision = urlPath === "/api/offer-decision";
        ticket = g_agentBridge.begin(roomId, offerDecision
            ? { pitch: `I ${body?.decision} the offer from ${body?.role}.` } : body || {}, { offerDecision });
        const out = offerDecision
            ? await g_textPanel.decideOffer(body, sessionId) : await g_textPanel.evaluate(body, sessionId);
        let revision = null;
        try {
            revision = g_agentBridge.finish(ticket, out.result);
        } catch {
            revision = null;
        }
        if (revision !== null && revision !== undefined) {
            out.result.bridgeRevision = revision;
        }
        appendCookie(res, sessionCookie(out.sessionId, req, out.result.pendingOffers?.length ? 1800 : 120));
        sendJson(res, 200, out.result);
    } catch (error) {
        if (ticket) {
            try {
                g_agentBridge.fail(ticket);
            } catch {
                ticket = null;
            }
        }
        sendJson(res, statusOf(error, 502), { ok: false, error: messageOf(error, "Investor evaluation failed.") });
    }
}

async function handleCoach(req, res) {
    if (denyOrigin(req, res)) return;
    if (checkRateLimit(clientIp(req))) return sendJson(res, 429, { error: "rate limited, try again soon" });
    if (!requiresJson(req)) return sendJson(res, 415, { error: "JSON required" });
    await ensureServices();
    if (!g_replyCoach || !g_agentBridge) return sendJson(res, 503, { error: "Recommendation service unavailable." });
    const abort = new AbortController();
    res.once("close", () => abort.abort());
    try {
        const body = await readJsonLimited(req, 20000);
        const roomId = cookieValue(parseCookies(req), "verdict_room");
        const context = g_agentBridge.ownerContext(roomId);
        if (context.lastResult?.gameOver || context.lastResult?.pendingOffers?.length) {
            return sendJson(res, 409, { error: "Decide on the offer or start a new game before requesting suggestions." });
        }
        const answer = await g_replyCoach.recommend(roomId, context, body, abort.signal);
        const latest = g_agentBridge.ownerContext(roomId);
        if (latest.busy || latest.revision !== context.revision) return sendJson(res, 409, { error: "The conversation changed. Refresh the suggestion." });
        if (!abort.signal.aborted) sendJson(res, 200, answer);
    } catch (error) {
        if (!abort.signal.aborted) sendJson(res, statusOf(error, 502), { error: messageOf(error, "Recommendation failed.") });
    }
}

async function handleReplyAudio(req, res) {
    if ((req.method || "GET").toUpperCase() === "POST" && denyOrigin(req, res)) {
        return;
    }
    const ip = clientIp(req);
    if (checkRateLimit(ip)) {
        sendJson(res, 429, { ok: false, error: "rate limited, try again soon" });
        return;
    }
    await ensureServices();
    if (!g_textPanel || !g_replyAudio) {
        sendJson(res, 502, { ok: false, error: "Investor audio failed." });
        return;
    }
    let turnText = "";
    let role = "";
    try {
        const url = new URL(req.url || "/", "http://localhost");
        turnText = url.searchParams.get("turn") || "";
        role = url.searchParams.get("role") || "";
    } catch {
        sendJson(res, 400, { ok: false, error: "Invalid request URL." });
        return;
    }
    if ((req.method || "GET").toUpperCase() === "POST") {
        if (!requiresJson(req)) {
            sendJson(res, 415, { ok: false, error: "JSON required" });
            return;
        }
        try {
            const body = await readJsonLimited(req, 8000);
            if (body && typeof body === "object") {
                if (!turnText && body.turn !== undefined) {
                    turnText = String(body.turn);
                }
                if (!role && typeof body.role === "string") {
                    role = body.role;
                }
            }
        } catch (error) {
            sendJson(res, statusOf(error, 400), { ok: false, error: messageOf(error, "Invalid JSON.") });
            return;
        }
    }
    if (!turnText || !role || role.length > 80) {
        sendJson(res, 400, { ok: false, error: "Supply turn and role." });
        return;
    }
    const turn = Number(turnText);
    const cookies = parseCookies(req);
    const sessionId = cookieValue(cookies, "verdict_session");
    const abort = new AbortController();
    let stream;
    try {
        stream = g_replyAudio.open(sessionId, turn, role, abort.signal);
    } catch (error) {
        sendJson(res, statusOf(error, 502), { ok: false, error: messageOf(error, "Investor audio failed.") });
        return;
    }
    res.once("close", () => abort.abort());
    try {
        for await (const chunk of stream) {
            if (abort.signal.aborted) {
                break;
            }
            if (!res.headersSent) {
                res.writeHead(200, {
                    "content-type": "audio/mpeg",
                    "cache-control": "no-store",
                    "accept-ranges": "none",
                });
            }
            if (!res.write(chunk)) {
                await once(res, "drain", { signal: abort.signal });
            }
        }
        if (!abort.signal.aborted) {
            res.end();
        }
    } catch (error) {
        if (abort.signal.aborted) {
            return;
        }
        if (res.headersSent) {
            try {
                res.destroy();
            } catch {
                return;
            }
        } else {
            sendJson(res, statusOf(error, 502), { ok: false, error: messageOf(error, "Investor audio failed.") });
        }
    }
}

async function handleVoiceToken(req, res) {
    if ((req.method || "GET").toUpperCase() !== "POST") {
        sendJson(res, 405, { ok: false, error: "method not allowed, use POST" });
        return;
    }
    if (denyOrigin(req, res)) {
        return;
    }
    if (!requiresJson(req)) {
        sendJson(res, 415, { ok: false, error: "JSON required" });
        return;
    }
    const ip = clientIp(req);
    if (checkRateLimit(ip)) {
        sendJson(res, 429, { ok: false, error: "rate limited, try again soon" });
        return;
    }
    if (checkVoiceLimit(ip)) {
        sendJson(res, 429, { ok: false, error: "Too many voice connections. Wait a minute before reconnecting." });
        return;
    }
    try {
        await readJsonLimited(req, 4096);
    } catch (error) {
        sendJson(res, statusOf(error, 400), { ok: false, error: messageOf(error, "Invalid JSON.") });
        return;
    }
    await ensureServices();
    if (!process.env.ELEVENLABS_API_KEY || !g_getVoiceToken) {
        sendJson(res, 503, { ok: false, error: "Voice is not configured." });
        return;
    }
    try {
        const token = await g_getVoiceToken();
        sendJson(res, 200, { ok: true, token: token });
    } catch {
        sendJson(res, 502, { ok: false, error: "Could not start live transcription. Check ElevenLabs speech-to-text access." });
    }
}

async function handleBridge(req, res) {
    const ip = clientIp(req);
    if (checkRateLimit(ip)) {
        sendJson(res, 429, { ok: false, error: "rate limited, try again soon" });
        return;
    }
    await ensureServices();
    if (!g_agentBridge) {
        sendJson(res, 502, { ok: false, error: "App connection failed." });
        return;
    }
    const method = (req.method || "GET").toUpperCase();
    let pathName = "";
    let jobId = "";
    try {
        const url = new URL(req.url || "/", "http://localhost");
        pathName = url.pathname;
        jobId = url.searchParams.get("id") || "";
    } catch {
        sendJson(res, 400, { ok: false, error: "Invalid request URL." });
        return;
    }
    const auth = (req.headers && req.headers.authorization) || "";
    const token = typeof auth === "string" && auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const cookies = parseCookies(req);
    const roomCookieValue = cookieValue(cookies, "verdict_room");
    const ensureRoom = () => {
        const id = g_agentBridge.ensure(roomCookieValue);
        appendCookie(res, roomCookie(id, req));
        return id;
    };
    const readJson = async () => {
        if (!requiresJson(req)) {
            throw Object.assign(new Error("JSON required."), { status: 415 });
        }
        return readJsonLimited(req, 20000);
    };
    try {
        if (method === "POST" && denyOrigin(req, res)) {
            return;
        }
        if (method === "GET" && pathName === "/api/agent-bridge/context") {
            sendJson(res, 200, g_agentBridge.agentContext(token));
            return;
        }
        if (method === "GET" && pathName === "/api/agent-bridge/job") {
            sendJson(res, 200, g_agentBridge.job(token, jobId));
            return;
        }
        if (method === "POST" && pathName === "/api/agent-bridge/suggest") {
            sendJson(res, 202, g_agentBridge.suggest(token, await readJson()));
            return;
        }
        if (method === "POST" && pathName === "/api/agent-bridge/connect") {
            await readJson();
            sendJson(res, 200, g_agentBridge.connect(ensureRoom()));
            return;
        }
        if (method === "GET" && pathName === "/api/agent-bridge/session") {
            const state = g_agentBridge.ownerContext(roomCookieValue);
            if (roomCookieValue) {
                appendCookie(res, roomCookie(roomCookieValue, req));
            }
            sendJson(res, 200, state);
            return;
        }
        if (method === "POST" && pathName === "/api/agent-bridge/mode") {
            const body = await readJson();
            g_agentBridge.mode(roomCookieValue, body && body.autoSend);
            sendJson(res, 200, { ok: true });
            return;
        }
        if (method === "POST" && pathName === "/api/agent-bridge/reject") {
            const body = await readJson();
            sendJson(res, 200, g_agentBridge.reject(roomCookieValue, body && body.id));
            return;
        }
        if (method === "POST" && pathName === "/api/agent-bridge/ready") {
            const body = await readJson();
            g_agentBridge.ready(roomCookieValue, body && body.revision);
            sendJson(res, 200, { ok: true });
            return;
        }
        if (method === "POST" && pathName === "/api/agent-bridge/disconnect") {
            await readJson();
            g_agentBridge.disconnect(roomCookieValue);
            sendJson(res, 200, { ok: true });
            return;
        }
        sendJson(res, 404, { ok: false, error: "Unknown app connection route." });
    } catch (error) {
        sendJson(res, statusOf(error, 502), { ok: false, error: messageOf(error, "App connection failed.") });
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
    if (method === "POST" && ["/api/evaluate", "/evaluate", "/api/reset", "/api/offer-decision"].includes(urlPath)) {
        void handlePanel(req, res, urlPath === "/evaluate" ? "/api/evaluate" : urlPath);
        return;
    }
    if (method === "POST" && urlPath === "/api/coach") {
        void handleCoach(req, res);
        return;
    }
    if ((method === "GET" || method === "POST") && urlPath === "/api/reply-audio") {
        void handleReplyAudio(req, res);
        return;
    }
    if (method === "POST" && urlPath === "/api/voice-token") {
        void handleVoiceToken(req, res);
        return;
    }
    if (method === "GET" && urlPath === "/api/elevenlabs/config") {
        handleElevenlabsConfig(req, res);
        return;
    }
    if (method === "POST" && urlPath === "/api/elevenlabs/signed-url") {
        void mintRoleSignedUrl(req, res);
        return;
    }
    if (urlPath === "/api/agent-bridge" || urlPath.startsWith("/api/agent-bridge/")) {
        void handleBridge(req, res);
        return;
    }
    if (method === "GET" || method === "HEAD") {
        serveStatic(req, res, urlPath || "/");
        return;
    }
    sendJson(res, 405, { ok: false, error: "method not allowed" });
});

for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
        void (async () => {
            try {
                if (g_agentBridge) {
                    g_agentBridge.close();
                }
                g_replyCoach?.close();
            } catch {
                g_agentBridge = null;
            }
            try {
                if (g_replyAudio) {
                    g_replyAudio.close();
                }
            } catch {
                g_replyAudio = null;
            }
            try {
                if (g_textPanel && typeof g_textPanel.close === "function") {
                    await g_textPanel.close();
                }
            } catch {
                g_textPanel = null;
            }
            try {
                if (typeof server.closeAllConnections === "function") {
                    server.closeAllConnections();
                }
            } catch {
                return;
            }
            server.close(() => process.exit(0));
        })();
    });
}

server.listen(PORT, () => {
    console.log(`investor-verdict deploy listening on port ${server.address().port}`);
});
