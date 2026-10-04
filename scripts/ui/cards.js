import { $, setBadge } from "./dom.js";
import { renderHero } from "./hero.js";
import { renderRawDiagnostics } from "./raw.js";
import {
    renderView,
    presentIsExtended,
    presentScreenDetails,
    presentPermission,
    presentAvailOffset,
    presentWindowPosition,
    presentIntegrity,
    presentRefreshRate,
    presentVirtualization,
    presentEmbedding
} from "./present.js";

// ---------- monitor.html cards ----------
// Which card each signal feeds. Some cards show several signals.
const CARDS = {
    isExtended: (s) => {
        renderHero(s.isExtended);
        renderView("badge-isExtended", "out-isExtended", presentIsExtended(s.isExtended));
        renderRawDiagnostics();
    },
    screenDetails: (s) => renderView("badge-details", "out-details", presentScreenDetails({
        details: s.screenDetails,
        labels: s.screenLabels,
        labelIntegrity: s.screenLabelIntegrity
    })),
    permission: (s) => renderView("badge-perm", "out-perm", presentPermission(s.permission)),
    availOffset: (s) => renderView("badge-avail", "out-avail", presentAvailOffset(s.availOffset)),
    windowPosition: (s) => renderView("badge-drag", "out-drag", presentWindowPosition(s.windowPosition)),
    integrity: (s) => renderView("badge-integrity", "out-integrity", presentIntegrity({
        integrity: s.isExtendedIntegrity,
        consistency: s.isExtendedConsistency
    })),
    refreshRate: (s) => renderView("badge-refresh", "out-refresh", presentRefreshRate(s.refreshRate)),
    virtualization: (s) => renderView("badge-vm", "out-vm", presentVirtualization(s.virtualization)),
    embedding: (s) => renderView("badge-embedding", "out-embedding", presentEmbedding(s.embedding))
};

// Signals that share a card, and the signals each card needs before it renders.
const CARD_FOR = {
    screenLabels: "screenDetails",
    screenLabelIntegrity: "screenDetails",
    isExtendedIntegrity: "integrity",
    isExtendedConsistency: "integrity"
};
const NEEDS = {
    integrity: ["isExtendedIntegrity", "isExtendedConsistency"]
};

export function renderSignals(signals, ids) {
    const cards = new Set(ids.map((id) => CARD_FOR[id] || id));
    for (const card of cards) {
        if ((NEEDS[card] || [card]).every((id) => signals[id])) CARDS[card](signals);
    }
}

// ---------- Async checks in flight ----------
export function renderPending(id) {
    if (id === "refreshRate") setBadge($("badge-refresh"), "unknown", "measuring");
}
