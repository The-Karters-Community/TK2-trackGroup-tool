import { afterEach, it, expect, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import PresetManager from "./PresetManager.jsx";
import PresetPreview from "./PresetPreview.jsx";
import { fixture } from "./test-fixture.js";
import { readProfile } from "../web/profile.js";
import { presetState } from "./model.js";

const instances = vi.hoisted(() => []);
vi.mock("sortablejs", () => ({
  default: class {
    constructor(node, options) {
      this.node = node;
      this.options = options;
      instances.push(this);
    }
    option() {}
    sort(ids) {
      ids.forEach((id) =>
        this.node.appendChild(
          [...this.node.children].find((n) => n.dataset.id === id),
        ),
      );
    }
    destroy() {}
  },
}));
afterEach(() => {
  cleanup();
  instances.length = 0;
  vi.unstubAllGlobals();
});

it("paginates 200 setups and preserves other pages when saving a drag", async () => {
  const state = presetState(readProfile(fixture()));
  state.presets = Array.from({ length: 200 }, (_, i) => ({
    ...state.presets[0],
    id: 100 + i,
  }));
  const onChange = vi.fn().mockResolvedValue(true);
  render(<PresetManager state={state} onChange={onChange} />);
  const list = screen.getByRole("list", { name: "Preset order" });
  expect(within(list).getAllByRole("checkbox")).toHaveLength(12);
  expect(screen.getAllByRole("checkbox")).toHaveLength(12);
  const instance = instances[0];
  instance.node.appendChild(instance.node.children[0]);
  instance.options.onEnd({ oldIndex: 0, newIndex: 11 });
  await screen.findByText("Unsaved preset order");
  expect(onChange).not.toHaveBeenCalled();
  expect(list.children[11].dataset.id).toBe("100");
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(onChange).toHaveBeenCalledWith({
      mode: "order",
      order: [
        ...Array.from({ length: 11 }, (_, i) => 101 + i),
        100,
        ...Array.from({ length: 188 }, (_, i) => 112 + i),
      ],
    }),
  );
}, 15000);

it("loads a preview only when it enters the visible area", async () => {
  let observe;
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback) {
        observe = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  URL.revokeObjectURL = vi.fn();
  const loader = vi.fn().mockResolvedValue("blob:preview");
  const { unmount } = render(
    <PresetPreview
      source="local-preview"
      loadImage={loader}
      alt="Mephiles look"
    />,
  );
  expect(loader).not.toHaveBeenCalled();
  observe([{ isIntersecting: true }]);
  await screen.findByRole("img", { name: "Mephiles look" });
  expect(loader).toHaveBeenCalledTimes(1);
  unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
});

it("keeps drag available during a race while leaving order saving disabled", async () => {
  const state = presetState(readProfile(fixture()));
  state.presets = Array.from({ length: 4 }, (_, i) => ({
    ...state.presets[0],
    id: 100 + i,
  }));
  const onChange = vi.fn();
  render(
    <PresetManager
      state={state}
      available={false}
      gameRunning
      onChange={onChange}
    />,
  );
  expect(
    screen.getByRole("button", { name: "Drag Setup 1 to reorder" }).disabled,
  ).toBe(false);
  const instance = instances[0];
  instance.node.appendChild(instance.node.children[0]);
  instance.options.onEnd({ oldIndex: 0, newIndex: 3 });
  await screen.findByText(/Applies to the next selection/);
  expect(screen.getByRole("button", { name: "Save changes" }).disabled).toBe(
    true,
  );
  expect(onChange).not.toHaveBeenCalled();
});
it("stages preset group drag order without saving or losing memberships", async () => {
  const state = presetState(readProfile(fixture()));
  state.groups.push({ ...state.groups[0], id: "another", name: "Other group" });
  const onChange = vi.fn();
  render(
    <PresetManager
      state={state}
      available={false}
      gameRunning
      onChange={onChange}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Preset groups/ }));
  const instance = instances.at(-1);
  instance.node.appendChild(instance.node.children[0]);
  instance.options.onEnd({ oldIndex: 0, newIndex: 1 });
  await screen.findByText(/Unsaved group order/);
  expect(instance.node.children[0].dataset.id).toBe("another");
  expect(onChange).not.toHaveBeenCalled();
  expect(state.groups[0].members).toEqual([100]);
});
