// ---------- Shared microphone stream + recorder ----------
// Owns the page's single getUserMedia stream so every card analyzes the same
// track. Device and track calls go through the pristine realm
// (pristine.js), like the webcam page, so a script that replaced
// getUserMedia on this page can't feed our analysis. Card 3 still flags it.
import { getPristine } from "../../integrity/pristine.js";

let stream = null;

function api(name, fallback) {
    const p = getPristine();
    return (p && p[name]) || fallback;
}

export function isMicSupported() {
    return !!(navigator.mediaDevices && api("getUserMedia", MediaDevices.prototype.getUserMedia));
}

// The browser's echo cancellation, noise suppression and gain control would
// reshape exactly what the signal cards measure (noise suppression gates
// silence to near zero), so all three are turned off.
export async function startMic(deviceId = null) {
    const current = getAudioTrack();
    if (current && (!deviceId || trackSettings(current).deviceId === deviceId)) return current;
    stopMic();
    const getUserMedia = api("getUserMedia", MediaDevices.prototype.getUserMedia);
    stream = await getUserMedia.call(navigator.mediaDevices, {
        video: false,
        audio: {
            ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
        }
    });
    return getAudioTrack();
}

export function stopMic() {
    if (stream) for (const track of stream.getTracks()) track.stop();
    stream = null;
}

export function getAudioTrack() {
    return stream ? stream.getAudioTracks()[0] || null : null;
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

export function trackLabel(track) {
    const get = api("trackLabel", null);
    return get ? get.call(track) : track.label;
}

// ---------- Recorder ----------
// An AudioWorklet copies every sample the track delivers; an AnalyserNode
// would drop the samples between polls, and the repeat and spectrum cards
// need a contiguous recording. The context runs at the track's own sample
// rate so nothing is resampled on the way in.
const WORKLET = `
class FoopsMicRecorder extends AudioWorkletProcessor {
    constructor() {
        super();
        this.buffer = new Float32Array(4096);
        this.filled = 0;
    }
    process(inputs) {
        const channel = inputs[0] && inputs[0][0];
        if (!channel) return true;
        for (let i = 0; i < channel.length; i++) {
            this.buffer[this.filled++] = channel[i];
            if (this.filled === this.buffer.length) {
                this.port.postMessage(this.buffer);
                this.buffer = new Float32Array(4096);
                this.filled = 0;
            }
        }
        return true;
    }
}
registerProcessor("foops-mic-recorder", FoopsMicRecorder);
`;

function createContext(sampleRate) {
    try {
        return sampleRate ? new AudioContext({ sampleRate }) : new AudioContext();
    } catch (err) {
        return new AudioContext();
    }
}

// Resolves { samples: Float32Array (first channel), sampleRate }.
export async function recordSamples(track, seconds, onProgress = () => {}) {
    const ctx = createContext(trackSettings(track).sampleRate);
    const url = URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" }));
    try {
        await ctx.audioWorklet.addModule(url);
        await ctx.resume();
        const source = ctx.createMediaStreamSource(new MediaStream([track]));
        const recorder = new AudioWorkletNode(ctx, "foops-mic-recorder");
        // Pulled through a silent gain so every browser keeps it running.
        const mute = ctx.createGain();
        mute.gain.value = 0;
        source.connect(recorder).connect(mute).connect(ctx.destination);

        const target = Math.round(seconds * ctx.sampleRate);
        const chunks = [];
        let received = 0;
        await new Promise((resolve) => {
            const stall = setTimeout(resolve, seconds * 1000 + 3000);
            recorder.port.onmessage = (event) => {
                chunks.push(event.data);
                received += event.data.length;
                onProgress(Math.min(1, received / target));
                if (received >= target) {
                    clearTimeout(stall);
                    resolve();
                }
            };
        });
        source.disconnect();
        recorder.port.onmessage = null;

        const samples = new Float32Array(Math.min(received, target));
        let offset = 0;
        for (const chunk of chunks) {
            const take = Math.min(chunk.length, samples.length - offset);
            samples.set(chunk.subarray(0, take), offset);
            offset += take;
            if (offset === samples.length) break;
        }
        return { samples, sampleRate: ctx.sampleRate };
    } finally {
        URL.revokeObjectURL(url);
        ctx.close();
    }
}
