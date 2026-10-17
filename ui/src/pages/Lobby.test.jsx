import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import Lobby from "./Lobby.jsx";

afterEach(cleanup);
const data = {
  iCharacterSkinMaterialID_Modded: 1,
  iVehicleMaterialID_Modded: 2,
  iWheelMaterialID_Modded: 3,
};
const state = {
  steamConnected: true,
  cloudEnabled: true,
  presetState: {
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
  it("shows the real room state and copies only the clicked player key", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Copy & save preset" }));
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith("copy-lobby-preset", {
        key: "private-token",
      }),
    );
    await waitFor(() => expect(copied).toHaveBeenCalled());
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
      screen.queryByRole("button", { name: "Copy & save preset" }),
    ).toBeNull();
  });
});
