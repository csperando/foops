// ---------- Pristine realm ----------
// A hidden, same-origin about:blank iframe has its own fresh set of
// built-ins (its own Function.prototype.toString, MediaDevices.prototype,
// CanvasRenderingContext2D.prototype, …). A script that patched *this*
// page's copies hasn't touched those, so we check against them and call
// them on our own objects via `.call()`. The browser's brand checks accept
// same-origin objects from another realm, so e.g.
// `pristine.getUserMedia.call(navigator.mediaDevices, …)` works.
//
// The iframe stays attached: a detached realm's functions can throw.
// Not bulletproof — an extension injecting into about:blank frames
// (match_about_blank / all_frames), automation that injects a script into
// every new frame, or a page script hooking iframe creation can reach this
// realm. So the references themselves are verified with the
// toString-independent stack probe (see tamperedPristineReferences() in
// nativeCode.js), and the iframe-creation hooks (createElement, appendChild,
// contentWindow) are in the webcam page's checked list.
let frame = null;
let cached;
let holders = 0;

// Sessions hold the realm while they run: retain on start (which also
// creates it as early as possible), release on stop. The iframe is removed
// when the last holder releases it; the next getPristine() makes a new one.
export function retainPristine() {
    holders++;
    getPristine();
}

export function releasePristine() {
    if (holders === 0) return;
    holders--;
    if (holders > 0) return;
    if (frame) frame.remove();
    frame = null;
    cached = undefined;
}

function getter(proto, name) {
    const descriptor = proto && Object.getOwnPropertyDescriptor(proto, name);
    return descriptor ? descriptor.get : undefined;
}

export function getPristine() {
    if (cached !== undefined) return cached;
    try {
        frame = document.createElement("iframe");
        frame.hidden = true;
        frame.setAttribute("aria-hidden", "true");
        frame.tabIndex = -1;
        (document.body || document.documentElement).appendChild(frame);
        const w = frame.contentWindow;
        cached = {
            window: w,
            toString: w.Function.prototype.toString,
            screenIsExtended: getter(w.Screen.prototype, "isExtended"),
            screenDetailedLabel: w.ScreenDetailed && getter(w.ScreenDetailed.prototype, "label"),
            mediaDevicesGetter: getter(w.Navigator.prototype, "mediaDevices"),
            getUserMedia: w.MediaDevices && w.MediaDevices.prototype.getUserMedia,
            enumerateDevices: w.MediaDevices && w.MediaDevices.prototype.enumerateDevices,
            getSettings: w.MediaStreamTrack && w.MediaStreamTrack.prototype.getSettings,
            getCapabilities: w.MediaStreamTrack && w.MediaStreamTrack.prototype.getCapabilities,
            applyConstraints: w.MediaStreamTrack && w.MediaStreamTrack.prototype.applyConstraints,
            trackLabel: w.MediaStreamTrack && getter(w.MediaStreamTrack.prototype, "label"),
            drawImage: w.CanvasRenderingContext2D.prototype.drawImage,
            getImageData: w.CanvasRenderingContext2D.prototype.getImageData,
            requestVideoFrameCallback: w.HTMLVideoElement.prototype.requestVideoFrameCallback,
            permissionsQuery: w.Permissions && w.Permissions.prototype.query,
            performanceNow: w.Performance.prototype.now,
            createElement: w.Document.prototype.createElement,
            appendChild: w.Node.prototype.appendChild,
            contentWindowGetter: getter(w.HTMLIFrameElement.prototype, "contentWindow")
        };
    } catch (err) {
        cached = null;
    }
    return cached;
}

// A canvas from the pristine realm's document, so a hooked page-level
// createElement/getContext can't hand us a fake one.
export function createPristineCanvas(width, height) {
    const p = getPristine();
    const doc = p ? p.window.document : document;
    const canvas = doc.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
}
