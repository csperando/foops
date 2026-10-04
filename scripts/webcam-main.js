import { $, setBadge } from "./ui/dom.js";
import { renderWebcamHero } from "./ui/webcamHero.js";
import { renderWebcamRaw } from "./ui/webcamRaw.js";
import {
    setCardPending,
    renderCameraPermissionCard,
    renderInventoryCard,
    renderApiIntegrityCard,
    renderLabelCard,
    renderHardwareCard,
    renderControlCard,
    renderTimingCard,
    renderNoiseCard,
    renderFlashCard,
    renderConsistencyCard,
    renderMonitorCard,
    renderVmCard
} from "./ui/webcamCards.js";
import {
    isCameraSupported, startCamera, getVideoTrack, listDevices, sampleFrames, trackSettings, trackLabel
} from "./detectors/webcam/stream.js";
import { getPristine } from "./integrity/pristine.js";
import { analyzeFrameTiming } from "./detectors/webcam/frameTiming.js";
import { analyzePixelNoise } from "./detectors/webcam/pixelNoise.js";
import { runControlResponse } from "./detectors/webcam/controlResponse.js";
import { runFlashChallenge } from "./detectors/webcam/flashChallenge.js";
import { startMonitor } from "./detectors/webcam/monitor.js";

// Create the pristine realm before anything else on the page runs, so it's
// captured as early as possible.
getPristine();

// Latest result per card, read by the hero to combine them into one verdict.
const results = { cameraStarted: false };
let devices = null;
let monitor = null;
let flashRunning = false;
let rechallengeTimer = null;

function refreshSummary() {
    renderWebcamHero(results);
    renderWebcamRaw({ devices, track: getVideoTrack() });
}

// Cards 2-5 all reason about the same enumerateDevices() snapshot.
async function refreshDevices() {
    devices = await listDevices();
    const track = getVideoTrack();
    results.inventory = renderInventoryCard(devices);
    results.integrity = await renderApiIntegrityCard({ track, devices });
    if (track) {
        results.labels = renderLabelCard(devices, track);
        results.hardware = renderHardwareCard(track, devices);
    }
    refreshSummary();
}

// Cards 7 and 8 analyze the same sampled frames.
async function analyzeFrames() {
    setCardPending("badge-timing", "out-timing", "sampling", "Sampling frames for 5 seconds…");
    setCardPending("badge-noise", "out-noise", "sampling", "Sampling frames for 5 seconds…");
    const samples = await sampleFrames($("cam-video"), 5000);
    results.timing = renderTimingCard(analyzeFrameTiming(samples, getVideoTrack()));
    results.noise = renderNoiseCard(analyzePixelNoise(samples));
    refreshSummary();
}

// Runs after the frame sample, since it deliberately changes the picture.
async function checkControlResponse() {
    setCardPending("badge-control", "out-control", "testing", "Driving brightness/exposure to min and max…");
    results.control = renderControlCard(await runControlResponse(getVideoTrack(), $("cam-video")));
    refreshSummary();
}

function checkConsistency() {
    const track = getVideoTrack();
    const video = $("cam-video");
    results.consistency = renderConsistencyCard({
        settings: trackSettings(track),
        pageSettings: track.getSettings(),
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        label: trackLabel(track),
        devices,
        measuredFps: results.timing && results.timing.data.fps
    });
    refreshSummary();
}

function ensureMonitor() {
    if (monitor) return;
    monitor = startMonitor({
        video: $("cam-video"),
        track: getVideoTrack(),
        isPaused: () => flashRunning,
        onEvent: () => {
            results.monitor = renderMonitorCard(monitor);
            refreshSummary();
        }
    });
    results.monitor = renderMonitorCard(monitor);
    refreshSummary();
    // Refresh the card's "clean for Ns" and frame counts periodically.
    setInterval(() => {
        results.monitor = renderMonitorCard(monitor);
        refreshSummary();
    }, 5000);
}

async function runFlash() {
    if (flashRunning) return results.flash;
    flashRunning = true;
    $("btn-flash").disabled = true;
    setCardPending("badge-flash", "out-flash", "running", "Flashing…");
    try {
        results.flash = renderFlashCard(await runFlashChallenge($("cam-video"), $("flash-overlay")));
        refreshSummary();
        return results.flash;
    } finally {
        flashRunning = false;
        $("btn-flash").disabled = false;
    }
}

// Opt-in: re-run the flash test at a random moment 1-3 minutes out, so a
// feed can't pass once and then switch to a recording.
function scheduleRechallenge() {
    clearTimeout(rechallengeTimer);
    if (!$("chk-rechallenge").checked) return;
    const delay = 60000 + Math.random() * 120000;
    rechallengeTimer = setTimeout(async () => {
        if (document.hidden) {
            scheduleRechallenge();
            return;
        }
        const result = await runFlash();
        if (monitor && result) monitor.log("flash re-challenge", result.data.flag, result.label);
        scheduleRechallenge();
    }, delay);
}

$("btn-camera").addEventListener("click", async () => {
    const btn = $("btn-camera");
    const badge = $("badge-camera");
    btn.disabled = true;

    if (!isCameraSupported()) {
        setBadge(badge, "unknown", "unsupported");
        $("out-camera").textContent = "getUserMedia isn't available here (it needs a secure context: https or localhost).";
        btn.disabled = false;
        return;
    }

    try {
        const firstStart = !results.cameraStarted;
        const track = await startCamera($("cam-video"));
        results.cameraStarted = true;
        setBadge(badge, "yes", "live");
        $("out-camera").textContent = `Receiving: ${trackLabel(track) || "(unlabeled track)"}`;
        if (firstStart) {
            track.addEventListener("ended", () => {
                setBadge(badge, "warn", "ended");
                $("out-camera").textContent = "The camera track ended (unplugged, or stopped by the source).";
            });
        }

        await refreshDevices();
        await analyzeFrames();
        await checkControlResponse();
        checkConsistency();
        ensureMonitor();
        $("btn-flash").disabled = false;
        $("chk-rechallenge").disabled = false;
        btn.textContent = "Re-run analysis";
    } catch (err) {
        setBadge(badge, "warn", "denied/error");
        $("out-camera").textContent = "Camera denied or unavailable: " + err.message;
    } finally {
        btn.disabled = false;
    }
});

$("btn-flash").addEventListener("click", runFlash);
$("chk-rechallenge").addEventListener("change", scheduleRechallenge);

renderCameraPermissionCard(refreshDevices);
renderVmCard();
refreshDevices();

// React live to cameras being plugged in, unplugged, or a virtual camera
// being started while the page is open.
if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener("devicechange", refreshDevices);
}
