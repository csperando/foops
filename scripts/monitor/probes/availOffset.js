// ---------- 4. availLeft/availTop ----------
export function readAvailOffset() {
    return { left: screen.availLeft ?? null, top: screen.availTop ?? null };
}
