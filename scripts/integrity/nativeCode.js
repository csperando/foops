// Shared by the isExtended integrity check (method 6), the screen-label
// check (method 2) and the webcam page's camera-API integrity check.
//
// Two independent tests, and a function must pass both:
//
// 1. Source text. A native, un-tampered function stringifies to
//    "[native code]". Forcing a trusted `toString` onto `fn` via `.call()`
//    skips any per-function `toString` lie, and the trusted `toString` comes
//    from a pristine iframe realm (pristine.js), so a page-wide override of
//    *this* page's Function.prototype.toString can't lie either.
//
// 2. Behavior (stackProbe.js). Called on an illegal receiver, native code
//    throws with no script frames on the stack; a wrapper doesn't. This one
//    doesn't use toString at all, so it still works when a script injected
//    into every frame has patched the pristine realm's toString too.
import { getPristine } from "./pristine.js";
import { probeSync } from "./stackProbe.js";

function trustedToString() {
    const p = getPristine();
    return p ? p.toString : Function.prototype.toString;
}

// With a `reference` (the same function from the pristine realm), the
// source strings must match exactly. That also catches a Proxy wrapped
// around a native function, which stringifies as an anonymous
// "function () { [native code] }" rather than "function getUserMedia() …".
// The behavior probe only runs synchronously here; promise-returning
// functions get the async probe from the webcam page's integrity check.
export function isNativeFunction(fn, reference) {
    if (typeof fn !== "function") return false;
    try {
        const toString = trustedToString();
        const src = toString.call(fn);
        const sourceOk = typeof reference === "function"
            ? src === toString.call(reference)
            : src.includes("[native code]");
        return sourceOk && probeSync(fn).native !== false;
    } catch (err) {
        return false;
    }
}

// True when this page's Function.prototype.toString has itself been
// replaced: it stringifies differently from the pristine one, describes a
// known native function differently, or behaves like a wrapper. The last
// test matters when both realms were patched identically, which makes the
// first two compare equal. Brave's fingerprint protection may do this
// legitimately, so callers treat it as a warning, not proof.
export function isToStringPatched() {
    const p = getPristine();
    try {
        const pageToString = Function.prototype.toString;
        if (probeSync(pageToString).native === false) return true;
        if (!p) return null;
        return p.toString.call(pageToString) !== p.toString.call(p.toString) ||
            pageToString.call(Math.max) !== p.toString.call(Math.max);
    } catch (err) {
        return true;
    }
}

// Pristine-realm references (synchronous ones) that fail the behavior
// probe — i.e. something injected into the blank iframe this page created
// and replaced them. Only a script injected into *every* frame does that,
// so a non-empty list is strong evidence of automation/stealth tooling.
const SYNC_REFERENCES = [
    "toString", "screenIsExtended", "screenDetailedLabel", "mediaDevicesGetter", "trackLabel",
    "getSettings", "getCapabilities", "drawImage", "getImageData", "requestVideoFrameCallback",
    "performanceNow", "createElement", "appendChild", "contentWindowGetter"
];

export function tamperedPristineReferences() {
    const p = getPristine();
    if (!p) return [];
    return SYNC_REFERENCES.filter((key) => p[key] && probeSync(p[key]).native === false);
}
