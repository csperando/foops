import { $ } from "./dom.js";

// Cards whose result can raise a red flag, with the card name shown in the
// hero's sub-line. Each detector marks its own result with
// data.flag = "strong" | "weak" | null.
const FLAG_SOURCES = {
    integrity: "3. API integrity",
    labels: "4. device name",
    shape: "5. track shape",
    noise: "6. noise floor",
    bandwidth: "7. bandwidth",
    resolution: "8. resolution",
    repeats: "10. exact repeats"
};

function setHero(verdict, state, sub, flagCount) {
    $("hero-verdict").textContent = verdict;
    $("hero-verdict").className = "hero-verdict " + state;
    $("hero-sub").textContent = sub;
    $("hero-count").innerHTML = flagCount === null ? "" : `${flagCount}<small>red flag${flagCount === 1 ? "" : "s"}</small>`;
}

// ---------- Hero ----------
// Precedence:
//   1. a tampered audio API (card 3) overrides everything;
//   2. before a recording, there's nothing to judge;
//   3. otherwise, a tally of the flags. Card 9's analog traces never flag,
//      but are named when the verdict is positive.
export function renderMicHero(results) {
    const flags = Object.keys(FLAG_SOURCES)
        .filter((key) => results[key] && results[key].data && results[key].data.flag)
        .map((key) => ({ name: FLAG_SOURCES[key], strength: results[key].data.flag }));
    const strong = flags.filter((f) => f.strength === "strong");
    const weak = flags.filter((f) => f.strength === "weak");
    const list = flags.map((f) => `${f.name} (${f.strength})`).join(", ");

    if (results.integrity && results.integrity.data.flag === "strong") {
        setHero("Microphone API tampered", "no", "Source: card 3. A script is intercepting or faking the audio stream.", flags.length);
        return;
    }

    if (!results.recorded) {
        setHero("Not checked yet", "unknown", "Start the microphone to record a few seconds and run the signal checks.", null);
        return;
    }

    if (strong.length || weak.length >= 2) {
        setHero("Likely virtual microphone", "no", `Flagged by ${list}.`, flags.length);
    } else if (weak.length === 1) {
        setHero("Suspicious", "warn", `One weak flag: ${list}.`, flags.length);
    } else {
        const analog = results.analog && results.analog.data.analog ? ` Card 9 found ${results.analog.label}, a trace of analog hardware.` : "";
        setHero("Looks like a real microphone", "yes", `No card raised a flag.${analog}`, 0);
    }
}
