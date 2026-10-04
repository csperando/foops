// ---------- 3. Camera API integrity ----------
// Catches the *script-level* way to fake a webcam: an extension or injected
// script replacing getUserMedia so it hands back a canvas- or video-sourced
// stream instead of a real device, or replacing the canvas/frame APIs a
// detector like this one reads pixels through. Driver-level virtual cameras
// (OBS etc.) go through the genuine native API, so they pass this card —
// the other cards exist for those.
import { isNativeFunction, isToStringPatched, tamperedPristineReferences } from "../../integrity/nativeCode.js";
import { getPristine } from "../../integrity/pristine.js";
import { probe, stackTampering } from "../../integrity/stackProbe.js";
import { trackSettings } from "./stream.js";

function getter(proto, name) {
    const descriptor = proto && Object.getOwnPropertyDescriptor(proto, name);
    return descriptor ? descriptor.get : undefined;
}

// [name, what this page actually resolves, pristine reference key]
function checkedFunctions(md) {
    return [
        ["navigator.mediaDevices (getter)", getter(Navigator.prototype, "mediaDevices"), "mediaDevicesGetter"],
        ["navigator.mediaDevices.getUserMedia", md.getUserMedia, "getUserMedia"],
        ["navigator.mediaDevices.enumerateDevices", md.enumerateDevices, "enumerateDevices"],
        ["MediaStreamTrack.prototype.getSettings", MediaStreamTrack.prototype.getSettings, "getSettings"],
        ["MediaStreamTrack.prototype.getCapabilities", MediaStreamTrack.prototype.getCapabilities, "getCapabilities"],
        ["MediaStreamTrack.prototype.applyConstraints", MediaStreamTrack.prototype.applyConstraints, "applyConstraints"],
        ["MediaStreamTrack.prototype.label (getter)", getter(MediaStreamTrack.prototype, "label"), "trackLabel"],
        ["CanvasRenderingContext2D.prototype.drawImage", CanvasRenderingContext2D.prototype.drawImage, "drawImage"],
        ["CanvasRenderingContext2D.prototype.getImageData", CanvasRenderingContext2D.prototype.getImageData, "getImageData"],
        ["HTMLVideoElement.prototype.requestVideoFrameCallback", HTMLVideoElement.prototype.requestVideoFrameCallback, "requestVideoFrameCallback"],
        ["navigator.permissions.query", navigator.permissions && navigator.permissions.query, "permissionsQuery"],
        ["performance.now", performance.now, "performanceNow"],
        // Hooks that could reach into the pristine iframe as it's created.
        ["document.createElement", document.createElement, "createElement"],
        ["Node.prototype.appendChild", Node.prototype.appendChild, "appendChild"],
        ["HTMLIFrameElement.prototype.contentWindow (getter)", getter(HTMLIFrameElement.prototype, "contentWindow"), "contentWindowGetter"]
    ];
}

// Promise-returning APIs: isNativeFunction's synchronous behavior probe
// can't judge these, so they get the async probe (brand-check rejection).
const ASYNC_KEYS = ["getUserMedia", "enumerateDevices", "applyConstraints", "permissionsQuery"];

