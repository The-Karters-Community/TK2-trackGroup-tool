import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import InputNavigation from "./InputNavigation.jsx";
import {
  activateControllerTarget,
  cancelDialog,
  changeRowPage,
  controllerDirection,
  directionalTarget,
  moveFocus,
  navigationScope,
} from "./navigation.js";

function rectangle(left, top, width = 80, height = 80) {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  };
}
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    rectangle(0, 0),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("spatial navigation", () => {
  it("follows responsive visual rows and stops at the grid boundary", () => {
    render(
      <div className="appearance-grid">
        {["A", "B", "C", "D"].map((name) => (
          <button key={name} className="appearance-tile">
            {name}
          </button>
        ))}
      </div>,
    );
    const buttons = screen.getAllByRole("button");
    buttons.forEach((button, index) =>
      Object.defineProperty(button, "getBoundingClientRect", {
        value: () => rectangle((index % 2) * 100, Math.floor(index / 2) * 100),
      }),
    );
    buttons[0].focus();
    expect(moveFocus("right")).toBe(true);
    expect(document.activeElement).toBe(buttons[1]);
    moveFocus("down");
    expect(document.activeElement).toBe(buttons[3]);
    expect(moveFocus("right")).toBe(true);
    expect(document.activeElement).toBe(buttons[3]);
    moveFocus("left");
    expect(document.activeElement).toBe(buttons[2]);
  });
  it("stays inside the top dialog and skips disabled or hidden choices", () => {
    render(
      <>
        <button data-controller-activate="true">Outside</button>
        <dialog open>
          <button className="appearance-tile">Lower dialog</button>
        </dialog>
        <dialog open>
          <div className="appearance-grid">
            <button className="appearance-tile">First</button>
            <button className="appearance-tile" disabled>
              Disabled
            </button>
            <button className="appearance-tile" hidden>
              Hidden
            </button>
            <button className="appearance-tile">Last</button>
          </div>
        </dialog>
      </>,
    );
    const first = screen.getByRole("button", { name: "First" }),
      last = screen.getByRole("button", { name: "Last" });
    Object.defineProperty(last, "getBoundingClientRect", {
      value: () => rectangle(300, 0),
    });
    expect(navigationScope()).toBe(last.closest("dialog"));
    first.focus();
    moveFocus("right");
    expect(document.activeElement).toBe(last);
    screen.getByRole("button", { name: "Outside" }).focus();
    moveFocus("down", { controller: true });
    expect(document.activeElement).toBe(first);
  });
  it("prefers the same column over a nearer diagonal", () => {
    const element = (rect) => ({ getBoundingClientRect: () => rect });
    const current = element(rectangle(100, 100)),
      diagonal = element(rectangle(0, 190)),
      aligned = element(rectangle(100, 210));
    expect(directionalTarget(current, [diagonal, aligned], "down")).toBe(
      aligned,
    );
  });
});

