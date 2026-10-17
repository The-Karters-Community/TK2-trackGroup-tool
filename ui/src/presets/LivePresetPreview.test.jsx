import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import LivePresetPreview from "./LivePresetPreview.jsx";
vi.mock("./ModelViewer.jsx", () => ({
  default: ({ kind }) => <div data-testid="model-viewer">{kind}</div>,
}));
afterEach(cleanup);

it("uses the saved game image without invoking a companion or polling renderer", async () => {
  const legacy = vi.fn(),
    loadImage = vi.fn().mockResolvedValue("blob:saved");
  render(
    <LivePresetPreview
      source="/api/preset-image/Icon_PresetID_1.png?v=1"
      loadImage={loadImage}
      renderPreview={legacy}
    />,
  );
  expect(
    await screen.findByAltText("Saved in-game setup preview"),
  ).toBeTruthy();
  expect(loadImage).toHaveBeenCalled();
  expect(legacy).not.toHaveBeenCalled();
  expect(screen.queryByText("Game reference")).toBeNull();
  expect(screen.queryByLabelText("Rotate preview")).toBeNull();
});
it("reloads a saved preview when the game writes a new image revision", async () => {
  const loadImage = vi
    .fn()
    .mockImplementation(async (source) =>
      source.includes("v=2") ? "blob:new" : "blob:old",
    );
  const { rerender } = render(
    <LivePresetPreview source="/icon.png?v=1" loadImage={loadImage} />,
  );
  await waitFor(() =>
    expect(screen.getByAltText("Saved in-game setup preview").src).toBe(
      "blob:old",
    ),
  );
  rerender(<LivePresetPreview source="/icon.png?v=2" loadImage={loadImage} />);
  await waitFor(() =>
    expect(screen.getByAltText("Saved in-game setup preview").src).toBe(
      "blob:new",
    ),
  );
});
it("keeps independent models and static saved images as clearly different modes", async () => {
  render(
    <LivePresetPreview
      loadModel={vi.fn()}
      source="/icon.png"
      modelAvailable
      modelKind="characters"
      changed
    />,
  );
  expect(await screen.findByTestId("model-viewer")).toHaveProperty(
    "textContent",
    "setup",
  );
  fireEvent.click(screen.getByRole("button", { name: "Selected part" }));
  expect(screen.getByTestId("model-viewer")).toHaveProperty(
    "textContent",
    "characters",
  );
  fireEvent.click(screen.getByRole("button", { name: "Saved image" }));
  expect(screen.queryByTestId("model-viewer")).toBeNull();
  expect(screen.getByText(/Last game-generated image/)).toBeTruthy();
});
