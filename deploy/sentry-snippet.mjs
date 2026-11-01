// Drop in snippet for the frontend owner.
// Install with: npm i @sentry/browser
// Then call initSentry() once at app startup, before createInvestorCall.
// DSN comes from env, never hardcode it in source.

import * as Sentry from "@sentry/browser";

function isSensitiveKey(key) {
    return (
        typeof key === "string" &&
        (/signed[_-]?url/i.test(key) || /transcript/i.test(key))
    );
}

function scrubString(text) {
    if (typeof text !== "string") {
        return text;
    }
    if (/signed[_-]?url/i.test(text)) {
        return text
            .replace(/https?:\/\/[^\s"'`]+/gi, "[signed url removed]")
            .replace(/signed[_-]?url[^\s"'`;,]*/gi, "[signed url removed]");
    }
    return text;
}

function deepScrub(node, depth = 0, seen = null) {
    if (node === null || node === undefined) {
        return node;
    }
    if (typeof node === "string") {
        return scrubString(node);
    }
    if (typeof node !== "object") {
        return node;
    }
    if (depth > 8) {
        return "[removed depth limit]";
    }
    if (seen === null) {
        seen = new WeakSet();
    }
    if (seen.has(node)) {
        return node;
    }
    seen.add(node);
    if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i += 1) {
            node[i] = deepScrub(node[i], depth + 1, seen);
        }
        return node;
    }
    for (const key of Object.keys(node)) {
        if (isSensitiveKey(key)) {
            node[key] = "[removed]";
        } else {
            node[key] = deepScrub(node[key], depth + 1, seen);
        }
    }
    return node;
}

function shouldDropBreadcrumb(crumb) {
    try {
        const text = JSON.stringify(crumb || {});
        return /signed[_-]?url/i.test(text) || /transcript/i.test(text);
    } catch {
        return false;
    }
}

function scrubPayload(event) {
    // Remove signed URLs and full transcripts before upload.
    if (!event || typeof event !== "object") {
        return event;
    }
    if (event.request && typeof event.request === "object") {
        if (typeof event.request.url === "string") {
            event.request.url = scrubString(event.request.url);
            if (/signed[_-]?url/i.test(event.request.url)) {
                event.request.url = "[signed url removed]";
            }
        }
        if (event.request.query_string !== undefined) {
            event.request.query_string = deepScrub(event.request.query_string);
        }
        if (event.request.data !== undefined) {
            event.request.data = deepScrub(event.request.data);
        }
        if (event.request.headers !== undefined) {
            event.request.headers = deepScrub(event.request.headers);
        }
        if (event.request.cookies !== undefined) {
            event.request.cookies = deepScrub(event.request.cookies);
        }
        deepScrub(event.request);
    }
    if (event.contexts && typeof event.contexts === "object") {
        deepScrub(event.contexts);
    }
    if (event.extra && typeof event.extra === "object") {
        deepScrub(event.extra);
    }
    const exc = event.exception;
    if (exc && typeof exc === "object" && Array.isArray(exc.values)) {
        for (const value of exc.values) {
            deepScrub(value);
            if (value && typeof value.value === "string") {
                value.value = scrubString(value.value);
            }
        }
    } else if (exc && typeof exc === "object") {
        deepScrub(exc);
    }
    const crumbs = event.breadcrumbs;
    if (Array.isArray(crumbs)) {
        event.breadcrumbs = crumbs.map((crumb) => deepScrub(crumb));
    } else if (crumbs && typeof crumbs === "object" && Array.isArray(crumbs.values)) {
        crumbs.values = crumbs.values.map((crumb) => deepScrub(crumb));
    }
    if (typeof event.message === "string") {
        event.message = scrubString(event.message);
    }
    return event;
}

export function initSentry(options = {}) {
    const dsn = options.dsn || import.meta.env.VITE_SENTRY_DSN || "";
    if (!dsn) {
        return false;
    }
    Sentry.init({
        dsn,
        tracesSampleRate: 1.0,
        beforeSend(event) {
            return scrubPayload(event);
        },
        beforeBreadcrumb(crumb) {
            if (shouldDropBreadcrumb(crumb)) {
                return null;
            }
            return deepScrub(crumb);
        },
    });
    return true;
}

export function captureCallError(err, context = {}) {
    const safeContext = deepScrub({ ...context });
    Sentry.captureException(err, {
        contexts: { call: safeContext },
    });
}

// Bridge helper: wire an investor call instance to Sentry.
// Usage:
//   import { bridgeCallErrors } from "./sentry-snippet.mjs"
//   bridgeCallErrors(call)
// Expects the call object to expose onError(fn).
export function bridgeCallErrors(call) {
    if (!call || typeof call.onError !== "function") {
        return;
    }
    call.onError((err) => {
        captureCallError(err, { source: "investorCall" });
    });
}

// Optional server monitoring (commented by default).
// Install with: npm i @sentry/node
// Then uncomment in deploy/server.js startup:
//   import * as SentryNode from "@sentry/node";
//   SentryNode.init({ dsn: process.env.SENTRY_DSN || "", tracesSampleRate: 1.0 });
