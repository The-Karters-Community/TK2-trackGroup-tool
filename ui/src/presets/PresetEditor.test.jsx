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
  default: ({ modelId, modelAvailable }) => (
    <div
      data-testid="preview"
      data-model-id={modelId}
      data-available={String(modelAvailable)}
    >
      Preview
    </div>
  ),
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

it("keeps Original selected-part previews available when no mod is selected", () => {
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  }));
  const options = props();
  options.preset.data.iCharacterSkinMaterialID = 501;
  options.preset.data.iCharacterSkinMaterialID_Modded = -1;
  options.preset.data.bUsingModdedVersion = true;
  options.appearance.items.characters = {
    501: { name: "Bobby", label: "Official Bobby" },
  };
  options.appearance.models = { characters: [501] };
  render(<PresetEditor {...options} />);
  expect(screen.getByTestId("preview").getAttribute("data-model-id")).toBe(
    "501",
  );
  expect(screen.getByTestId("preview").getAttribute("data-available")).toBe(
    "true",
  );
  expect(
    screen.getByText(/This part uses its Original appearance/),
  ).toBeTruthy();
});

it("reports an installed unsupported mod instead of silently replacing its part preview", () => {
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  }));
  const options = props();
  options.preset.data.iCharacterSkinMaterialID = 501;
  options.preset.data.iCharacterSkinMaterialID_Modded = 42;
  options.appearance.items.characters = {
    501: { label: "Official Bobby" },
    42: { label: "Installed mod" },
  };
  options.appearance.models = { characters: [501] };
  render(<PresetEditor {...options} />);
  expect(screen.getByTestId("preview").getAttribute("data-model-id")).toBe(
    "42",
  );
  expect(screen.getByTestId("preview").getAttribute("data-available")).toBe(
    "false",
  );
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
it("opens preview at medium window sizes and leaves it collapsed on a small screen", () => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query) => ({
      matches: query.includes("min-width: 900px"),
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
