import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  act,
} from "@testing-library/react";
import RowPage, { rowSlice } from "./RowPage.jsx";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

it("shows every item with Show all, including after resize and remount", () => {
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
  const all = Array.from({ length: 257 }, (_, i) => i);
  const draw = () => (
    <RowPage items={all} scope="all" label="Wheels">
      {(shown) => <div data-testid="shown">{shown.join(",")}</div>}
    </RowPage>
  );
  const { unmount } = render(draw());
  fireEvent.change(screen.getByLabelText("Wheels rows"), {
    target: { value: "all" },
  });
  expect(screen.getByTestId("shown").textContent.split(",")).toHaveLength(257);
  expect(screen.queryByLabelText("Wheels page")).toBeNull();
  width = 208;
  act(() => resize());
  expect(screen.getByTestId("shown").textContent.split(",")).toHaveLength(257);
  unmount();
  render(draw());
  expect(screen.getByLabelText("Wheels rows").value).toBe("all");
  expect(screen.getByTestId("shown").textContent.split(",")).toHaveLength(257);
});

it("accepts a custom whole row count and keeps partial edits from changing the grid", () => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: 408,
  });
  const all = Array.from({ length: 100 }, (_, i) => i);
  render(
    <RowPage items={all} scope="all" label="Vehicles">
      {(shown) => <div data-testid="shown">{shown.join(",")}</div>}
    </RowPage>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Next Vehicles page" }));
  fireEvent.change(screen.getByLabelText("Vehicles rows"), {
    target: { value: "custom" },
  });
  const input = screen.getByLabelText("Vehicles custom rows");
  fireEvent.change(input, { target: { value: "7" } });
  expect(screen.getByTestId("shown").textContent.split(",")).toHaveLength(28);
  expect(screen.getByLabelText("Vehicles page").value).toBe("1");
  fireEvent.change(input, { target: { value: "" } });
  fireEvent.blur(input);
  expect(input.value).toBe("7");
  for (const value of ["0", "-2", "1.5"]) {
    fireEvent.change(input, { target: { value } });
    expect(screen.getByTestId("shown").textContent.split(",")).toHaveLength(28);
  }
  fireEvent.blur(input);
  expect(input.value).toBe("7");
  expect(localStorage.getItem("bobbys-garage:rows:Vehicles")).toBe("7");
});

it("clamps the stored page when the collection shrinks", () => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: 208,
  });
  const draw = (items) => (
    <RowPage items={items} scope="same-filter" label="Presets">
      {(shown) => <div data-testid="shown">{shown.join(",")}</div>}
    </RowPage>
  );
  const all = Array.from({ length: 40 }, (_, i) => i);
  const { rerender } = render(draw(all));
  fireEvent.change(screen.getByLabelText("Presets page"), {
    target: { value: "5" },
  });
  rerender(draw([1, 2]));
  expect(screen.getByLabelText("Presets page").value).toBe("1");
  rerender(draw(all));
  expect(screen.getByLabelText("Presets page").value).toBe("1");
});

it("handles empty and all-row slices without an infinite or empty page size", () => {
  expect(rowSlice(0, 7, "all", 4)).toEqual({
    size: 1,
    pages: 1,
    page: 1,
    start: 0,
  });
  expect(rowSlice(1500, 7, "all", 4)).toEqual({
    size: 1500,
    pages: 1,
    page: 1,
    start: 0,
  });
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
