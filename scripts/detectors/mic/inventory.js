// ---------- 2. Device inventory (enumerateDevices) ----------
// Takes the device list as a parameter (fetched once in mic-main.js) so
// cards 2-5 all reason about the same snapshot.

// Chromium lists the OS default and communications devices a second time,
// as "default" and "communications" entries; they aren't extra hardware.
export function physicalInputs(devices) {
    return (devices || []).filter((d) => d.kind === "audioinput" && d.deviceId !== "default" && d.deviceId !== "communications");
}

export function detectMicInventory(devices) {
    if (!devices) {
        return {
            state: "unknown",
            label: "unsupported",
            text: "navigator.mediaDevices.enumerateDevices() is not available here (it needs a secure context: https or localhost).",
            data: { supported: false }
        };
    }

    const mics = physicalInputs(devices);
    const outputs = devices.filter((d) => d.kind === "audiooutput" && d.deviceId !== "default" && d.deviceId !== "communications");
    const labelsVisible = mics.some((m) => m.label);

    let state, label;
    if (mics.length === 0) {
        state = "no";
        label = "no microphone";
    } else if (mics.length > 1) {
        state = "warn";
        label = `${mics.length} microphones`;
    } else {
        state = "yes";
        label = "1 microphone";
    }

    return {
        state,
        label,
        text: JSON.stringify(
            {
                audioinputs: mics.map((m) => m.label || "(label hidden until permission)"),
                audiooutputCount: outputs.length,
                labelsVisible,
                note: labelsVisible
                    ? (mics.length > 1
                        ? "More than one input. Common on real machines (webcam mic, headset), and also when virtual audio software is installed. Card 4 checks which one is in use."
                        : "Full list, visible because microphone access has been granted.")
                    : "Before permission, browsers may cap this list at one device per kind, so the count can't rule a virtual input out yet."
            },
            null, 2
        ),
        data: { supported: true, micCount: mics.length, labelsVisible }
    };
}
