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
  fireEvent.click(screen.getByLabelText("#100"));
  fireEvent.click(screen.getByRole("button", { name: /Preset groups/ }));
  fireEvent.click(screen.getByLabelText("Select group"));
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
    expect(onChange).toHaveBeenCalledWith({
      mode: "group",
      groupId: state().groups[0].id,
      name: "New name",
      members: [100],
    }),
  );
});
it("allows read-only details to close while Steam is unavailable", () => {
  render(<PresetManager state={state()} available={false} />);
  fireEvent.click(screen.getByRole("button", { name: /Preset #100/ }));
  expect(screen.getByRole("button", { name: "Duplicate" }).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Close preset" }));
  expect(screen.queryByRole("dialog")).toBeNull();
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