export async function detectApiIntegrity({ track = null, devices = null } = {}) {
    const md = navigator.mediaDevices;
    if (!md) {
        return {
            state: "unknown",
            label: "n/a",
            text: "navigator.mediaDevices doesn't exist here — usually an insecure (non-https) context, not tampering.",
            data: { supported: false, flag: null }
        };
    }

    const pristine = getPristine();
    const checked = checkedFunctions(md).filter(([, fn, key]) => fn !== undefined || (pristine && pristine[key]));
    const nonNative = [];
    for (const [name, fn, key] of checked) {
        const sourceAndSyncOk = isNativeFunction(fn, pristine ? pristine[key] : undefined);
        const asyncOk = !ASYNC_KEYS.includes(key) || (await probe(fn)).native !== false;
        if (!sourceAndSyncOk || !asyncOk) nonNative.push(name);
    }
    const shadowed = ["getUserMedia", "enumerateDevices"].filter((name) => Object.prototype.hasOwnProperty.call(md, name));
    const toStringPatched = isToStringPatched();

    // The clean copies themselves: replaced inside the blank iframe this
    // page created means a script injected into every frame.
    const pristineTampered = tamperedPristineReferences();
    if (pristine) {
        for (const key of ASYNC_KEYS) {
            if (pristine[key] && (await probe(pristine[key])).native === false) pristineTampered.push(key);
        }
    }
    const stackTricks = stackTampering([window, pristine && pristine.window]);

    // Track provenance, once a stream exists. canvas.captureStream() tracks
    // carry `canvas`/`requestFrame`; real capture tracks have a deviceId
    // that also shows up in enumerateDevices().
    let provenance = null;
    if (track) {
        const settings = trackSettings(track);
        provenance = {
            canvasSourced: "requestFrame" in track || "canvas" in track,
            hasDeviceId: !!settings.deviceId,
            deviceListed: devices && settings.deviceId
                ? devices.some((d) => d.kind === "videoinput" && d.deviceId === settings.deviceId)
                : null
        };
    }

    let state, label, flag, note;
    if (nonNative.length || shadowed.length) {
        state = "no";
        label = "api overridden";
        flag = "strong";
        note = "A camera or canvas API has been replaced by script. This page reads the camera through " +
            "pristine copies, but whatever the rest of the page sees can't be trusted.";
    } else if (pristineTampered.length) {
        state = "no";
        label = "reference tampered";
        flag = "strong";
        note = "The clean reference copies were replaced inside a blank iframe this page created (" +
            pristineTampered.join(", ") + "). Only a script injected into every frame does that — typical of " +
            "automation/stealth tooling. Measurements taken through those copies can't be trusted either.";
    } else if (provenance && provenance.canvasSourced) {
        state = "no";
        label = "canvas stream";
        flag = "strong";
        note = "The video track came from a <canvas>, not a capture device — a script is drawing the 'camera' feed.";
    } else if (provenance && (!provenance.hasDeviceId || provenance.deviceListed === false)) {
        state = "warn";
        label = "inconsistent";
        flag = "weak";
        note = "The track's deviceId is missing or doesn't match any camera in enumerateDevices() — possible stream injection.";
    } else if (stackTricks.length) {
        state = "warn";
        label = "stack traces altered";
        flag = "weak";
        note = "Error.prepareStackTrace or Error.stackTraceLimit has been changed from Chrome's defaults, which " +
            "is how a script would hide its frames from this page's behavior probe.";
    } else if (toStringPatched) {
        state = "warn";
        label = "toString patched";
        flag = "weak";
        note = "Every camera API matches its pristine copy, but this page's Function.prototype.toString has been " +
            "replaced. Brave does this legitimately; otherwise something is rewriting built-ins.";
    } else if (!pristine) {
        state = "warn";
        label = "no reference";
        flag = null;
        note = "The pristine iframe realm couldn't be created, so APIs were only checked for '[native code]'.";
    } else {
        state = "yes";
        label = "native";
        flag = null;
        note = track
            ? "Every checked API matches its pristine copy and the track traces back to a listed capture device."
            : "Every checked API matches its pristine copy. Track provenance is checked once the camera starts.";
    }

    return {
        state,
        label,
        text: JSON.stringify(
            {
                functionsChecked: checkedFunctions(md).length,
                nonNativeFunctions: nonNative,
                shadowedOnInstance: shadowed,
                pageToStringPatched: toStringPatched,
                pristineRealm: !!pristine,
                pristineReferencesTampered: pristineTampered,
                stackTraceTampering: stackTricks,
                trackProvenance: provenance,
                verdict: note
            },
            null, 2
        ),
        data: { supported: true, flag, nonNative, shadowed, toStringPatched, pristineTampered, stackTricks, provenance }
    };
}
