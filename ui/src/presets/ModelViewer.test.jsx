import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import ModelViewer from "./ModelViewer.jsx";

const state = vi.hoisted(() => ({ create: vi.fn(), instances: [] }));
vi.mock("./modelData.js", () => ({ createModelLoader: (load) => load }));
vi.mock("./modelViewport.js", () => ({
  createViewport: (...args) => state.create(...args),
}));

beforeEach(() => {
  state.instances = [];
  state.create.mockReset().mockImplementation((host) => {
    const canvas = document.createElement("canvas");
    canvas.setAttribute("data-testid", "preview-canvas");
    host.append(canvas);
    const instance = {
      attach: vi.fn((nextHost) => nextHost?.replaceChildren(canvas)),
      show: vi.fn(() => ({ motion: false, choices: [], warning: "" })),
      reset: vi.fn(),
      dispose: vi.fn(() => canvas.remove()),
    };
    state.instances.push(instance);
    return instance;
  });
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it.each(["setup", "characters"])(
  "enlarges %s in the native top layer and reuses its canvas, model and renderer",
  async (kind) => {
    const load = vi.fn().mockResolvedValue({});
    const { container, unmount } = render(
      <ModelViewer kind={kind} id={10} loadModel={load} />,
    );
    await waitFor(() =>
      expect(state.instances[0]?.show).toHaveBeenCalledTimes(1),
    );
    const canvas = screen.getByTestId("preview-canvas");
    const originalHost = canvas.parentElement;
    fireEvent.click(screen.getByRole("button", { name: "Enlarge" }));
    const dialog = screen.getByRole("dialog", {
      name:
        kind === "setup" ? "Full setup 3D preview" : "Selected part 3D preview",
    });
    await waitFor(() => expect(dialog.contains(canvas)).toBe(true));
    expect(dialog.open).toBe(true);
    expect(state.create).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledTimes(1);
    expect(state.instances[0].show).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getByRole("button", { name: "Close enlarged preview" }),
    );
    await waitFor(() => expect(canvas.parentElement).toBe(originalHost));
    expect(container.querySelectorAll("canvas")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Enlarge" }));
    fireEvent(
      screen.getByRole("dialog"),
      new Event("cancel", { cancelable: true }),
    );
    await waitFor(() => expect(canvas.parentElement).toBe(originalHost));
    expect(state.instances[0].dispose).not.toHaveBeenCalled();
    unmount();
    expect(state.instances[0].dispose).toHaveBeenCalledTimes(1);
  },
);

it("can enlarge before model loading resolves without creating another renderer", async () => {
  let finish;
  const load = vi.fn(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<ModelViewer kind="characters" id={10} loadModel={load} />);
  await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "Enlarge" }));
  finish({});
  await waitFor(() => expect(state.instances[0].show).toHaveBeenCalledTimes(1));
  expect(
    screen.getByRole("dialog").contains(screen.getByTestId("preview-canvas")),
  ).toBe(true);
  expect(state.create).toHaveBeenCalledTimes(1);
});

it("waits for the installed-asset index before requesting a model and keeps the prior canvas", async () => {
  const load = vi.fn().mockResolvedValue({});
  const { rerender } = render(
    <ModelViewer kind="characters" id={10} loadModel={load} assetsLoading />,
  );
  expect(screen.getByText("Reading installed assets…")).toBeTruthy();
  await new Promise((resolve) => setTimeout(resolve, 140));
  expect(load).not.toHaveBeenCalled();
  rerender(
    <ModelViewer
      kind="characters"
      id={10}
      loadModel={load}
      assetsLoading={false}
    />,
  );
  await waitFor(() =>
    expect(state.instances[0]?.show).toHaveBeenCalledTimes(1),
  );
  const canvas = screen.getByTestId("preview-canvas");
  rerender(
    <ModelViewer kind="characters" id={20} loadModel={load} assetsLoading />,
  );
  expect(screen.getByTestId("preview-canvas")).toBe(canvas);
  await new Promise((resolve) => setTimeout(resolve, 140));
  expect(load).toHaveBeenCalledTimes(1);
  rerender(
    <ModelViewer
      kind="characters"
      id={20}
      loadModel={load}
      assetsLoading={false}
    />,
  );
  await waitFor(() => expect(state.instances[0].show).toHaveBeenCalledTimes(2));
  expect(load.mock.calls[1][0].id).toBe(20);
  expect(state.create).toHaveBeenCalledTimes(1);
});
