import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import Dialog from "./Dialog.jsx";
import ImportDialog from "./ImportDialog.jsx";

beforeEach(() => {
  vi.stubGlobal("PointerEvent", MouseEvent);
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function bounds() {
  const dialog = screen.getByRole("dialog");
  vi.spyOn(dialog, "getBoundingClientRect").mockReturnValue({
    left: 100,
    right: 400,
    top: 100,
    bottom: 500,
  });
  return dialog;
}
function clickAt(target, x, y) {
  fireEvent.pointerDown(target, { button: 0, clientX: x, clientY: y });
  fireEvent.click(target, { clientX: x, clientY: y });
}

test("backdrop click dismisses while content and dialog padding do not", () => {
  const close = vi.fn();
  render(
    <Dialog onClose={close}>
      <button>Inside</button>
    </Dialog>,
  );
  const dialog = bounds();
  clickAt(screen.getByRole("button"), 200, 200);
  clickAt(dialog, 150, 150);
  expect(close).not.toHaveBeenCalled();
  clickAt(dialog, 50, 200);
  expect(close).toHaveBeenCalledTimes(1);
});

test("dragging out, pointer cancellation and secondary clicks do not dismiss", () => {
  const close = vi.fn();
  render(
    <Dialog onClose={close}>
      <button>Inside</button>
    </Dialog>,
  );
  const dialog = bounds();
  fireEvent.pointerDown(screen.getByRole("button"), {
    button: 0,
    clientX: 200,
    clientY: 200,
  });
  fireEvent.click(dialog, { clientX: 50, clientY: 200 });
  fireEvent.pointerDown(dialog, { button: 0, clientX: 50, clientY: 200 });
  fireEvent.pointerCancel(dialog);
  fireEvent.click(dialog, { clientX: 50, clientY: 200 });
  fireEvent.pointerDown(dialog, { button: 2, clientX: 50, clientY: 200 });
  fireEvent.click(dialog, { clientX: 50, clientY: 200 });
  expect(close).not.toHaveBeenCalled();
});

test("Escape uses the same close guard as backdrop dismissal", () => {
  const close = vi.fn();
  const { rerender } = render(
    <Dialog onClose={close} dismissDisabled>
      Working
    </Dialog>,
  );
  const dialog = bounds();
  clickAt(dialog, 50, 200);
  fireEvent(dialog, new Event("cancel", { cancelable: true }));
  expect(close).not.toHaveBeenCalled();
  rerender(<Dialog onClose={close}>Ready</Dialog>);
  fireEvent(dialog, new Event("cancel", { cancelable: true }));
  expect(close).toHaveBeenCalledTimes(1);
});

test("desktop import cannot be dismissed during an active transaction", () => {
  const back = vi.fn();
  const props = {
    preview: {
      destinationName: "Test",
      group: { name: "Test", tracks: [] },
      missingSubscriptions: [],
      pendingDownloads: [],
      trackStatus: {},
    },
    onBack: back,
  };
  const { rerender } = render(
    <ImportDialog
      {...props}
      confirmed
      job={{ state: "running", phase: "saving", message: "Saving" }}
    />,
  );
  const dialog = bounds();
  clickAt(dialog, 50, 200);
  expect(back).not.toHaveBeenCalled();
  rerender(<ImportDialog {...props} />);
  clickAt(dialog, 50, 200);
  expect(back).toHaveBeenCalledTimes(1);
});
