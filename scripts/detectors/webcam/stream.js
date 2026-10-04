// ---------- Shared camera stream + frame sampler ----------
// Owns the page's single getUserMedia stream so every card analyzes the same
// track, instead of each card opening the camera on its own.
//
// Every camera and canvas call here goes through the pristine realm
// (pristine.js), so a script that replaced getUserMedia, getImageData, etc.
// on this page can't feed our analysis. Card 3 still flags the override;
// we just don't let it steer the measurements.
import { getPristine, createPristineCanvas } from "../../integrity/pristine.js";

let stream = null;

// Pristine function if available, else this page's own.
function api(name, fallback) {
    const p = getPristine();
    return (p && p[name]) || fallback;
}

export function isCameraSupported() {
    return !!(navigator.mediaDevices && api("getUserMedia", MediaDevices.prototype.getUserMedia));
}

export async function startCamera(video) {
    if (!stream) {
        const getUserMedia = api("getUserMedia", MediaDevices.prototype.getUserMedia);
        stream = await getUserMedia.call(navigator.mediaDevices, { video: true, audio: false });
    }
    video.srcObject = stream;
    await video.play();
    return getVideoTrack();
}

export function getVideoTrack() {
    return stream ? stream.getVideoTracks()[0] || null : null;
}

export async function listDevices() {
    if (!navigator.mediaDevices) return null;
    const enumerateDevices = api("enumerateDevices", MediaDevices.prototype.enumerateDevices);
    return enumerateDevices ? enumerateDevices.call(navigator.mediaDevices) : null;
}

// ---------- Track accessors (pristine) ----------
export function trackSettings(track) {
    return api("getSettings", MediaStreamTrack.prototype.getSettings).call(track);
}

export function trackCapabilities(track) {
    const getCapabilities = api("getCapabilities", MediaStreamTrack.prototype.getCapabilities);
    return getCapabilities ? getCapabilities.call(track) : null;
}

export function applyTrackConstraints(track, constraints) {
    return api("applyConstraints", MediaStreamTrack.prototype.applyConstraints).call(track, constraints);
}

export function trackLabel(track) {
    const get = api("trackLabel", null);
    return get ? get.call(track) : track.label;
}

// ---------- Frame grabbing ----------
// Draws the current video frame (or a source rectangle of it, as fractions
// of the frame) into a small pristine canvas and returns its RGBA pixels.
export function createFrameGrabber(width, height) {
    const canvas = createPristineCanvas(width, height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const drawImage = api("drawImage", CanvasRenderingContext2D.prototype.drawImage);
    const getImageData = api("getImageData", CanvasRenderingContext2D.prototype.getImageData);

    return function grab(video, region = null) {
        if (region) {
            const w = video.videoWidth, h = video.videoHeight;
            drawImage.call(ctx, video, region.x * w, region.y * h, region.w * w, region.h * h, 0, 0, width, height);
        } else {
            drawImage.call(ctx, video, 0, 0, width, height);
        }
        return getImageData.call(ctx, 0, 0, width, height).data;
    };
}

export function toGray(rgba) {
    const gray = new Uint8Array(rgba.length / 4);
    for (let i = 0, j = 0; i < rgba.length; i += 4, j++) {
        gray[j] = (rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8;
    }
    return gray;
}

export function meanLuma(rgba) {
    let sum = 0;
    for (let i = 0; i < rgba.length; i += 4) sum += (rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8;
    return sum / (rgba.length / 4);
}

export function onNextFrame(video, callback) {
    api("requestVideoFrameCallback", HTMLVideoElement.prototype.requestVideoFrameCallback).call(video, callback);
}

export const SAMPLE_WIDTH = 160;
export const SAMPLE_HEIGHT = 120;

// Collects one grayscale snapshot per *new* video frame (via
// requestVideoFrameCallback) together with that frame's timing metadata, so
// the frame-timing and pixel-noise cards analyze exactly the same frames.
// Resolves with whatever arrived if the source stalls — a feed that stops
// delivering frames is itself a signal. Resolves null when
// requestVideoFrameCallback isn't supported.
export function sampleFrames(video, durationMs = 5000) {
    if (!("requestVideoFrameCallback" in HTMLVideoElement.prototype)) return Promise.resolve(null);

    const grab = createFrameGrabber(SAMPLE_WIDTH, SAMPLE_HEIGHT);
    const samples = [];

    return new Promise((resolve) => {
        let start = null;
        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            resolve(samples);
        };
        const stallTimer = setTimeout(finish, durationMs + 2000);

        function step(now, metadata) {
            if (done) return;
            if (start === null) start = now;
            samples.push({
                now,
                mediaTime: metadata.mediaTime,
                captureTime: metadata.captureTime ?? null,
                presentedFrames: metadata.presentedFrames,
                gray: toGray(grab(video))
            });
            if (now - start < durationMs) {
                onNextFrame(video, step);
            } else {
                clearTimeout(stallTimer);
                finish();
            }
        }
        onNextFrame(video, step);
    });
}
