import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  act,
} from "@testing-library/react";
import RowPage from "./RowPage.jsx";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("fills whole rows and repaginates on resize and filtering", () => {
  let width = 720,
    resize;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () => ({ width }),
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback) {
        resize = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  const draw = (items, scope) => (
    <RowPage items={items} scope={scope} label="Characters">
      {(shown) => <div data-testid="shown">{shown.join(",")}</div>}
    </RowPage>
  );
  const all = Array.from({ length: 1000 }, (_, i) => i);
  const { rerender } = render(draw(all, "all"));
  expect(screen.getByTestId("shown").textContent.split(",")).toHaveLength(21);
  fireEvent.click(screen.getByRole("button", { name: "Next Characters page" }));
  expect(screen.getByTestId("shown").textContent.startsWith("21,")).toBe(true);
  width = 408;
  act(() => resize());
  expect(screen.getByTestId("shown").textContent.split(",")).toHaveLength(12);
  fireEvent.change(screen.getByLabelText("Characters rows"), {
    target: { value: "4" },
  });
  expect(screen.getByTestId("shown").textContent.split(",")).toHaveLength(16);
  expect(screen.getByLabelText("Characters page").value).toBe("1");
  rerender(draw([999], "filtered"));
  expect(screen.getByTestId("shown").textContent).toBe("999");
  expect(
    screen.getByRole("button", { name: "Next Characters page" }).disabled,
  ).toBe(true);
});
