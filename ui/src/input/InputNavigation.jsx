import { useEffect, useState } from "react";
import {
  activateControllerTarget,
  cancelDialog,
  changeRowPage,
  controllerDirection,
  moveFocus,
  navigationScope,
  saveEditor,
} from "./navigation.js";
import "./input-navigation.css";

// Mount once per app. No game input is sent; the browser Gamepad API only reads
// a standard controller while this Garage window is visible and focused.
export default function InputNavigation() {
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    function keyboard(event) {
      if (event.defaultPrevented || event.altKey) return;
      delete document.documentElement.dataset.inputNavigation;
      const target = event.target;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        const scope = navigationScope();
        if (scope.tagName !== "DIALOG") return;
        const save = scope.querySelector("[data-save-action]");
        if (!save) return;
        event.preventDefault();
        if (!event.repeat) saveEditor();
        return;
      }
      if (
        event.ctrlKey ||
        event.metaKey ||
        target.closest?.(
          'input, select, textarea, [contenteditable="true"], [role="slider"]',
        )
      )
        return;
      if (
        (event.key === "PageUp" || event.key === "PageDown") &&
        target.closest?.(
          ".appearance-grid, [data-navigation-grid], .preset-order",
        )
      ) {
        if (changeRowPage(event.key === "PageUp" ? -1 : 1))
          event.preventDefault();
        return;
      }
      const direction = {
        ArrowLeft: "left",
        ArrowRight: "right",
        ArrowUp: "up",
        ArrowDown: "down",
      }[event.key];
      if (direction && moveFocus(direction)) event.preventDefault();
    }
    let priorDirection,
      repeatAt = 0,
      priorA = false,
      priorB = false,
      priorLeftPage = false,
      priorRightPage = false,
      priorSave = false;
    function poll() {
      let pad;
      try {
        pad = [...(navigator.getGamepads?.() || [])].find(
          (p) => p?.connected && p.mapping === "standard",
        );
      } catch {
        /* Unsupported webview. */
      }
      setConnected(Boolean(pad));
      document.documentElement.dataset.controllerConnected = String(
        Boolean(pad),
      );
      if (!pad) {
        priorDirection = null;
        priorA = priorB = priorLeftPage = priorRightPage = priorSave = false;
        return;
      }
      const a = Boolean(pad.buttons[0]?.pressed),
        b = Boolean(pad.buttons[1]?.pressed),
        leftPage = Boolean(pad.buttons[4]?.pressed),
        rightPage = Boolean(pad.buttons[5]?.pressed),
        save = Boolean(pad.buttons[9]?.pressed);
      const direction = controllerDirection(pad),
        now = performance.now();
      if (document.visibilityState === "visible" && document.hasFocus()) {
        const editing = document.activeElement?.matches(
          'input, select, textarea, [contenteditable="true"]',
        );
        if (!editing && (direction || a || b || leftPage || rightPage || save))
          document.documentElement.dataset.inputNavigation = "controller";
        if (
          !editing &&
          direction &&
          (direction !== priorDirection || now >= repeatAt)
        ) {
          moveFocus(direction, { controller: true });
          repeatAt = now + (direction === priorDirection ? 140 : 360);
        }
        if (!editing && a && !priorA) activateControllerTarget();
        if (b && !priorB) cancelDialog();
        if (!editing && leftPage && !priorLeftPage && !rightPage)
          changeRowPage(-1);
        if (!editing && rightPage && !priorRightPage && !leftPage)
          changeRowPage(1);
        if (!editing && save && !priorSave) saveEditor();
      }
      priorA = a;
      priorB = b;
      priorLeftPage = leftPage;
      priorRightPage = rightPage;
      priorSave = save;
      priorDirection = direction;
    }
    function pointer() {
      delete document.documentElement.dataset.inputNavigation;
    }
    document.addEventListener("keydown", keyboard);
    document.addEventListener("pointerdown", pointer);
    poll();
    const timer = window.setInterval(poll, 80);
    return () => {
      document.removeEventListener("keydown", keyboard);
      document.removeEventListener("pointerdown", pointer);
      window.clearInterval(timer);
      delete document.documentElement.dataset.inputNavigation;
      delete document.documentElement.dataset.controllerConnected;
    };
  }, []);
  return (
    <details className="input-navigation-help">
      <summary aria-label="Keyboard and controller help">
        {connected ? "Controller connected" : "Controls"}
      </summary>
      <div>
        <p>
          <kbd>Tab</kbd> move between controls · <kbd>←</kbd>
          <kbd>↑</kbd>
          <kbd>↓</kbd>
          <kbd>→</kbd> browse choices
        </p>
        <p>
          <kbd>Enter</kbd> choose · <kbd>Esc</kbd> back · <kbd>Ctrl</kbd> +{" "}
          <kbd>S</kbd> save editor · <kbd>Page ↑</kbd> / <kbd>Page ↓</kbd>{" "}
          change page
        </p>
        <p>
          {connected
            ? "Controller: D-pad / left stick to move, A to choose, B to go back, LB / RB to change page. Menu / Start saves editor changes."
            : "A standard controller is optional. Press one of its buttons with Garage focused to connect."}
        </p>
      </div>
    </details>
  );
}
