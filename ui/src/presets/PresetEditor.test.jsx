import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import PresetEditor from "./PresetEditor.jsx";
import { fixture } from "./test-fixture.js";
import { readProfile } from "../web/profile.js";
import { presetState } from "./model.js";

vi.mock("./LivePresetPreview.jsx", () => ({
  default: () => <div data-testid="preview">Preview</div>,
}));
beforeEach(() => {
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
function props() {
  const state = presetState(readProfile(fixture()));
  return {
    preset: state.presets[0],
    presets: state.presets,
    onClose: vi.fn(),
    onSave: vi.fn().mockResolvedValue(true),
    appearance: {
      items: {
        vehicles: {
          2: {
            name: "Kart",
            label: "Kart Red",
            entity: "Kart",
            skin: "Red",
            source: "official",
          },
          5: {
            name: "Kart",
            label: "Kart Blue",
            entity: "Kart",
            skin: "Blue",
            source: "official",
          },
        },
      },
    },
  };
}
it("opens preview on roomy screens and leaves it collapsed on a small screen", () => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query) => ({
      matches: query.includes("min-width: 1200px"),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  const first = render(<PresetEditor {...props()} loadModel={vi.fn()} />);
  expect(screen.getByTestId("preview")).toBeTruthy();
  first.unmount();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false })),
  );
  render(<PresetEditor {...props()} loadModel={vi.fn()} />);
  expect(screen.queryByTestId("preview")).toBeNull();
  expect(screen.getByRole("button", { name: "Show 3D preview" })).toBeTruthy();
});
it("saves ordinary presets without closing or restoring the old baseline", async () => {
  const value = props();
  render(<PresetEditor {...value} />);
  fireEvent.click(screen.getByRole("button", { name: "Vehicle", exact: true }));
  fireEvent.change(screen.getByLabelText("Search vehicle"), {
    target: { value: "Blue" },
  });
  fireEvent.click(screen.getByRole("button", { name: /^Kart Blue/ }));
  const save = screen.getByRole("button", { name: "Save changes" });
  expect(save.hasAttribute("data-save-action")).toBe(true);
  fireEvent.click(save);
  await waitFor(() => expect(screen.getByText("Saved")).toBeTruthy());
  expect(value.onClose).not.toHaveBeenCalled();
  expect(save.disabled).toBe(true);
  expect(value.onSave.mock.calls[0][0].iVehicleMaterialID_Modded).toBe(5);
});
it("allows Quick Setup changes with the game closed", async () => {
  const value = props();
  render(<PresetEditor {...value} quick gameRunning={false} />);
  fireEvent.click(screen.getByRole("button", { name: "Vehicle", exact: true }));
  fireEvent.change(screen.getByLabelText("Search vehicle"), {
    target: { value: "Blue" },
  });
  fireEvent.click(screen.getByRole("button", { name: /^Kart Blue/ }));
  const save = screen.getByRole("button", { name: "Save changes" });
  expect(save.disabled).toBe(false);
  fireEvent.click(save);
  await waitFor(() => expect(value.onSave).toHaveBeenCalled());
  expect(value.onClose).not.toHaveBeenCalled();
});