describe("keyboard and controller actions", () => {
  it("pages the current row collection without touching collections outside its dialog", async () => {
    const outside = vi.fn(),
      previous = vi.fn(),
      next = vi.fn();
    render(
      <>
        <nav className="row-pagination">
          <button aria-label="Next other page" onClick={outside}>
            Next
          </button>
        </nav>
        <dialog open>
          <div className="row-page">
            <nav className="row-pagination">
              <button aria-label="Previous Characters page" onClick={previous}>
                Previous
              </button>
              <button aria-label="Next Characters page" onClick={next}>
                Next
              </button>
            </nav>
            <div className="appearance-grid">
              <button className="appearance-tile">Choice</button>
            </div>
          </div>
        </dialog>
      </>,
    );
    screen.getByRole("button", { name: "Choice" }).focus();
    expect(changeRowPage(1)).toBe(true);
    expect(next).toHaveBeenCalledTimes(1);
    expect(outside).not.toHaveBeenCalled();
    expect(changeRowPage(-1)).toBe(true);
    expect(previous).toHaveBeenCalledTimes(1);
    screen.getByRole("button", { name: "Next Characters page" }).disabled =
      true;
    expect(changeRowPage(1)).toBe(false);
    await act(async () => {});
  });
  it("accepts PageUp/PageDown from choices while leaving text editing alone", async () => {
    const next = vi.fn();
    render(
      <>
        <InputNavigation />
        <div className="row-page">
          <nav className="row-pagination">
            <button aria-label="Next Characters page" onClick={next}>
              Next
            </button>
          </nav>
          <div className="appearance-grid">
            <input aria-label="Find" />
            <button className="appearance-tile">Choice</button>
          </div>
        </div>
      </>,
    );
    const choice = screen.getByRole("button", { name: "Choice" });
    choice.focus();
    fireEvent.keyDown(choice, { key: "PageDown" });
    expect(next).toHaveBeenCalledTimes(1);
    const field = screen.getByRole("textbox");
    field.focus();
    fireEvent.keyDown(field, { key: "PageDown" });
    expect(next).toHaveBeenCalledTimes(1);
    await act(async () => {});
  });
  it("uses LB/RB and Menu on button edges, and ignores busy saves, background holds, and text edits", () => {
    vi.useFakeTimers();
    const previous = vi.fn(),
      next = vi.fn(),
      save = vi.fn();
    const pad = {
      connected: true,
      mapping: "standard",
      axes: [0, 0],
      buttons: Array.from({ length: 16 }, () => ({ pressed: false })),
    };
    vi.stubGlobal(
      "navigator",
      Object.assign(Object.create(navigator), { getGamepads: () => [pad] }),
    );
    const windowFocus = vi.spyOn(document, "hasFocus").mockReturnValue(true);
    render(
      <>
        <InputNavigation />
        <dialog open>
          <div className="row-page">
            <nav className="row-pagination">
              <button aria-label="Previous Characters page" onClick={previous}>
                Previous
              </button>
              <button aria-label="Next Characters page" onClick={next}>
                Next
              </button>
            </nav>
            <div className="appearance-grid">
              <button className="appearance-tile">Choice</button>
            </div>
          </div>
          <input aria-label="Find" />
          <button data-save-action onClick={save}>
            Save
          </button>
        </dialog>
      </>,
    );
    const choice = screen.getByRole("button", { name: "Choice" }),
      saveButton = screen.getByRole("button", { name: "Save" });
    choice.focus();
    const tick = () => act(() => vi.advanceTimersByTime(80));
    pad.buttons[5].pressed = true;
    tick();
    tick();
    expect(next).toHaveBeenCalledTimes(1);
    pad.buttons[5].pressed = false;
    tick();
    pad.buttons[4].pressed = true;
    tick();
    expect(previous).toHaveBeenCalledTimes(1);
    pad.buttons[4].pressed = false;
    tick();
    pad.buttons[9].pressed = true;
    tick();
    tick();
    expect(save).toHaveBeenCalledTimes(1);
    pad.buttons[9].pressed = false;
    tick();
    saveButton.disabled = true;
    pad.buttons[9].pressed = true;
    tick();
    expect(save).toHaveBeenCalledTimes(1);
    pad.buttons[9].pressed = false;
    tick();
    saveButton.disabled = false;
    windowFocus.mockReturnValue(false);
    pad.buttons[9].pressed = true;
    tick();
    windowFocus.mockReturnValue(true);
    tick();
    expect(save).toHaveBeenCalledTimes(1);
    pad.buttons[9].pressed = false;
    tick();
    screen.getByRole("textbox").focus();
    pad.buttons[9].pressed = true;
    tick();
    expect(save).toHaveBeenCalledTimes(1);
    pad.buttons[9].pressed = false;
    tick();
    choice.focus();
    pad.buttons[9].pressed = true;
    tick();
    expect(save).toHaveBeenCalledTimes(2);
  });
  it("moves keyboard focus through grid choices without replacing native activation", () => {
    render(
      <>
        <InputNavigation />
        <div className="appearance-grid">
          <button className="appearance-tile">First</button>
          <button className="appearance-tile">Second</button>
        </div>
      </>,
    );
    const first = screen.getByRole("button", { name: "First" }),
      second = screen.getByRole("button", { name: "Second" });
    Object.defineProperty(second, "getBoundingClientRect", {
      value: () => rectangle(100, 0),
    });
    first.focus();
    const arrow = new KeyboardEvent("keydown", {
      key: "ArrowRight",
      bubbles: true,
      cancelable: true,
    });
    first.dispatchEvent(arrow);
    expect(arrow.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(second);
    const enter = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });
    second.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(false);
  });
  it("does not hijack input arrows; Ctrl+S uses the enabled marked save action", () => {
    const save = vi.fn();
    render(
      <>
        <InputNavigation />
        <dialog open>
          <div className="appearance-grid">
            <input aria-label="Search" />
            <button className="appearance-tile">Choice</button>
          </div>
          <button data-save-action onClick={save}>
            Save
          </button>
        </dialog>
      </>,
    );
    const search = screen.getByRole("textbox");
    search.focus();
    const event = new KeyboardEvent("keydown", {
      key: "ArrowRight",
      bubbles: true,
      cancelable: true,
    });
    search.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(search);
    fireEvent.keyDown(search, { key: "s", ctrlKey: true });
    expect(save).toHaveBeenCalledTimes(1);
    screen.getByRole("button", { name: "Save" }).disabled = true;
    fireEvent.keyDown(search, { key: "s", ctrlKey: true });
    expect(save).toHaveBeenCalledTimes(1);
  });
  it("activates choices without allowing controller saves and respects the dialog cancel guard", () => {
    const choose = vi.fn(),
      save = vi.fn(),
      cancel = vi.fn((event) => event.preventDefault());
    render(
      <dialog open onCancel={cancel}>
        <button className="appearance-tile" onClick={choose}>
          Choice
        </button>
        <button data-save-action onClick={save}>
          Save
        </button>
      </dialog>,
    );
    screen.getByRole("button", { name: "Choice" }).focus();
    expect(activateControllerTarget()).toBe(true);
    expect(choose).toHaveBeenCalledTimes(1);
    screen.getByRole("button", { name: "Save" }).focus();
    expect(activateControllerTarget()).toBe(false);
    expect(save).not.toHaveBeenCalled();
    expect(cancelDialog()).toBe(true);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog").open).toBe(true);
  });
  it("uses a stick deadzone and standard D-pad directions", () => {
    const pad = { axes: [0.3, -0.2], buttons: [] };
    expect(controllerDirection(pad)).toBeNull();
    pad.axes = [0.8, -0.2];
    expect(controllerDirection(pad)).toBe("right");
    pad.buttons[12] = { pressed: true };
    expect(controllerDirection(pad)).toBe("up");
  });
  it("only consumes controller button edges in the focused window and cleans up polling", () => {
    vi.useFakeTimers();
    const choose = vi.fn(),
      pad = {
        connected: true,
        mapping: "standard",
        axes: [0, 0],
        buttons: [{ pressed: false }, { pressed: false }],
      };
    vi.stubGlobal(
      "navigator",
      Object.assign(Object.create(navigator), { getGamepads: () => [pad] }),
    );
    const focus = vi.spyOn(document, "hasFocus").mockReturnValue(true);
    const { unmount } = render(
      <>
        <InputNavigation />
        <button className="appearance-tile" onClick={choose}>
          Choice
        </button>
      </>,
    );
    screen.getByRole("button", { name: "Choice" }).focus();
    pad.buttons[0].pressed = true;
    act(() => vi.advanceTimersByTime(480));
    expect(choose).toHaveBeenCalledTimes(1);
    pad.buttons[0].pressed = false;
    act(() => vi.advanceTimersByTime(80));
    focus.mockReturnValue(false);
    pad.buttons[0].pressed = true;
    act(() => vi.advanceTimersByTime(80));
    focus.mockReturnValue(true);
    act(() => vi.advanceTimersByTime(80));
    expect(choose).toHaveBeenCalledTimes(1);
    pad.buttons[0].pressed = false;
    act(() => vi.advanceTimersByTime(80));
    pad.buttons[0].pressed = true;
    act(() => vi.advanceTimersByTime(80));
    expect(choose).toHaveBeenCalledTimes(2);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
