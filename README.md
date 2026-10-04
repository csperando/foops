# foops: Spoof Detection

Disclaimer, fraud detection is tricky. A determined attacker will be able to bypass these checks with enough effort. However, this still provides better detection capabilities than other publicly available detection tests.

We currently offer the following services:
- Multi-Monitor Detection, also published as the `foops` library ([use it](#use-as-a-library))
- Virtual Webcam Detection (demo page only, for now)

Demo: [https://csperando.github.io/foops/](https://csperando.github.io/foops/)

## Use as a library

`foops` runs the multi-monitor checks in the browser and returns a plain
JSON report: a verdict, every check's result (a *signal*), and a timeline of
what changed when. It's built for sessions like a remote interview: start a
session when the interview starts, watch it, and send the report to your
server.

> **Never trust a verdict computed in the browser.** The person being
> checked controls the browser, so they can patch the library or forge the
> request. Send the report to your server and re-score it there with
> `foops/server`.

### Install

```sh
npm install foops
```

Or from a CDN. Pin the exact version (see [Versioning](#versioning)), and add
the [SRI](https://developer.mozilla.org/docs/Web/Security/Subresource_Integrity)
hash jsDelivr lists for that file:

```html
<script src="https://cdn.jsdelivr.net/npm/foops@0.1.0/dist/foops.min.js" crossorigin="anonymous"></script>
<script>
  foops.monitor.run().then((report) => console.log(report.verdict));
</script>
```

```js
import { monitor } from "https://cdn.jsdelivr.net/npm/foops@0.1.0/dist/foops.esm.js";
```

### A session per interview

```js
import { monitor } from "foops";

const session = monitor.createSession();

session.on("change", (report, entries) => {
    // An outcome or the verdict changed; `entries` were added to report.timeline.
    console.log(report.verdict, entries);
});

await session.start(); // resolves with the first full report

// getScreenDetails() prompts for permission, so call it from a click.
button.addEventListener("click", () => session.screenDetails());

// When the interview ends:
const report = session.stop();
await fetch("/interview/123/foops", { method: "POST", body: JSON.stringify(report) });
```

Sessions never share state, so several can run at once (React StrictMode
mounting twice is fine), and a new interview gets a clean slate.
`session.reset()` clears the timeline and what the observers remember
without stopping. `stop()` removes every listener and timer.

| Method | Description |
|---|---|
| `start()` | Starts watching. Resolves with the first report. Only once per session. |
| `screenDetails()` | Runs `getScreenDetails()` (permission prompt; needs a user gesture). Later screen changes keep updating the session. |
| `report()` | The current report. |
| `reset()` | Clears the timeline and observer memory; keeps running. |
| `stop()` | Stops everything and returns the final report. |
| `on(event, fn)` | Returns a function that removes the listener. Events: `update (report, ids)` whenever a signal is refreshed, `change (report, entries)` when an outcome or the verdict changes, and `pending (id)` when an async check starts. |
| `state` | `"idle"`, `"running"` or `"stopped"`. |

Options for `createSession(options)` (also `run` and `checks.<id>`):

| Option | Default | Description |
|---|---|---|
| `checks` | every check | Check ids to run. Skip `refreshRate` or `virtualization` to avoid their cost. Checks another check depends on run anyway but stay out of the report. |
| `scorer` | `defaultScorer` | `(signals) => ({ verdict, score })`. |
| `cadence` | `{ windowPositionMs: 500, refreshRateMs: 4000, refreshTimeoutMs: 1000 }` | Poll intervals, and how long `start()` waits for the first refresh-rate measurement. |

### Score on the server

```js
import { rescore } from "foops/server";

const result = rescore(reportFromClient);
// { verdict, score, signals, mismatches, unknownChecks, versionMatches }
```

`rescore` ignores the client's verdict and outcomes. It recomputes every
signal from its own data with the same pure checks the browser ran, then
scores the result. `mismatches` lists signals whose reported outcome doesn't
follow from their data, which is a sign of a hand-edited report.
`versionMatches` says whether the report came from the same library version.

It can't catch a client that fabricates *consistent* data. Treat a clean
report as the absence of red flags, not as proof.

### One-shot checks

```js
const report = await monitor.run();                 // start, first readings, stop
const signal = await monitor.checks.isExtended();   // any check id, on its own
```

`windowPosition` and `refreshRate` watch for changes over time, so on their
own they only see a single sample. Use a session for those.

### Custom scorers

The default scorer is deliberately simple until there's a real formula: the
verdict comes from `screen.isExtended` alone (`score` 1, 0 or null), and the
other signals don't change it yet. Pass your own to combine them. It runs in
the browser and in `rescore`:

```js
const scorer = (signals) => {
    const { isExtendedIntegrity } = signals;
    if (isExtendedIntegrity?.outcome === "tampered") return { verdict: "unknown", score: null };
    return monitor.defaultScorer(signals);
};
monitor.createSession({ scorer });
rescore(report, { scorer });
```

### Reports and signals

A report is plain, JSON-serializable data:

```js
{
  version: "0.1.0",          // library version that produced it
  verdict: "single",         // "single" | "multiple" | "unknown", from the scorer
  score: 0,                  // number | null, from the scorer
  startedAt, updatedAt,      // epoch ms
  signals: { isExtended: { ... }, ... },
  timeline: [
    { t, id: "isExtended", supported: true, outcome: "single", strength: "strong" },
    { t, id: "verdict", outcome: "single", score: 0 }
  ]
}
```

Every check returns a **signal**:

| Field | Description |
|---|---|
| `id` | The check id. |
| `kind` | `evidence` (about the question itself), `integrity` (can the readings be trusted?) or `context` (the environment, which changes how much the rest is worth). |
| `supported` | `false` when the browser can't run the check here. `outcome` is then `null`. |
| `outcome` | Evidence: `multiple`, `single` or `inconclusive`. Integrity: `clean`, `modified`, `suspicious` or `tampered`. Context: check-specific. |
| `strength` | `strong`, `weak`, or `null` for outcomes that carry no weight. |
| `data` | The facts the outcome was derived from. |

The checks:

| id | kind | outcomes | cost | `data` |
|---|---|---|---|---|
| `isExtended` | evidence | multiple, single (strong) | free | `value`, `blockedByPolicy` |
| `screenDetails` | evidence | multiple, single (strong); inconclusive if denied | **permission prompt, user gesture** | `count`, `screens[]`, `live`, `error` |
| `screenLabels` | context | virtual (weak), physical | with `screenDetails` | `matches[]` |
| `screenLabelIntegrity` | integrity | clean, tampered (strong) | with `screenDetails` | `getterNative`, `shadowedOnScreen` |
| `permission` | context | granted, denied, prompt | free | `name`, `state`, `error` |
| `availOffset` | evidence | multiple (weak), inconclusive | free | `left`, `top`, `offsetDetected` |
| `windowPosition` | evidence | multiple (strong), inconclusive | polled | `screenX`, `screenY`, `outerWidth`, `outerHeight`, `screenWidth`, `screenHeight`, `outOfBounds`, `everDetected` |
| `isExtendedIntegrity` | integrity | clean, modified (weak), tampered (strong) | free | `reason`, `getterNative`, `toStringPatched`, `pristineTampered` |
| `isExtendedConsistency` | integrity | clean, suspicious (weak) | free | `availOffsetDetected`, `windowPositionDetected` |
| `refreshRate` | evidence | multiple (weak), inconclusive | ~500 ms of animation frames, repeated | `hz`, `previousHz`, `changed` |
| `virtualization` | context | virtual (weak), physical | opens a WebGL context once | `renderer`, `vendor`, `unmasked`, `matchedHint` |
| `embedding` | context | top, iframe (strong when the API is blocked) | free | `framed`, `windowManagementAllowed` |

A few outcomes need care:

- `isExtendedIntegrity` reports **`modified`** (reason `tostring-patched`)
  when the page's `Function.prototype.toString` was replaced. Privacy
  browsers (Brave), frameworks (zone.js) and monitoring tools (Sentry) all
  do this, so it isn't evidence of cheating.
- Inside a cross-origin iframe without `allow="window-management"`,
  `isExtended` reports `supported: false` with `blockedByPolicy: true`.
  Embed with that `allow` attribute if you need it.
- **`unknown` is normal.** Most checks need Chromium; Firefox and Safari
  users mostly get unsupported signals and an `unknown` verdict. Don't treat
  that as suspicious.

### Privacy

Reports contain fingerprinting data: screen labels and geometry
(`screenDetails`) and the GPU renderer string (`virtualization`). The server
needs them to recompute outcomes. If you store reports, treat them as
personal data under the privacy laws that apply to you, and tell people
what you collect.

### Versioning

- **While on 0.x**, a minor release (0.2.0) may change the API or what
  outcome a given input produces. A patch release fixes bugs without
  changing any outcome for the same input.
- **From 1.0**, API and report-shape changes are major releases. Changes
  that make the same input produce a different outcome (thresholds, new
  evidence) are minor releases, listed under "Detection changes".
- Pin an exact version either way: a detection change is a behavior change.

### Development

```sh
npm test        # node --test; no browser needed
npm run build   # dist/foops.esm.js, dist/foops.min.js, dist/server.js
```

Serve the repo root with any static server:
- `index.html` is the library demo; add `?dist` to load the built bundle.
- `monitor.html` and `webcam.html` are the detector playgrounds.
- `test/hosts/wrapped.html` runs foops next to zone.js- and Sentry-style
  wrappers.

## Multi-Monitor Detection Tests

Playground: [https://csperando.github.io/foops/monitor.html](https://csperando.github.io/foops/monitor.html)

This application consists of nine separate tests aimed at reproducing
how a website can detect a second display, usually without
asking for any permission. A summary of the implementation
for each of the nine methods is provided below. In the library, each
method is one or more [checks](#reports-and-signals).

### 1. `screen.isExtended`

A boolean on `window.screen` that reports whether the display setup is
extended across multiple screens. No permission prompt required — this is
almost certainly what most sites use, and is likely what tipped you off.

### 2. `getScreenDetails()`

The full Window Management API. Returns an array of every connected screen
with size, position, and primary/internal flags. Requires a user gesture and
an explicit permission grant, so it can't run silently on page load. Each
screen's `label` (a free-form string the OS hands the browser; virtual
machines often name their virtual display) is also checked against the same
virtualization hint list method 8 uses for the WebGL renderer string. It's a
weak signal on its own (spoofable the same way `isExtended` is, and
legitimate hardware sometimes reports generic labels too), but it's a check
most stealth tooling doesn't think to fake specifically.

The label is only useful if it's real, so the `ScreenDetailed.prototype.label`
getter goes through the same two-part native check as method 6. A spoof that
swaps the name for a plausible one (e.g. "Generic PnP Monitor") shows up as
"label spoofed", and so does a `label` shadowed on a screen object.

### 3. Permissions API state (no prompt)

`navigator.permissions.query({ name: "window-management" })` silently reveals
whether that permission is already granted, denied, or unset — without ever
showing a dialog. A prior grant lets a site skip straight to method 2.

### 4. Heuristic: `screen.availLeft` / `availTop`

Non-standard but long-supported properties: the origin of the available
area of the screen the window is on, relative to the primary display. A
negative value means the window is on a display left of or above the primary
one; a value of at least a display's size (640px or more) means one to the
right or below. Small positive values are just a taskbar or dock docked
left/top, so they don't count. A weak hint, with zero permissions involved.

### 5. Heuristic: window position vs. screen bounds

Polls `window.screenX`/`screenY` against `screen.width`/`height`. If the
window is ever positioned or dragged outside the primary screen's bounds,
another display must exist.

### 6. Tamper / spoof detection for `isExtended`

Users and privacy tools (e.g. Brave, hardened browsers, anti-fingerprinting
extensions) can override `isExtended` to always report `false`. This method
checks whether the property's getter is still native code, and cross-checks
its answer against methods 4 and 5 for consistency.

The native-code check (`scripts/integrity/nativeCode.js`) uses a trusted
`Function.prototype.toString` taken from a hidden, same-origin `about:blank`
iframe (`scripts/integrity/pristine.js`). That iframe has its own fresh set
of built-ins, which a script that patched *this* page hasn't touched. The
check calls it via `.call()` rather than asking the getter to stringify
itself, so a lying per-function `toString` can't intervene. A page-wide
`toString` patch can't either. The getter's source must also match the
pristine realm's copy exactly. That catches a `Proxy` wrapped around the
native getter, which stringifies as an anonymous `function () { [native
code] }`. The check also reports whether this page's `toString` itself has
been replaced (Brave does this legitimately).

A second, independent test doesn't use `toString` at all
(`scripts/integrity/stackProbe.js`). It calls the getter on an illegal
receiver (a plain object). Native code rejects that brand check with a
`TypeError` whose stack has no script frames above the call. A script
wrapper doesn't: a fake getter just returns its value, and a wrapper or
`Proxy` that calls through leaves its own `file:line:col` frame on the stack.
The probe also checks the pristine realm's own references. A tool that
injects into *every* frame (browser automation can) patches that iframe too.
The check then reports "reference tampered", because nothing else puts code
into a blank iframe the page just created.

### 7. Hardware signal: display refresh-rate (vsync) timing

Counts `requestAnimationFrame` callbacks over a fixed window to measure the
monitor's actual refresh rate from real vsync timing, rather than an
OS-reported flag. Re-measures periodically; a shift in Hz with no
display-settings change usually means the window crossed onto a different
physical screen with a different refresh rate. Grounded in real hardware
timing rather than a settable property, so it's harder to convincingly spoof
than methods 1–6.

### 8. Context signal: is this even physical hardware?

Reads the WebGL renderer/vendor strings, which often name the virtual GPU
driver in a VM (VMware SVGA3D, VirtualBox, Hyper-V) or a software renderer
(llvmpipe, SwiftShader). Doesn't detect monitors directly — it's a trust
modifier for the other seven: inside a VM, virtual display counts are
whatever the hypervisor is configured to present, and method 7's "hardware"
refresh-rate timing is usually a synthetic, hypervisor-emulated 60Hz rather
than a real vsync signal.

### 9. Context signal: is this page embedded?

Checks whether the page runs inside a frame, and whether the Window
Management API is allowed there (the `window-management` permissions
policy). A cross-origin iframe without `allow="window-management"` is denied
it, yet `screen.isExtended` still exists and returns a boolean. So method 1
reports itself as blocked there rather than trusting that value.

## Limitations

- **Feature detection isn't tamper detection.** A missing API (`"isExtended"
  in screen` is `false`) is an honest signal — usually an unsupported browser
  or an enterprise policy. A *present but overridden* API is not detectable
  the same way.
- **The native-code check can still be defeated at a deeper level.** It
  resists per-function `toString` lies, page-wide `toString` patches,
  `Proxy` wrappers, and spoofs injected into every frame (including the
  pristine iframe), because the stack-trace probe doesn't depend on
  `toString`. What's left:
  - A spoofer can reshape stack traces with `Error.prepareStackTrace` or
    `Error.stackTraceLimit`. The webcam page reports that as a weak flag.
  - A spoofer can make its fakes reject illegal receivers without leaving a
    frame, which is hard in JavaScript but not impossible.
  - Spoofing below JavaScript entirely (a modified browser build, or a
    driver) is invisible to any page.

  Beyond that, verifying the verifier never fully terminates.
- **Cross-signal checks only catch inconsistency, not truth.** If every
  signal is spoofed in agreement, nothing on this page can tell.
- **Chromium-only for methods 2 and 3.** `getScreenDetails()` and the
  `window-management` permission are not implemented in Firefox or Safari at
  time of writing.
- **Heuristics require interaction.** Methods 4 and 5 can only confirm a
  multi-monitor setup they've actually observed (e.g. after a drag); they
  can't rule one out.
- **Refresh-rate timing is noisy.** OS power throttling, background-tab
  throttling, and CPU load can shift the measured Hz with no monitor change
  involved, producing false positives.
- **True hardware enumeration isn't reachable from a webpage at all.**
  OS-level display APIs (`EnumDisplayMonitors`, `CGDisplayCopyAllDisplayIDs`,
  `xrandr`) are outside the browser sandbox by design. Getting that ground
  truth requires stepping outside the page entirely — a browser extension
  with a native-messaging host, or a desktop companion app — which needs the
  user to install something, a fundamentally different threat model than a
  passive page fingerprinting silently.
- **Virtual machines and remote sessions undermine nearly everything above.**
  Inside a VM (or an RDP/VNC/cloud-desktop session), every guest-OS-reported
  signal — screen count, position, and even refresh-rate timing — reflects
  the hypervisor's virtual display emulation, not physical hardware. A
  session can also dynamically span a client's several physical monitors
  into what the guest sees as a single screen, or the reverse. Method 8's
  renderer check is a hint, not proof: it can miss unusual real GPUs and
  can't detect virtualization that spoofs the renderer string too.

---

## Phony Webcam Detection Tests

`webcam.html` applies the same approach to cameras: it tries to tell a real
physical webcam from a phony one. Phony here means a virtual camera driver
(OBS Virtual Camera, ManyCam, XSplit VCam, Snap Camera, DroidCam, Chrome's
`--use-fake-device-for-media-stream`) or a script that replaces
`getUserMedia` with a canvas or video stream. Methods 1–3 and 12 run
without permission. Methods 4–11 need the live feed and wait for **Start
camera**. Frames are analyzed in memory and never leave the page.

**Tamper-resistant measurement.** The page opens the camera and reads
pixels through pristine copies of `getUserMedia`, `enumerateDevices`,
`getSettings`, `drawImage`, `getImageData` and `requestVideoFrameCallback`,
taken from a hidden iframe (see method 6 of the monitor page). A script
that patched this page's copies is flagged by method 3, but it can't steer
the measurements. For example, a `getImageData` override that adds fake
noise to a still image is flagged, and method 8 still sees the frozen frames
underneath.

**Hero verdict**, in order of precedence:
1. A tampered camera API (method 3) wins outright.
2. A loop or freeze caught mid-session (method 11) overrides earlier passes.
3. The flash challenge (method 9) decides live vs. phony. If it passes but
   other cards raise strong flags, the verdict is "Live feed, but flagged",
   e.g. a real camera relayed through OBS.
4. Otherwise the page tallies strong and weak flags from methods 3–8 and
   10–11.

### 1. Permissions API state (`camera`)

`navigator.permissions.query({ name: "camera" })` reveals whether camera
access is granted, denied or unset, without a prompt. Shares
`checkPermissionState()` with the monitor page's method 3.

### 2. Device inventory (`enumerateDevices()`)

Counts video inputs. More than one camera is a weak hint, because a virtual
camera usually sits next to the real one. Before permission, browsers may
cap the list at one device per kind and hide labels. Updates live on
`devicechange`.

### 3. Camera API integrity

Compares 15 APIs against their pristine-realm copies, using the same
`isNativeFunction()` helper as monitor method 6:
- the camera APIs (`getUserMedia`, `enumerateDevices`, the `mediaDevices`
  getter, `getSettings`, `getCapabilities`, `applyConstraints`, the track
  `label` getter);
- the APIs a detector reads pixels and time through (`drawImage`,
  `getImageData`, `requestVideoFrameCallback`, `performance.now`,
  `permissions.query`);
- the hooks that could reach into the pristine iframe as it's created
  (`createElement`, `appendChild`, `contentWindow`).

It also flags `getUserMedia`/`enumerateDevices` shadowed on the
`navigator.mediaDevices` instance, and a patched `Function.prototype.toString`
(weak, since Brave does this). Every function, and the pristine realm's own
copies, also goes through the toString-independent stack-trace probe (see
monitor method 6). The promise-returning ones (`getUserMedia`,
`enumerateDevices`, `applyConstraints`, `permissions.query`) are probed
asynchronously. A tampered pristine copy is a strong flag ("reference
tampered"), and altered `Error.prepareStackTrace`/`stackTraceLimit` is weak.
Once the camera starts, it checks that the
track comes from a real device: canvas tracks (`requestFrame`/`canvas`) and
deviceIds missing from `enumerateDevices()` are flagged. This catches
script injection, not driver-level virtual cameras.

### 4. Camera label hints + USB ID

Substring-matches the active camera's label against default virtual-camera
names (`VIRTUAL_CAM_HINTS`). A virtual camera that is installed but not in
use is reported but not counted as a flag.

On Windows and Linux, Chromium appends the USB vendor:product ID to USB
camera labels, e.g. `Integrated Webcam (0bda:5583)`. Virtual cameras never
have one. The check calibrates itself against the browser's behavior: a
missing ID is a weak flag only when another camera on the same system *does*
have one. Built-in MIPI cameras (e.g. Surface) have no USB ID either, which
is why it stays weak.

### 5. Hardware shape: `getCapabilities()` + `groupId`

Real UVC webcams expose sensor controls (exposure, white balance,
brightness, focus, zoom…). A webcam with a built-in mic shares a `groupId`
with its audio input. Virtual cameras usually expose neither. If the browser
exposes no such controls at all (mostly outside Chromium), the card reports
"browser limited" rather than a flag.

### 6. Control response

Method 5 reads what the camera *claims*. This drives the first available
of `brightness`, `exposureCompensation` or `exposureTime` to its minimum and
maximum with `applyConstraints`. It measures the picture's mean brightness
at each, then restores the original setting. A real sensor darkens and
brightens by at least 10 levels. A control that is accepted (the setting
reads back changed) but doesn't change the picture is a strong flag: the
capability is advertised, not real. A silently ignored change or an error
is weak. It runs after the frame sample (methods 7–8), since it
deliberately changes the picture.

### 7. Frame timing

Uses `requestVideoFrameCallback` to read each frame's `captureTime`, falling
back to `mediaTime`, over 5 s. A near-zero coefficient of variation in frame
intervals suggests a software render loop. This is only ever a weak flag.

### 8. Pixel noise / frozen / looped feed

Compares the same sampled frames (160×120 grayscale):
- **Frozen.** A real sensor never produces two bit-identical frames; a
  still image does. Frequent exact repeats (weak) point to a source
  re-sending frames.
- **Looped.** Each frame is reduced to a 16×12 block-average fingerprint.
  A replay is a pair of non-adjacent frames closer than 0.3× the sensor-noise
  distance, with a frame in between that moved at least one noise-distance
  away. Two separate exposures can't get that close, because their noise is
  independent. A replayed frame can, even after slight rescaling.
- **Flat noise.** Per-pixel temporal noise is grouped by brightness, with
  moving pixels dropped. After the camera's gamma curve, real sensor noise
  is strongly brightness-dependent: shadows are noisiest, about 2.5× the
  highlights in simulation. Noise added uniformly to a clean image is flat
  (max/min ratio < 1.3), which is a weak flag.

Near-black frames (a covered lens) are not judged.

### 9. Challenge: screen-flash reflection

Flashes the screen through a random red/green/blue sequence (500 ms per
color, under the WCAG three-flashes-per-second limit). It then correlates
each color channel's share of the frame center with the sequence:
- **Significance.** The score is compared with 2,000 reshuffles of the same
  sequence. It passes only if p < 0.005 and the correlation is at least
  0.5. In simulation, fake feeds pass 0.6% of the time.
- **Capture delay.** The step windows are shifted by 0–400 ms and the best
  fit is kept. The shuffles take their best shift too, so the p-value stays
  honest. A delay outside 40–350 ms is a weak flag (instant = synthetic,
  late = relayed).
- **Where the tint lands.** A real face near the screen tints more than
  the background. A whole-frame color filter tints both equally (ratio
  < 1.1), which is a weak flag.

A recorded or synthetic feed can't follow the sequence, because it's chosen
at runtime. An opt-in checkbox re-runs the test at random 1–3 minute
intervals.

### 10. Cross-check: consistency

Independent readings of the same camera should agree:
- reported vs. actual frame size;
- reported vs. measured frame rate (only *more* frames than reported is
  suspicious, since real cameras slow down in dim light);
- the track's label and `groupId` vs. the device list;
- what this page's `getSettings` returns vs. the pristine copy.

One mismatch is weak, and two or more are strong.

### 11. Session monitor

The other cards check once. This keeps watching for the rest of the session:
- **Every frame is hashed** (a 16×12 thumbnail, ~53-bit hash). A frame that
  repeats *exactly* after the scene has moved on at least twice is a loop.
  This catches loops up to 10 minutes long. A real still scene can't
  trigger it, because nothing moved in between.
- **Identical frames for 3 s** are a freeze.
- **Track changes are logged:** mute/unmute/ended events, stalls (no frame
  for 2 s while the tab is visible), and changes of device, label,
  resolution or frame rate (a source switch).

Loops and freezes are strong flags; the rest are weak.

### 12. Context: VM signal

The monitor page's method 8, reused unchanged. Inside a VM or remote session
the camera is redirected or emulated, so treat the sensor cards with
caution.

## Webcam limitations

- **A virtual camera with a real camera behind it passes the sensor tests.**
  If OBS relays a live webcam, the frames really do come from a sensor.
  Timing, noise, control response (if OBS passes controls through) and even
  the flash test can pass. The label and USB-ID card (4) and hardware shape
  (5) are what catch it, and the hero reports "Live feed, but flagged".
- **Labels can be renamed.** Some tools let you rename the driver, and
  determined users can edit it in the registry.
- **`getCapabilities()`/`applyConstraints()` controls are Chromium-centric**,
  and some cheap real webcams expose few controls too.
- **USB IDs are Chromium-on-Windows/Linux only.** Other browsers and macOS
  don't add them, so method 4 reports "can't judge" there.
- **The noise statistics assume a lightly processed sensor.** Heavy in-camera
  temporal denoising can flatten the noise profile (a false "flat noise",
  weak), and noise added *before* a loop is recorded survives replay. Real
  footage looped through a virtual camera is caught by exact repeats, not by
  its noise.
- **Timing is noisy.** Browser scheduling adds jitter even to
  software-paced sources, so method 7 misses a lot.
- **The flash test needs cooperation.** Bright rooms, a distant face, or
  aggressive auto white balance weaken the reflection. It also flashes the
  screen, so it must stay opt-in.
- **The pristine realm can be reached.** A tool injecting into every frame
  patches the pristine copies too. The stealthiest variant shares one
  patched `toString` across frames and installs on prototypes, so the
  page's own camera path then receives the fake stream. The stack-trace probe still
  catches every patched reference ("reference tampered", a strong flag).
  Measurements taken through tampered copies can't be trusted, but the
  verdict still says so.
- **Tuned on synthetic data.** Thresholds (0.3× noise distance, flat ratio
  1.3, p < 0.005, 40–350 ms delay, 10-level control swing) come from
  simulations. They still need checking against real webcams and real
  virtual cameras.
