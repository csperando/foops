// ---------- 3. Microphone API integrity ----------
// Catches the *script-level* way to fake a microphone: an extension or
// injected script replacing getUserMedia so it returns a Web Audio stream
// (synthetic speech, a recording) instead of a device, or replacing the
// Web Audio pieces this page records through. Virtual audio drivers go
// through the genuine native API, so they pass this card — the others exist
// for those. Same approach as the webcam page's card 3.
import { isNativeFunction, isToStringPatched, tamperedPristineReferences } from "../../integrity/nativeCode.js";
import { getPristine } from "../../integrity/pristine.js";
import { probe, probeSync, stackTampering } from "../../integrity/stackProbe.js";

function getter(proto, name) {
    const descriptor = proto && Object.getOwnPropertyDescriptor(proto, name);
    return descriptor ? descriptor.get : undefined;
}

function setter(proto, name) {
    const descriptor = proto && Object.getOwnPropertyDescriptor(proto, name);
    return descriptor ? descriptor.set : undefined;
}

// [name, resolve the function from a realm's window, async?]
const CHECKED = [
    ["navigator.mediaDevices (getter)", (w) => getter(w.Navigator.prototype, "mediaDevices")],
    ["MediaDevices.prototype.getUserMedia", (w) => w.MediaDevices && w.MediaDevices.prototype.getUserMedia, true],
    ["MediaDevices.prototype.enumerateDevices", (w) => w.MediaDevices && w.MediaDevices.prototype.enumerateDevices, true],
    ["MediaStreamTrack.prototype.getSettings", (w) => w.MediaStreamTrack.prototype.getSettings],
    ["MediaStreamTrack.prototype.getCapabilities", (w) => w.MediaStreamTrack.prototype.getCapabilities],
    ["MediaStreamTrack.prototype.label (getter)", (w) => getter(w.MediaStreamTrack.prototype, "label")],
    ["AudioContext", (w) => w.AudioContext],
    ["BaseAudioContext.prototype.createMediaStreamSource", (w) => w.AudioContext.prototype.createMediaStreamSource],
    ["AudioWorklet.prototype.addModule", (w) => w.Worklet && w.Worklet.prototype.addModule, true],
    ["AudioWorkletNode", (w) => w.AudioWorkletNode],
    ["MessagePort.prototype.onmessage (setter)", (w) => setter(w.MessagePort.prototype, "onmessage")],
    ["Permissions.prototype.query", (w) => w.Permissions && w.Permissions.prototype.query, true],
    // Hooks that could reach into the pristine iframe as it's created.
    ["Document.prototype.createElement", (w) => w.Document.prototype.createElement],
    ["Node.prototype.appendChild", (w) => w.Node.prototype.appendChild],
    ["HTMLIFrameElement.prototype.contentWindow (getter)", (w) => getter(w.HTMLIFrameElement.prototype, "contentWindow")]
];

function resolve(fn, w) {
    try {
        return fn(w);
    } catch (err) {
        return undefined;
    }
}

export async function detectMicApiIntegrity() {
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
    const nonNative = [];
    const pristineTampered = tamperedPristineReferences();
    for (const [name, fn, isAsync] of CHECKED) {
        const page = resolve(fn, window);
        const reference = pristine ? resolve(fn, pristine.window) : undefined;
        if (page === undefined && reference === undefined) continue;
        const ok = isNativeFunction(page, reference) && (!isAsync || (await probe(page)).native !== false);
        if (!ok) nonNative.push(name);
        if (reference) {
            const clean = isAsync ? (await probe(reference)).native !== false : probeSync(reference).native !== false;
            if (!clean && !pristineTampered.includes(name)) pristineTampered.push(name);
        }
    }
    const shadowed = ["getUserMedia", "enumerateDevices"].filter((name) => Object.prototype.hasOwnProperty.call(md, name));
    const toStringPatched = isToStringPatched();
    const stackTricks = stackTampering([window, pristine && pristine.window]);

    let state, label, flag, note;
    if (nonNative.length || shadowed.length) {
        state = "no";
        label = "api overridden";
        flag = "strong";
        note = "A microphone or Web Audio API has been replaced by script. This page opens the mic through pristine " +
            "copies, but whatever the rest of the page hears can't be trusted.";
    } else if (pristineTampered.length) {
        state = "no";
        label = "reference tampered";
        flag = "strong";
        note = "The clean reference copies were replaced inside a blank iframe this page created (" +
            pristineTampered.join(", ") + "). Only a script injected into every frame does that.";
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
        note = "Every audio API matches its pristine copy, but this page's Function.prototype.toString has been " +
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
        note = "Every checked API matches its pristine copy. Card 5 checks the track itself came from a listed device.";
    }

    return {
        state,
        label,
        text: JSON.stringify(
            {
                functionsChecked: CHECKED.length,
                nonNativeFunctions: nonNative,
                shadowedOnInstance: shadowed,
                pageToStringPatched: toStringPatched,
                pristineRealm: !!pristine,
                pristineReferencesTampered: pristineTampered,
                stackTraceTampering: stackTricks,
                verdict: note
            },
            null, 2
        ),
        data: { supported: true, flag, nonNative, shadowed, toStringPatched, pristineTampered, stackTricks }
    };
}
