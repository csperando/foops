// ---------- 5. Track shape: settings, capabilities, provenance ----------
// A track from a capture device has a deviceId that's in the device list,
// and the browser offers its echo cancellation / noise suppression / gain
// control on it. A track a script built from Web Audio (a
// MediaStreamAudioDestinationNode playing synthetic speech) has neither.
//
// Chrome names a MediaStreamAudioDestinationNode's track "WebAudio-<uuid>"
// and only offers [false] for each processing setting on it.
//
// Pure: takes settings, capabilities and the device list as plain objects.
import { physicalInputs } from "./inventory.js";

const PROCESSING = ["echoCancellation", "noiseSuppression", "autoGainControl"];

function range(cap) {
    return cap && typeof cap === "object" && "min" in cap ? `${cap.min}-${cap.max}` : cap ?? null;
}

export function detectTrackShape({ settings, capabilities, devices, supportedConstraints = {} }) {
    if (!settings) {
        return {
            state: "unknown",
            label: "no track",
            text: "No microphone track to inspect.",
            data: { flag: null }
        };
    }

    const listed = (devices || []).some((d) => d.kind === "audioinput" && d.deviceId === settings.deviceId);
    const inputs = physicalInputs(devices);
    // Offered means the browser can actually switch it on.
    const processingOffered = capabilities
        ? PROCESSING.filter((key) => Array.isArray(capabilities[key]) ? capabilities[key].includes(true) : key in capabilities)
        : [];
    const webAudio = /^webaudio-/i.test(settings.deviceId || "");
    const browserOffersProcessing = PROCESSING.some((key) => supportedConstraints[key]);
    const processingLeftOn = PROCESSING.filter((key) => settings[key] === true);

    // Sharing a groupId with an output or camera means one physical product
    // (headset, webcam, the laptop's audio codec). Virtual cables can pair
    // their own input and output too, so this is context only.
    const pairedWith = (devices || [])
        .filter((d) => d.kind !== "audioinput" && d.groupId && d.groupId === settings.groupId)
        .map((d) => d.label || d.kind);

    let state, label, flag, note;
    if (webAudio) {
        state = "no";
        label = "web audio track";
        flag = "strong";
        note = "The track came from a Web Audio graph on this page, not a capture device — a script is generating the 'microphone'.";
    } else if (!settings.deviceId) {
        state = "warn";
        label = "no device id";
        flag = "weak";
        note = "The track has no deviceId — it may have been built by a script rather than opened from a capture device.";
    } else if (devices && !listed) {
        state = "warn";
        label = "unlisted device";
        flag = "weak";
        note = "The track's deviceId doesn't match any input in enumerateDevices() — possible stream injection.";
    } else if (browserOffersProcessing && processingOffered.length === 0) {
        state = "warn";
        label = "no processing caps";
        flag = "weak";
        note = "This browser offers echo cancellation / noise suppression / gain control on capture tracks, but this track has none — typical of a track built from Web Audio.";
    } else {
        state = "yes";
        label = pairedWith.length ? "capture + paired" : "capture track";
        flag = null;
        note = "Looks like a track opened from a listed capture device." +
            (pairedWith.length ? " It also shares a groupId with another device of the same product." : "");
    }

    return {
        state,
        label,
        text: JSON.stringify(
            {
                deviceListed: devices ? listed : null,
                inputsListed: inputs.length,
                sampleRate: settings.sampleRate ?? null,
                sampleSize: settings.sampleSize ?? null,
                channelCount: settings.channelCount ?? null,
                latency: settings.latency ?? null,
                processingOffered,
                processingLeftOn,
                capabilityRanges: capabilities
                    ? { sampleRate: range(capabilities.sampleRate), channelCount: range(capabilities.channelCount), latency: range(capabilities.latency) }
                    : null,
                sharesGroupIdWith: pairedWith,
                verdict: note
            },
            null, 2
        ),
        data: { flag, listed, webAudio, processingOffered, processingLeftOn, pairedWith }
    };
}
