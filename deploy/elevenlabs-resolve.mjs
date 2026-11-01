import { pathToFileURL } from "node:url";

const stubUrl = pathToFileURL(new URL("./elevenlabs-stub.mjs", import.meta.url)).href;
const VENDOR = new Set(["@elevenlabs/client", "@elevenlabs/elevenlabs-js"]);

export function resolve(specifier, context, next) {
    if (VENDOR.has(specifier)) {
        let result;
        try {
            result = next(specifier, context);
        } catch {
            return { url: stubUrl, shortCircuit: true };
        }
        if (result && typeof result.then === "function") {
            return result.catch(() => ({ url: stubUrl, shortCircuit: true }));
        }
        return result;
    }
    return next(specifier, context);
}
