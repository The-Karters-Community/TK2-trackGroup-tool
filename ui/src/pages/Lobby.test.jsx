import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  within,
} from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import Lobby from "./Lobby.jsx";

afterEach(cleanup);
const modelLifecycle = vi.hoisted(() => ({ mounts: 0, unmounts: 0 }));
vi.mock("../presets/setupSnapshots.js", () => ({
  createSetupSnapshots: () => ({
    get: async () => "data:image/png;base64,fixture",
    dispose: vi.fn(),
  }),
}));
vi.mock("../presets/ModelViewer.jsx", async () => {
  const { useEffect } = await import("react");
  return {
    default: ({ preset, view }) => {
      useEffect(() => {
        modelLifecycle.mounts++;
        return () => {
          modelLifecycle.unmounts++;
        };
      }, []);
      return (
        <div
          data-testid="lobby-model"
          data-character={preset.iCharacterSkinMaterialID_Modded}
        >
          {view} full setup
        </div>
      );
    },
  };
});
const data = {
  iCharacterSkinMaterialID_Modded: 1,
  iVehicleMaterialID_Modded: 2,
  iWheelMaterialID_Modded: 3,
};
const state = {
  steamConnected: true,
  cloudEnabled: true,
  presetState: {
    quickSetups: [{ player: 0 }, { player: 1 }],
    appearance: {
      items: {
        characters: { 1: { label: "Racer skin" } },
        vehicles: { 2: { label: "Kart" } },
        wheels: { 3: { label: "Wheel" } },
      },
    },
  },
};
describe("Lobby", () => {
  it("leaves loading after a failed read and permits a successful refresh", async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(new Error("Room is changing"))
      .mockResolvedValue({
        status: "ready",
        players: [{ key: "current", name: "Racer", data, canCopy: true }],
      });
    render(<Lobby state={state} request={request} />);
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Room is changing",
    );
    expect(screen.queryByText("Reading the current game lobby…")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Refresh players" }));
    expect(await screen.findByText("Racer skin")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("keeps Copy preset and Save preset separate and targets the selected local player", async () => {
    const request = vi.fn().mockImplementation((action) =>
      Promise.resolve(
        action === "lobby"
          ? {
              status: "ready",
              players: [
                { key: "private-token", name: "Racer", data, canCopy: true },
              ],
            }
          : { message: "Saved", presetId: 12 },
      ),
    );
    const copied = vi.fn();
    render(<Lobby state={state} request={request} onCopied={copied} />);
    expect(await screen.findByText("Racer skin")).toBeTruthy();
    fireEvent.change(
      screen.getByRole("combobox", { name: "Local saved Quick Setup slot" }),
      { target: { value: "1" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Copy preset", exact: true }),
    );
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith("copy-lobby-preset", {
        key: "private-token",
        mode: "quick",
        player: 1,
      }),
    );
    await waitFor(() => expect(copied).toHaveBeenCalled());
    fireEvent.click(
      await screen.findByRole("button", { name: "Save preset", exact: true }),
    );
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith("copy-lobby-preset", {
        key: "private-token",
        mode: "save",
      }),
    );
  });
  it("does not make up players when the game is offline", async () => {
    render(
      <Lobby
        state={state}
        request={vi.fn().mockResolvedValue({
          status: "offline",
          message: "Open the game",
          players: [],
        })}
      />,
    );
    expect(await screen.findByText("Open the game")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Copy preset", exact: true }),
    ).toBeNull();
  });
  it("offers a permanent per-part copy and Workshop action while racing", async () => {
    const request = vi.fn().mockImplementation((action) =>
      Promise.resolve(
        action === "lobby"
          ? {
              status: "ready",
              inRace: true,
              players: [
                {
                  key: "racer",
                  name: "Remote",
                  data,
                  canCopy: true,
                  parts: {
                    characters: {
                      canCopy: true,
                      installed: true,
                      workshopId: "123",
                      canSubscribe: true,
                    },
                    vehicles: {
                      canCopy: false,
                      installed: false,
                      reason: "Install the vehicle first",
                    },
                  },
                },
              ],
            }
          : { message: "Done" },
      ),
    );
    render(<Lobby state={state} request={request} />);
    const characterCopy = await screen.findByRole("button", {
      name: "Copy Remote’s character to Quick Setup",
    });
    fireEvent.click(characterCopy);
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith("copy-lobby-preset", {
        key: "racer",
        mode: "quick",
        player: 0,
        part: "characters",
      }),
    );
    const subscribe = await screen.findByRole("button", {
      name: "Subscribe to Remote’s character",
    });
    await waitFor(() => expect(subscribe.disabled).toBe(false));
    fireEvent.click(subscribe);
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith("subscribe-lobby-part", {
        key: "racer",
        kind: "characters",
      }),
    );
    expect(
      screen.getByRole("button", {
        name: "Copy Remote’s vehicle to Quick Setup",
      }).disabled,
    ).toBe(true);
    expect(screen.getByText(/Local race/)).toBeTruthy();
  });
  it("mounts one full setup viewer for eight players and keeps it through identical refreshes", async () => {
    modelLifecycle.mounts = 0;
    modelLifecycle.unmounts = 0;
    const players = Array.from({ length: 8 }, (_, index) => ({
      key: `racer-${index}`,
      name: `Racer ${index + 1}`,
      local: index === 0,
      data: { ...data, iCharacterSkinMaterialID_Modded: index + 1 },
      canCopy: true,
    }));
    const request = vi.fn(async () => ({
      status: "ready",
      players: JSON.parse(JSON.stringify(players)),
    }));
    render(<Lobby state={state} request={request} loadModel={vi.fn()} />);
    await screen.findByRole("article", { name: "Racer 8 setup" });
    expect(screen.queryByTestId("lobby-model")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Show interactive 3D" }),
    );
    const viewer = await screen.findByTestId("lobby-model", {}, { timeout: 4000 });
    expect(viewer.getAttribute("data-character")).toBe("2");
    expect(modelLifecycle.mounts).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Refresh players" }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(screen.getAllByTestId("lobby-model")).toHaveLength(1);
    expect(modelLifecycle.mounts).toBe(1);
    fireEvent.click(
      within(screen.getByRole("article", { name: "Racer 8 setup" })).getByRole(
        "button",
        { name: "View Racer 8’s full 3D setup" },
      ),
    );
    expect(viewer.getAttribute("data-character")).toBe("8");
    expect(modelLifecycle.mounts).toBe(1);
  });
  it("queues saves per card without refreshing the roster or blocking other cards", async () => {
    let finishFirst;
    const firstSave = new Promise((resolve) => {
      finishFirst = resolve;
    });
    const players = [1, 2].map((number) => ({
      key: `player-${number}`,
      name: `Racer ${number}`,
      data: { ...data, iWheelMaterialID_Modded: number },
      canCopy: true,
      canSave: true,
    }));
    const request = vi.fn((action, body) =>
      action === "lobby"
        ? Promise.resolve({ status: "ready", players })
        : body.key === "player-1"
          ? firstSave
          : Promise.resolve({ presetId: 102, alreadySaved: true }),
    );
    const { rerender } = render(<Lobby state={state} request={request} />);
    const first = await screen.findByRole("article", { name: "Racer 1 setup" });
    const second = screen.getByRole("article", { name: "Racer 2 setup" });
    fireEvent.click(
      within(first).getByRole("button", { name: "Save preset", exact: true }),
    );
    rerender(<Lobby state={state} request={request} busy />);
    expect(
      within(second).getByRole("button", { name: "Save preset", exact: true })
        .disabled,
    ).toBe(false);
    fireEvent.click(
      within(second).getByRole("button", { name: "Save preset", exact: true }),
    );
    expect(
      within(second).getByRole("button", { name: "Queued…" }),
    ).toBeTruthy();
    await waitFor(() =>
      expect(
        request.mock.calls.filter(([action]) => action === "copy-lobby-preset"),
      ).toHaveLength(1),
    );
    finishFirst({ presetId: 101, alreadySaved: true });
    await waitFor(() =>
      expect(
        screen.getAllByRole("button", { name: "Saved to presets" }),
      ).toHaveLength(2),
    );
    expect(
      request.mock.calls.filter(([action]) => action === "lobby"),
    ).toHaveLength(1);
    expect(
      within(first).getByRole("button", { name: "Saved to presets" }).disabled,
    ).toBe(true);
  });
  it("recognizes a saved setup from the library and labels local copy destinations", async () => {
    const savedState = {
      ...state,
      presetState: { ...state.presetState, presets: [{ id: 100, data }] },
    };
    render(
      <Lobby
        state={savedState}
        request={vi.fn().mockResolvedValue({
          status: "ready",
          players: [
            {
              key: "remote",
              name: "Online racer",
              data,
              canCopy: true,
              canSave: true,
            },
          ],
        })}
      />,
    );
    expect(
      await screen.findByRole("button", { name: "Saved to presets" }),
    ).toHaveProperty("disabled", true);
    expect(
      screen.getByRole("option", { name: "Local slot 2 · Quick Setup" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("combobox", { name: "Local saved Quick Setup slot" }),
    ).toBeTruthy();
  });
  it("shows official names for Original setups and labels package previews truthfully", async () => {
    const originalData = {
      ...data,
      bUsingModdedVersion: false,
      iCharacterSkinMaterialID: 1,
      iVehicleMaterialID: 2,
      iWheelMaterialID: 3,
      iCharacterSkinMaterialID_Modded: 0,
      iVehicleMaterialID_Modded: 0,
      iWheelMaterialID_Modded: 0,
    };
    const loadImage = vi.fn();
    const request = vi.fn().mockResolvedValue({
      status: "ready",
      players: [
        {
          key: "original",
          name: "Original racer",
          data: originalData,
          canCopy: true,
          parts: {
            characters: { installed: true, configId: 1 },
            vehicles: { installed: true, configId: 2 },
            wheels: { installed: true, configId: 3 },
          },
        },
        {
          key: "missing",
          name: "Modded racer",
          data: { ...data, iCharacterSkinMaterialID_Modded: 999 },
          canCopy: false,
          parts: {
            characters: {
              installed: false,
              previewUrl: "https://images.steamusercontent.com/package.png",
              label: "Workshop package",
            },
          },
        },
      ],
    });
    render(<Lobby state={state} request={request} loadImage={loadImage} />);
    const original = await screen.findByRole("article", {
      name: "Original racer setup",
    });
    expect(within(original).getByText("Racer skin")).toBeTruthy();
    expect(within(original).queryByText("Not installed")).toBeNull();
    expect(
      screen
        .getByRole("img", { name: "Workshop package preview" })
        .getAttribute("src"),
    ).toContain("steamusercontent.com");
    expect(loadImage).not.toHaveBeenCalled();
  });
  it("distinguishes CPU and human racers and offers CPU editing only with verified authority", async () => {
    const edit = vi.fn();
    const players = [
      { key: "you", player: 0, name: "Player", local: true, data },
      {
        key: "cpu-edit",
        player: 1,
        name: "Player",
        ai: true,
        data,
        canEditCpu: true,
      },
      {
        key: "cpu-readonly",
        player: 2,
        name: "Player",
        ai: true,
        data,
        canEditCpu: false,
      },
      {
        key: "remote",
        player: 3,
        name: "Player",
        ai: false,
        data,
        canEditCpu: true,
      },
    ];
    render(
      <Lobby
        state={state}
        request={vi.fn().mockResolvedValue({ status: "ready", players })}
        onEditPlayer={edit}
      />,
    );
    expect(
      await screen.findByRole("article", { name: "You setup" }),
    ).toBeTruthy();
    expect(screen.getByRole("article", { name: "CPU 3 setup" })).toBeTruthy();
    expect(screen.getByRole("article", { name: "Racer 4 setup" })).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: "Edit CPU setup" }),
    ).toHaveLength(1);
    fireEvent.click(
      within(screen.getByRole("article", { name: "CPU 2 setup" })).getByRole(
        "button",
        { name: "Edit CPU setup" },
      ),
    );
    expect(edit).toHaveBeenCalledWith(players[1]);
  });
  it("updates only the edited player card immediately while retaining other saved states", async () => {
    const library = {
      ...state,
      presetState: {
        ...state.presetState,
        appearance: {
          items: {
            ...state.presetState.appearance.items,
            wheels: { 3: { label: "Old wheels" }, 4: { label: "New wheels" } },
          },
        },
      },
    };
    const players = [
      {
        key: "cpu",
        name: "AI runner",
        ai: true,
        data,
        canCopy: true,
        alreadySaved: true,
      },
      {
        key: "other",
        name: "Other racer",
        data,
        canCopy: true,
        alreadySaved: true,
      },
    ];
    const request = vi.fn().mockResolvedValue({ status: "ready", players });
    const { rerender } = render(<Lobby state={library} request={request} />);
    const cpu = await screen.findByRole("article", { name: "AI runner setup" });
    const other = screen.getByRole("article", { name: "Other racer setup" });
    expect(
      within(cpu).getByRole("button", { name: "Saved to presets" }),
    ).toBeTruthy();
    rerender(
      <Lobby
        state={library}
        request={request}
        editedPlayer={{
          key: "cpu",
          data: { ...data, iWheelMaterialID_Modded: 4 },
          serial: 1,
        }}
      />,
    );
    expect(within(cpu).getByText("New wheels")).toBeTruthy();
    expect(
      within(cpu).getByRole("button", { name: "Save preset", exact: true }),
    ).toBeTruthy();
    expect(within(other).getByText("Old wheels")).toBeTruthy();
    expect(
      within(other).getByRole("button", { name: "Saved to presets" }),
    ).toBeTruthy();
    expect(request).toHaveBeenCalledTimes(1);
  });
});
