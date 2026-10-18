import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import LobbyEditor from "./LobbyEditor.jsx";
import PresetEditor from "../presets/PresetEditor.jsx";
import { fixture } from "../presets/test-fixture.js";
import { readProfile } from "../web/profile.js";
import { presetState } from "../presets/model.js";

vi.mock("../presets/LivePresetPreview.jsx", () => ({
  default: () => <div>3D preview</div>,
}));
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
afterEach(() => cleanup());

function example() {
  const state = presetState(readProfile(fixture()));
  state.presets = [
    state.presets[0],
    {
      id: 5151,
      data: { ...state.presets[0].data, iVehicleMaterialID_Modded: 99 },
    },
  ];
  return {
    state,
    player: {
      ai: true,
      canEditCpu: true,
      id: 9191,
      name: "CPU One",
      data: structuredClone(state.presets[0].data),
    },
  };
}

it("chooses cosmetics into a CPU draft and applies to the original CPU identity only", async () => {
  const { state, player } = example();
  const save = vi.fn().mockResolvedValue(true),
    close = vi.fn();
  render(
    <LobbyEditor player={player} state={state} onSave={save} onClose={close} />,
  );
  expect(
    screen.getByRole("heading", { name: "CPU One · CPU setup" }),
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Export preset" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Duplicate" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Choose saved preset" }));
  fireEvent.click(screen.getByRole("button", { name: "Use Setup 2" }));
  expect(save).not.toHaveBeenCalled();
  expect(
    screen.queryByRole("dialog", { name: "Choose saved preset" }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Apply to CPU" }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(save.mock.calls[0][0].iVehicleMaterialID_Modded).toBe(99);
  expect(save.mock.calls[0][1]).toEqual({ id: 9191, data: player.data });
  expect(player.data.iVehicleMaterialID_Modded).not.toBe(99);
  expect(close).not.toHaveBeenCalled();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Apply to CPU" }).disabled).toBe(
      true,
    ),
  );
  expect(screen.queryByText(/This preset changed in the game/)).toBeNull();
});

it("does not enable CPU application without an authoritative edit capability", () => {
  const { state, player } = example();
  render(
    <LobbyEditor
      player={{ ...player, canEditCpu: false }}
      state={state}
      onSave={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Choose saved preset" }));
  fireEvent.click(screen.getByRole("button", { name: "Use Setup 2" }));
  expect(screen.getByRole("button", { name: "Apply to CPU" }).disabled).toBe(
    true,
  );
});

it("also offers saved presets in local Quick Setup and preserves its target baseline", async () => {
  const { state, player } = example();
  const save = vi.fn().mockResolvedValue(true);
  render(
    <PresetEditor
      preset={{ id: player.id, data: player.data }}
      presets={state.presets}
      quick
      onSave={save}
      onClose={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Choose saved preset" }));
  fireEvent.change(
    screen.getByRole("searchbox", { name: "Find saved preset" }),
    { target: { value: "Setup 2" } },
  );
  expect(screen.queryByRole("button", { name: "Use Setup 1" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Use Setup 2" }));
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(save.mock.calls[0][1]).toEqual({ id: player.id, data: player.data });
  expect(save.mock.calls[0][0].iVehicleMaterialID_Modded).toBe(99);
});
