import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
  within,
} from "@testing-library/react";
import PresetManager from "./PresetManager.jsx";
import { fixture } from "./test-fixture.js";
import { readProfile } from "../web/profile.js";
import { presetState, exportPresets } from "./model.js";
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
afterEach(cleanup);
const state = () => presetState(readProfile(fixture()));
it("exports a selected preset and selected group in one batch", () => {
  const onExport = vi.fn();
  render(<PresetManager state={state()} onExport={onExport} />);
  fireEvent.click(screen.getByLabelText("Select Setup 1"));
  fireEvent.click(screen.getByRole("button", { name: /Preset groups/ }));
  fireEvent.click(screen.getByLabelText("Select Sönic"));
  fireEvent.click(screen.getByRole("button", { name: /Export selected/ }));
  expect(onExport).toHaveBeenCalledWith([100], [state().groups[0].id]);
});
it("edits inline membership and name without saving until confirmed", async () => {
  const onChange = vi.fn().mockResolvedValue(true);
  render(<PresetManager state={state()} onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: /Preset groups/ }));
  fireEvent.click(screen.getByRole("button", { name: /^Sönic/ }));
  fireEvent.change(screen.getByLabelText("Group name"), {
    target: { value: "New name" },
  });
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(onChange).toHaveBeenCalledWith(
      {
        mode: "group",
        groupId: state().groups[0].id,
        name: "New name",
        members: [100],
      },
      expect.objectContaining({ baseline: state().groups[0] }),
    ),
  );
});
it("allows read-only details to close while Steam is unavailable", () => {
  render(<PresetManager state={state()} available={false} />);
  fireEvent.click(screen.getByRole("button", { name: /^Setup 1/ }));
  expect(screen.getByRole("button", { name: "Duplicate" }).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Close preset" }));
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("opens the modded view with named variant choices and hides technical IDs", () => {
  const data = state();
  data.appearance = {
    items: {
      characters: {
        "-2147483648": {
          name: "Mephiles",
          label: "Mephiles · Dark outfit",
          source: "mod",
        },
      },
    },
  };
  render(<PresetManager state={data} />);
  fireEvent.click(screen.getByRole("button", { name: /^Mephiles · Setup 1/ }));
  expect(
    screen
      .getByRole("button", { name: "Modded", exact: true })
      .classList.contains("active"),
  ).toBe(true);
  expect(screen.queryByRole("combobox", { name: "Vehicle" })).toBeNull();
  expect(
    screen
      .getByRole("button", { name: "Character", exact: true })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  expect(
    screen.getAllByRole("button", { name: /Mephiles/, pressed: true })[0],
  ).toBeTruthy();
  expect(screen.queryByText("Preset #100")).toBeNull();
});
it("requires dependency acknowledgement and existing-group update confirmation", async () => {
  const onChange = vi.fn().mockResolvedValue(true);
  const data = state();
  const pack = exportPresets(data, [], [data.groups[0].id]);
  render(<PresetManager state={data} onChange={onChange} onError={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Choose preset pack"), {
    target: { files: [{ size: 4000, text: async () => JSON.stringify(pack) }] },
  });
  const dialog = await screen.findByRole("dialog", {
    name: "Review preset import",
  });
  const button = within(dialog).getByRole("button", { name: "Import presets" });
  expect(button.disabled).toBe(true);
  fireEvent.click(within(dialog).getByLabelText(/I will ensure/));
  expect(button.disabled).toBe(true);
  fireEvent.click(within(dialog).getByLabelText(/Update 1 existing/));
  fireEvent.click(button);
  await waitFor(() =>
    expect(onChange).toHaveBeenCalledWith({
      mode: "import",
      pack,
      confirmUpdate: true,
    }),
  );
});

it("removes membership without deleting a preset and keeps group draft while editing its member", async () => {
  const data = state();
  data.presets.push({ ...data.presets[0], id: 200 });
  data.groups[0].members.push(200);
  const onChange = vi.fn().mockResolvedValue(true);
  render(<PresetManager state={data} onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: /Preset groups/ }));
  fireEvent.click(screen.getByRole("button", { name: /^Sönic/ }));
  fireEvent.change(screen.getByLabelText("Group name"), {
    target: { value: "Keep this draft" },
  });
  const group = screen.getByRole("dialog", { name: "Edit preset group" });
  fireEvent.click(within(group).getByRole("button", { name: /^Setup 1/ }));
  expect(
    screen.getByRole("button", { name: "Close preset", exact: true }),
  ).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Close preset", exact: true }),
  );
  expect(screen.getByLabelText("Group name").value).toBe("Keep this draft");
  fireEvent.click(
    screen.getByRole("button", { name: "Remove Setup 1 from group" }),
  );
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.click(within(group).getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(onChange).toHaveBeenCalledWith(
      {
        mode: "group",
        groupId: data.groups[0].id,
        name: "Keep this draft",
        members: [200],
      },
      expect.any(Object),
    ),
  );
  expect(data.presets).toHaveLength(2);
});
it("keeps actions in footer and displays save errors inside the editor without losing edits", async () => {
  const data = state();
  data.appearance = {
    items: {
      vehicles: {
        2: {
          name: "Kart",
          label: "Kart · Red",
          source: "official",
          entity: "Kart",
          skin: "Red",
        },
        5: {
          name: "Kart",
          label: "Kart · Blue",
          source: "official",
          entity: "Kart",
          skin: "Blue",
        },
      },
    },
  };
  const onChange = vi
    .fn()
    .mockRejectedValue(new Error("This preset changed in the game."));
  render(<PresetManager state={data} onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: /^Setup 1/ }));
  fireEvent.click(screen.getByRole("button", { name: "Vehicle", exact: true }));
  fireEvent.change(screen.getByLabelText("Search vehicle"), {
    target: { value: "Blue" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Kart · Blue/ }));
  const save = screen.getByRole("button", {
    name: "Save changes",
    exact: true,
  });
  expect(save.closest("footer")).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Export preset" }).closest("footer"),
  ).toBeTruthy();
  expect(
    screen.queryByRole("checkbox", { name: "Use modded view in the game" }),
  ).toBeNull();
  expect(screen.queryByAltText("Saved in-game setup preview")).toBeNull();
  fireEvent.click(save);
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "This preset changed in the game.",
  );
  expect(save.disabled).toBe(false);
  expect(onChange.mock.calls[0][0].data.iVehicleMaterialID_Modded).toBe(5);
  expect(
    onChange.mock.calls[0][1].baseline.data.iVehicleMaterialID_Modded,
  ).toBe(2);
});

