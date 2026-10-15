// Small enhancements for the marketing site (index.html, docs.html, examples.html).
// Each page works without this script.

// examples.html: the filter chips. They stay hidden until this runs.
const filters = document.querySelector(".filters");
if (filters) {
    const buttons = [...filters.querySelectorAll("button")];
    const examples = [...document.querySelectorAll(".example")];
    filters.hidden = false;
    filters.addEventListener("click", (event) => {
        const button = event.target.closest("button");
        if (!button) return;
        const tag = button.dataset.filter;
        for (const b of buttons) b.setAttribute("aria-pressed", String(b === button));
        for (const ex of examples) ex.hidden = tag !== "all" && ex.dataset.tag !== tag;
    });
}

// docs.html: highlight the sidebar link for the section in view.
const docsNav = document.querySelector(".docs-nav");
if (docsNav && "IntersectionObserver" in window) {
    const links = new Map();
    for (const a of docsNav.querySelectorAll('a[href^="#"]')) {
        const section = document.getElementById(a.hash.slice(1));
        if (section) links.set(section, a);
    }
    const visible = new Set();
    const observer = new IntersectionObserver((entries) => {
        for (const e of entries) e.isIntersecting ? visible.add(e.target) : visible.delete(e.target);
        // The topmost visible section wins.
        const current = [...links.keys()].find((s) => visible.has(s));
        if (!current) return;
        for (const a of links.values()) a.classList.toggle("is-current", a === links.get(current));
    }, { rootMargin: "0px 0px -60% 0px" });
    for (const section of links.keys()) observer.observe(section);
}

// index.html: the hero console runs a real monitor session in this browser.
// Only the checks that need no user gesture or permission prompt.
const consoleEl = document.querySelector(".console");
if (consoleEl) {
    const [{ monitor }, { rescore }] = await Promise.all([import("./lib/index.js"), import("./lib/server.js")]);
    const rows = [...consoleEl.querySelectorAll("[data-check]")];
    const FLAG = ["multiple", "tampered", "suspicious", "virtual"];
    const OK = ["single", "clean"];
    const tone = (outcome) => FLAG.includes(outcome) ? "outcome-flag" : OK.includes(outcome) ? "outcome-ok" : "outcome-meh";

    const render = (report) => {
        const signals = Object.values(report.signals);
        const strong = signals.filter((s) => s.strength === "strong").length;
        document.getElementById("console-verdict").textContent = report.verdict;
        document.getElementById("console-meta").innerHTML =
            `score ${report.score ?? "–"}<br>${strong} strong signal${strong === 1 ? "" : "s"}`;
        for (const row of rows) {
            const signal = report.signals[row.dataset.check];
            const outcome = !signal ? "–" : signal.supported ? signal.outcome : "unsupported";
            const el = row.querySelector(".outcome");
            el.textContent = outcome;
            el.className = "outcome " + tone(outcome);
        }
        document.getElementById("console-mismatches").textContent = rescore(report).mismatches.length;
    };

    const clock = document.getElementById("console-clock");
    const began = Date.now();
    const pad = (n) => String(n).padStart(2, "0");
    setInterval(() => {
        const s = Math.floor((Date.now() - began) / 1000);
        clock.textContent = `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
    }, 1000);

    const session = monitor.createSession({ checks: rows.map((row) => row.dataset.check) });
    session.on("update", render);
    render(await session.start());
}
