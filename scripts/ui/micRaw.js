import { $ } from "./dom.js";

const shortId = (id) => (id ? id.slice(0, 8) + "…" : "");

// ---------- Raw diagnostics ----------
export function renderMicRaw({ devices, track, settings, capabilities, recording }) {
    const md = navigator.mediaDevices;
    $("out-raw").textContent = JSON.stringify({
        apis: {
            "navigator.mediaDevices": !!md,
            "getUserMedia": !!(md && md.getUserMedia),
            "enumerateDevices": !!(md && md.enumerateDevices),
            "AudioWorklet": typeof AudioWorkletNode === "function",
            "MediaStreamTrack.getCapabilities": typeof MediaStreamTrack.prototype.getCapabilities === "function",
            "navigator.permissions": !!(navigator.permissions && navigator.permissions.query),
            "isSecureContext": window.isSecureContext
        },
        supportedConstraints: md && md.getSupportedConstraints ? md.getSupportedConstraints() : null,
        devices: devices
            ? devices.map((d) => ({ kind: d.kind, label: d.label, deviceId: shortId(d.deviceId), groupId: shortId(d.groupId) }))
            : null,
        track: track
            ? { label: track.label, readyState: track.readyState, muted: track.muted, settings, capabilities }
            : null,
        recording: recording
            ? { samples: recording.samples.length, sampleRate: recording.sampleRate }
            : null
    }, null, 2);
}