it("keeps a failed preset import visible with an inline error and pinned commands", async () => {
  const data = state(),
    pack = exportPresets(data, [100], []);
  render(
    <PresetManager
      state={data}
      onChange={vi.fn().mockRejectedValue(new Error("Steam save conflict"))}
      onError={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText("Choose preset pack"), {
    target: { files: [{ size: 4000, text: async () => JSON.stringify(pack) }] },
  });
  const dialog = await screen.findByRole("dialog", {
    name: "Review preset import",
  });
  fireEvent.click(within(dialog).getByLabelText(/I will ensure/));
  const button = within(dialog).getByRole("button", { name: "Import presets" });
  expect(button.closest("footer")).toBeTruthy();
  fireEvent.click(button);
  expect(await within(dialog).findByRole("alert")).toHaveProperty(
    "textContent",
    "Steam save conflict",
  );
});

it("reloads a pristine editor after a game-side edit without closing it", async () => {
  const initial = state();
  initial.appearance = {
    items: {
      vehicles: {
        7: { name: "Green kart", label: "Green kart", source: "official" },
      },
    },
  };
  const onChange = vi.fn().mockResolvedValue(true);
  const { rerender } = render(
    <PresetManager state={initial} onChange={onChange} />,
  );
  fireEvent.click(screen.getByRole("button", { name: /^Setup 1/ }));
  const next = structuredClone(initial);
  next.presets[0].data.iVehicleMaterialID_Modded = 7;
  rerender(<PresetManager state={next} onChange={onChange} />);
  await waitFor(() => expect(screen.getByText("No changes")).toBeTruthy());
  expect(
    screen.getByRole("button", { name: /Vehicle Green kart/ }),
  ).toBeTruthy();
  expect(screen.queryByText(/This preset changed in the game/)).toBeNull();
  expect(screen.getByRole("button", { name: "Save changes" }).disabled).toBe(
    true,
  );
});

it("preserves unsaved choices when the game changes the same preset", async () => {
  const initial = state();
  initial.appearance = {
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
  };
  const onChange = vi.fn();
  const { rerender } = render(
    <PresetManager state={initial} onChange={onChange} />,
  );
  fireEvent.click(screen.getByRole("button", { name: /^Setup 1/ }));
  fireEvent.click(screen.getByRole("button", { name: "Vehicle", exact: true }));
  fireEvent.change(screen.getByLabelText("Search vehicle"), {
    target: { value: "Blue" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Kart Blue/ }));
  const next = structuredClone(initial);
  next.presets[0].data.iVehicleMaterialID_Modded = 7;
  rerender(<PresetManager state={next} onChange={onChange} />);
  expect(
    await screen.findByText(/Your unsaved changes are preserved/),
  ).toBeTruthy();
  expect(screen.getByRole("button", { name: "Save changes" }).disabled).toBe(
    true,
  );
  expect(
    screen
      .getByRole("button", { name: /^Kart Blue/ })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Load game version" }));
  await waitFor(() => expect(screen.getByText("No changes")).toBeTruthy());
  expect(onChange).not.toHaveBeenCalled();
});

it("opens Quick Setup without treating it as a saved or grouped preset", () => {
  const data = state();
  data.quickSetup = { id: 338088, data: data.presets[0].data };
  render(<PresetManager state={data} onChange={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Quick Setup" }));
  expect(screen.getByRole("heading", { name: "Quick Setup" })).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Save as new preset" }),
  ).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "Delete", exact: true }),
  ).toBeNull();
});
