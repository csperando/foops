import { $ } from "./dom.js";

// ---------- Hero ----------
export function renderHero(isExtended) {
    const heroVerdict = $("hero-verdict");
    const heroSub = $("hero-sub");

    if (isExtended.supported) {
        const extended = isExtended.outcome === "multiple";
        heroVerdict.textContent = extended ? "Multiple displays detected" : "Single display";
        heroVerdict.className = "hero-verdict " + (extended ? "yes" : "no");
        heroSub.textContent = "Source: screen.isExtended (Window Management API, no permission needed).";
    } else if (isExtended.data.blockedByPolicy) {
        heroVerdict.textContent = "Unknown (blocked in this frame)";
        heroVerdict.className = "hero-verdict unknown";
        heroSub.textContent = "This frame is denied the window-management permissions policy — see card 9.";
    } else {
        heroVerdict.textContent = "Unknown (unsupported browser)";
        heroVerdict.className = "hero-verdict unknown";
        heroSub.textContent = "screen.isExtended isn't supported here â€” see the heuristic cards below.";
    }
}
