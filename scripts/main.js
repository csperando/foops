import { $ } from "./ui/dom.js";
import { renderSignals, renderPending } from "./ui/cards.js";
import { createSession } from "./monitor/session.js";

// monitor.html: one session for the page's lifetime, every card fed from it.
const session = createSession();
session.on("update", (report, ids) => renderSignals(report.signals, ids));
session.on("pending", renderPending);

$("btn-details").addEventListener("click", async () => {
    const btn = $("btn-details");
    btn.disabled = true;
    try {
        await session.screenDetails();
    } finally {
        btn.disabled = false;
    }
});

session.start();
