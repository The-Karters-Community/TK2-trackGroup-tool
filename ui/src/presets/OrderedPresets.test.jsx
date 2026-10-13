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

it("keeps 200 setups in one selectable gallery and saves a long drag only after confirmation", async () => {
  const state = presetState(readProfile(fixture()));
  state.presets = Array.from({ length: 200 }, (_, i) => ({
    ...state.presets[0],
    id: 100 + i,
  }));
  const onChange = vi.fn().mockResolvedValue(true);
  render(<PresetManager state={state} onChange={onChange} />);
  const list = screen.getByRole("list", { name: "Preset order" });
  expect(within(list).getAllByRole("checkbox")).toHaveLength(200);
  expect(screen.getAllByRole("checkbox")).toHaveLength(200);
  const instance = instances[0];
  instance.node.appendChild(instance.node.children[0]);
  instance.options.onEnd({ oldIndex: 0, newIndex: 199 });
  await screen.findByText("Unsaved preset order");
  expect(onChange).not.toHaveBeenCalled();
  expect(list.children[199].dataset.id).toBe("100");
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(onChange).toHaveBeenCalledWith({
      mode: "order",
      order: [...Array.from({ length: 199 }, (_, i) => 101 + i), 100],
    }),
  );
});

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
