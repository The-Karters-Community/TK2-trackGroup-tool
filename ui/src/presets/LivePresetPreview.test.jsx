import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import LivePresetPreview from "./LivePresetPreview.jsx";

const png = btoa("test PNG");
beforeEach(() => {
  vi.useFakeTimers();
  let sequence = 0;
  URL.createObjectURL = vi.fn(() => `blob:game${++sequence}`);
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
const settle = (ms = 300) => act(() => vi.advanceTimersByTimeAsync(ms));

it("debounces choices and rotation, renders without saving, and revokes images", async () => {
  const renderPreview = vi.fn().mockResolvedValue({ ready: true, png });
  const props = { data: { vehicle: 1 }, view: "modded", renderPreview };
  const { rerender, unmount } = render(<LivePresetPreview {...props} />);
  rerender(<LivePresetPreview {...props} data={{ vehicle: 2 }} />);
  await settle();
  expect(renderPreview).toHaveBeenCalledTimes(1);
  expect(renderPreview.mock.calls[0][0]).toEqual({
    data: { vehicle: 2 },
    view: "modded",
    rotation: 0,
  });
  expect(
    screen.getByAltText("Current selection rendered by the game").src,
  ).toBe("blob:game1");
  fireEvent.change(screen.getByLabelText("Rotate preview"), {
    target: { value: "60" },
  });
  await settle();
  expect(renderPreview.mock.calls[1][0].rotation).toBe(60);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:game1");
  unmount();
  expect(renderPreview.mock.calls[1][1].aborted).toBe(true);
});

it("ignores an old native response after a newer selection", async () => {
  let complete;
  const renderPreview = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((r) => {
          complete = r;
        }),
    )
    .mockResolvedValue({ ready: true, png });
  const { rerender } = render(
    <LivePresetPreview
      data={{ vehicle: 1 }}
      view="modded"
      renderPreview={renderPreview}
    />,
  );
  await settle();
  rerender(
    <LivePresetPreview
      data={{ vehicle: 2 }}
      view="original"
      renderPreview={renderPreview}
    />,
  );
  await settle();
  await act(async () => complete({ ready: true, png }));
  expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  expect(renderPreview.mock.calls[1][0].view).toBe("original");
});

it("retries unavailable engine, cancels on close, and labels stale saved images", async () => {
  const renderPreview = vi
    .fn()
    .mockResolvedValue({ ready: false, message: "Open the main menu." });
  const { unmount } = render(
    <LivePresetPreview
      data={{}}
      view="modded"
      changed
      renderPreview={renderPreview}
    />,
  );
  await settle();
  expect(screen.getByText("Open the main menu.")).toBeTruthy();
  expect(
    screen.getByText(/Saved image · your current selections differ/),
  ).toBeTruthy();
  await settle(3000);
  expect(renderPreview).toHaveBeenCalledTimes(2);
  unmount();
  await settle(3000);
  expect(renderPreview).toHaveBeenCalledTimes(2);
});
