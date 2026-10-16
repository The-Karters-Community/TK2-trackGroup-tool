import { it, expect, vi } from "vitest";
import { render, waitFor, act } from "@testing-library/react";
import ModelViewer from "./ModelViewer.jsx";

const viewport = vi.hoisted(() => ({
  show: vi.fn(() => ({ motion: false, warning: "" })),
  dispose: vi.fn(),
  reset: vi.fn(),
}));
const create = vi.hoisted(() => vi.fn(() => viewport));
vi.mock("./modelViewport.js", () => ({ createViewport: create }));

it("keeps one viewport during selection loads and discards obsolete results", async () => {
  let resolve;
  const load = vi.fn((request) =>
    request.id === 2
      ? new Promise((done) => {
          resolve = done;
        })
      : Promise.resolve({ id: request.id }),
  );
  const { rerender, unmount } = render(
    <ModelViewer kind="characters" id={1} loadModel={load} />,
  );
  await waitFor(() =>
    expect(viewport.show).toHaveBeenCalledWith({ id: 1 }, "characters"),
  );
  rerender(<ModelViewer kind="characters" id={2} loadModel={load} />);
  await waitFor(() => expect(resolve).toBeTypeOf("function"));
  expect(viewport.dispose).not.toHaveBeenCalled();
  expect(viewport.show).toHaveBeenCalledTimes(1);
  rerender(<ModelViewer kind="characters" id={3} loadModel={load} />);
  await waitFor(() =>
    expect(viewport.show).toHaveBeenLastCalledWith({ id: 3 }, "characters"),
  );
  await act(async () => resolve({ id: 2 }));
  expect(viewport.show).toHaveBeenCalledTimes(2);
  expect(create).toHaveBeenCalledTimes(1);
  unmount();
  expect(viewport.dispose).toHaveBeenCalledTimes(1);
});
