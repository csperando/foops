// ---------- 4. Microphone name hints ----------
// Same idea as the webcam page's label card: substring-match the device
// name against the defaults virtual audio software ships with. Easy to beat
// by renaming the device, but most people don't.

// Inputs that carry whatever another program plays into them.
export const VIRTUAL_MIC_HINTS = [
    "vb-audio", "voicemeeter", "cable output", "blackhole", "soundflower", "loopback audio",
    "zoomaudiodevice", "microsoft teams audio", "steam streaming microphone", "voicemod",
    "clownfish", "morphvox", "jack audio", "dante virtual", "virtual", "fake"
];

// Inputs that record the computer's own output rather than the room.
export const LOOPBACK_HINTS = ["stereo mix", "what u hear", "wave out mix", "monitor of "];

// Virtual devices that wrap a real microphone (noise removal, mixing). The
// sound still starts at a physical mic, so these are context, not a flag.
export const PROCESSOR_HINTS = ["krisp", "nvidia broadcast", "rtx voice", "sonar - microphone", "wave link", "nahimic"];

// Chromium prefixes its duplicate default/communications entries.
export function baseLabel(label) {
    return (label || "").replace(/^(default|communications) - /i, "");
}

function classify(label) {
    const lower = baseLabel(label).toLowerCase();
    for (const [kind, hints] of [["loopback", LOOPBACK_HINTS], ["processor", PROCESSOR_HINTS], ["virtual", VIRTUAL_MIC_HINTS]]) {
        const hint = hints.find((h) => lower.includes(h));
        if (hint) return { kind, hint };
    }
    return null;
}

// Chromium on Windows and Linux appends a USB device's vendor:product ID,
// e.g. "Microphone (C920) (046d:082d)". Built-in mics don't get one, so
// only its presence means anything.
const USB_ID = /\(([0-9a-f]{4}):([0-9a-f]{4})\)\s*$/i;

export function detectMicLabels(devices, activeLabel) {
    const micLabels = (devices || []).filter((d) => d.kind === "audioinput").map((d) => baseLabel(d.label)).filter(Boolean);
    const active = baseLabel(activeLabel);

    if (!active && micLabels.length === 0) {
        return {
            state: "unknown",
            label: "no labels",
            text: "No microphone names are visible yet — they're only exposed after microphone permission is granted.",
            data: { flag: null }
        };
    }

    const match = classify(active);
    const installed = [...new Set(micLabels)]
        .filter((label) => label !== active)
        .map((label) => ({ label, ...classify(label) }))
        .filter((m) => m.kind && m.kind !== "processor");
    const usb = USB_ID.exec(active);

    let state, label, flag, note;
    if (match && match.kind === "loopback") {
        state = "no";
        label = "loopback input";
        flag = "strong";
        note = "The input in use records this computer's own sound output, not a microphone.";
    } else if (match && match.kind === "virtual") {
        state = "no";
        label = "virtual mic in use";
        flag = "strong";
        note = "The input in use has a known virtual audio device name: it plays whatever another program sends it.";
    } else if (match) {
        state = "warn";
        label = "processed mic";
        flag = null;
        note = "The input in use is a noise-removal or mixing app's virtual mic. Those normally wrap a real microphone, but can't be checked through.";
    } else if (installed.length) {
        state = "warn";
        label = "virtual audio installed";
        flag = null;
        note = "Virtual audio software is installed but isn't the input in use. Worth knowing, not evidence about this recording.";
    } else {
        state = "yes";
        label = usb ? "usb id present" : "no known names";
        flag = null;
        note = "No known virtual audio names. Not proof — a renamed device would pass this.";
    }

    return {
        state,
        label,
        text: JSON.stringify(
            {
                activeInput: active || null,
                activeMatchedHint: match,
                otherVirtualInputs: installed,
                activeUsbId: usb ? `${usb[1]}:${usb[2]}`.toLowerCase() : null,
                verdict: note
            },
            null, 2
        ),
        data: { flag, match, installed }
    };
}
