// ---------- 5. Window position vs. primary screen bounds ----------
export function readWindowPosition() {
    return {
        screenX: window.screenX,
        screenY: window.screenY,
        outerWidth: window.outerWidth,
        outerHeight: window.outerHeight,
        screenWidth: screen.width,
        screenHeight: screen.height
    };
}
