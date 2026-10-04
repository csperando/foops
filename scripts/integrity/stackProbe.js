// ---------- Stack-trace probe ----------
// A second native-code check that doesn't rely on Function.prototype.toString
// at all, for when even the pristine iframe realm can't be trusted (a
// script injected into every new frame patches that realm too).
//
// Calls the function on an illegal receiver (a plain object). A native
// browser function rejects that brand check inside native code, so the
// resulting TypeError's stack has no script frames above our call. A
// script wrapper either:
//   - accepts the illegal call (a fake getter just returns its value), or
//   - throws/rejects with its own frame on the stack, which carries a
//     "file:line:col" location — native frames never do.
// The illegal receiver also means nothing real happens: getUserMedia
// rejects before any permission prompt or device access.
//
// An attacker can still filter stack traces (Error.prepareStackTrace) or
// hide them (Error.stackTraceLimit), so stackTampering() reports those.
//
// Our own frame is found by a marker function name, not by this module's
// URL: bundlers rewrite import.meta.url (webpack bakes in a build-time
// file:// path) or drop it (IIFE builds), and anything bundled into the
// same file would share it. The name is a string-literal key, which
// minifiers don't rename.
const MARKER = "foopsStackProbe$boundary";
const JS_FRAME = /:\d+:\d+\)?\s*$/;
const ILLEGAL_RECEIVER = Object.freeze({});

const invoke = {
    [MARKER](fn) {
        return Reflect.apply(fn, ILLEGAL_RECEIVER, []);
    }
}[MARKER];

function judge(error) {
    const lines = String((error && error.stack) || "").split("\n").filter((l) => /^\s+at /.test(l));
    const ours = lines.findIndex((l) => l.includes(MARKER));
    if (ours === -1) {
        return { native: false, reason: "stack trace hidden or rewritten" };
    }
    const foreign = lines.slice(0, ours).filter((l) => JS_FRAME.test(l)).map((l) => l.trim());
    return foreign.length
        ? { native: false, reason: "script frames in its stack", frames: foreign.slice(0, 3) }
        : { native: true };
}

const ACCEPTED = { native: false, reason: "accepted an illegal receiver (native code would throw)" };

// For functions that throw synchronously (getters, most methods).
// A function that returns a promise can't be judged synchronously and
// reports native: null.
export function probeSync(fn) {
    if (typeof fn !== "function") return { native: false, reason: "missing" };
    try {
        const result = invoke(fn);
        if (result && typeof result.then === "function") {
            result.then(null, () => {});
            return { native: null, reason: "returns a promise — use probe()" };
        }
        return ACCEPTED;
    } catch (error) {
        return judge(error);
    }
}

// For any function, including promise-returning ones (getUserMedia,
// enumerateDevices, …), whose brand-check failure arrives as a rejection.
export async function probe(fn) {
    if (typeof fn !== "function") return { native: false, reason: "missing" };
    let result;
    try {
        result = invoke(fn);
    } catch (error) {
        return judge(error);
    }
    if (!result || typeof result.then !== "function") return ACCEPTED;
    try {
        await result;
    } catch (error) {
        return judge(error);
    }
    return ACCEPTED;
}

// Chrome's defaults: no Error.prepareStackTrace, stackTraceLimit 10.
// Anything else in a realm means something is reshaping stack traces.
export function stackTampering(realms) {
    return realms
        .filter(Boolean)
        .map((w) => ({
            realm: w === window ? "page" : "pristine",
            prepareStackTrace: Object.prototype.hasOwnProperty.call(w.Error, "prepareStackTrace"),
            stackTraceLimit: w.Error.stackTraceLimit
        }))
        .filter((r) => r.prepareStackTrace || r.stackTraceLimit !== 10);
}
