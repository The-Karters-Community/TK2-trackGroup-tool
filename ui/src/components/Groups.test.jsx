import React from "react";
import { afterEach, expect, test, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import Library from "../pages/Library.jsx";
import GroupDetails from "./GroupDetails.jsx";
import ImportReview from "./ImportReview.jsx";
import GroupEditor from "./GroupEditor.jsx";

const sortableInstances = vi.hoisted(() => []);
vi.mock("sortablejs", () => ({
  default: class {
    constructor(element, options) {
      this.element = element;
      this.options = options;
      this.sort = vi.fn();
      this.option = vi.fn();
      this.destroy = vi.fn();
      sortableInstances.push(this);
    }
  },
}));
afterEach(() => {
  cleanup();
  sortableInstances.length = 0;
});

test("batch group export retains selections across pages and searches", () => {
  const groups = Array.from({ length: 30 }, (_, i) => ({
    ...group,
    id: `group-${i}`,
    name: `Collection ${i + 1}`,
  }));
  const onExportMany = vi.fn();
  render(
    <Library
      local
      state={{ localGroups: groups }}
      onExportMany={onExportMany}
    />,
  );
  fireEvent.click(screen.getByLabelText("Select Collection 1"));
  fireEvent.click(
    screen.getByRole("button", { name: "Next Track groups page" }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Next Track groups page" }),
  );
  fireEvent.click(screen.getByLabelText("Select Collection 25"));
  fireEvent.change(screen.getByLabelText("Search groups"), {
    target: { value: "Collection 25" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Export selected · 2" }));
  expect(onExportMany).toHaveBeenCalledWith([groups[0], groups[24]]);
});

test("desktop details dismiss outside while keeping edits and inside interactions", () => {
  const close = vi.fn();
  const { rerender } = render(
    <GroupDetails group={group} local connected onClose={close} />,
  );
  function outsideClick() {
    fireEvent(
      document.body,
      new MouseEvent("pointerdown", { bubbles: true, button: 0 }),
    );
    fireEvent.click(document.body);
  }
  fireEvent(
    screen.getByLabelText("Group name"),
    new MouseEvent("pointerdown", { bubbles: true, button: 0 }),
  );
  fireEvent.click(document.body);
  expect(close).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Group name"), {
    target: { value: "Draft" },
  });
  outsideClick();
  expect(close).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Discard" }));
  rerender(<GroupDetails group={group} local connected busy onClose={close} />);
  outsideClick();
  expect(close).not.toHaveBeenCalled();
  rerender(<GroupDetails group={group} local connected onClose={close} />);
  outsideClick();
  expect(close).toHaveBeenCalledTimes(1);
});

test("an outside click on another desktop card selects that collection", () => {
  render(
    <Library
      state={{
        groups: [
          { ...group, category: "speedrun" },
          {
            ...group,
            id: "next",
            name: "Next collection",
            category: "speedrun",
          },
        ],
        localGroups: [],
      }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /My ordered group/ }));
  const next = screen.getByRole("button", { name: /Next collection/ });
  fireEvent(next, new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
  fireEvent.click(next);
  expect(screen.getByRole("heading", { name: "Next collection" })).toBeTruthy();
});
test("local name and racing order are saved together without a review page", () => {
  const onEdit = vi.fn();
  render(
    <GroupDetails
      group={{ ...group, expectedHash: "baseline", exportReady: true }}
      local
      connected
      onEdit={onEdit}
      onClose={vi.fn()}
    />,
  );
  expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
  fireEvent.change(screen.getByLabelText("Group name"), {
    target: { value: "Renamed" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Move Second up" }));
  expect(
    screen
      .getAllByRole("listitem")
      .map((e) => e.querySelector("strong").textContent),
  ).toEqual(["Second", "First"]);
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(onEdit).toHaveBeenCalledWith({
    id: group.id,
    name: "Renamed",
    order: [1, 0],
    expectedHash: "baseline",
  });
  expect(screen.queryByText(/Review name change/)).toBeNull();
});

test("unsubscribed local groups offer repair and gallery can switch to a list", () => {
  const repair = vi.fn();
  const missing = {
    ...group,
    missingTracks: 1,
    unresolvedTracks: 0,
    exportReady: true,
  };
  render(<GroupDetails group={missing} local connected onRepair={repair} />);
  fireEvent.click(
    screen.getByRole("button", { name: "Repair missing tracks" }),
  );
  expect(repair).toHaveBeenCalledWith(missing);
});
test("preview excludes UI-only group fields", () => {
  const onPreview = vi.fn();
  const portable = {
    ...group,
    format: "tk2-track-group",
    version: 1,
    revision: 1,
  };
  render(
    <GroupDetails
      group={{ ...portable, importState: "installed", category: "speedrun" }}
      connected
      onPreview={onPreview}
      onClose={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Preview import" }));
  expect(onPreview).toHaveBeenCalledWith(portable);
});
const group = {
  id: "test",
  name: "My ordered group",
  tracks: [
    { kind: "official", configId: 4, title: "First" },
    { kind: "workshop", workshopId: "123", modId: "test", title: "Second" },
  ],
};
test("search and details preserve track order", () => {
  render(
    <Library
      state={{
        groups: [{ ...group, category: "speedrun" }],
        localGroups: [],
        steamConnected: true,
      }}
      run={vi.fn()}
      onPreview={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByText("My ordered group"));
  expect(screen.getAllByRole("listitem").map((el) => el.textContent)).toEqual(
    expect.arrayContaining([
      expect.stringContaining("First"),
      expect.stringContaining("Second"),
    ]),
  );
  fireEvent.change(screen.getByLabelText("Search groups"), {
    target: { value: "missing" },
  });
  expect(screen.getByText("No matching groups")).toBeTruthy();
});
test("catalog categories filter groups and file importing is only in My track groups", () => {
  const state = {
    groups: [
      { ...group, category: "speedrun" },
      {
        ...group,
        id: "community",
        name: "Community races",
        category: "community",
      },
    ],
    localGroups: [],
    steamConnected: true,
  };
  const { rerender } = render(
    <Library state={state} run={vi.fn()} onPreview={vi.fn()} />,
  );
  expect(screen.queryByText("Community races")).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Import group file" }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Community/ }));
  expect(screen.getByText("Community races")).toBeTruthy();
  expect(screen.queryByText(group.name)).toBeNull();
  rerender(<Library state={state} local run={vi.fn()} onPreview={vi.fn()} />);
  expect(
    screen.getByRole("button", { name: "Import group file" }),
  ).toBeTruthy();
  expect(screen.getByRole("button", { name: "Create group" })).toBeTruthy();
});
test("review names each track and shows download progress in the same view", () => {
  const preview = {
    group,
    destinationName: group.name,
    mode: "install",
    outcome: "added",
    missingSubscriptions: ["123"],
    pendingDownloads: ["123"],
    trackStatus: { 123: { subscribed: false, ready: false } },
  };
  const { rerender } = render(
    <ImportReview preview={preview} onConfirm={vi.fn()} />,
  );
  expect(screen.getAllByRole("listitem").map((el) => el.textContent)).toEqual([
    expect.stringContaining("01First"),
    expect.stringContaining("02Second"),
  ]);
  expect(
    screen.getByText("Missing subscription · subscribe and download"),
  ).toBeTruthy();
  expect(
    screen.getByText(/Nothing has been downloaded or saved yet/),
  ).toBeTruthy();
  rerender(
    <ImportReview
      preview={preview}
      confirmed
      job={{
        state: "running",
        phase: "downloading",
        message: "Workshop tracks ready: 0/1",
        total: 1,
        completed: 0,
        items: {
          123: { subscribed: true, ready: false, downloaded: 25, total: 100 },
        },
      }}
      onCancel={vi.fn()}
    />,
  );
  expect(screen.getByText("Downloading · 25%")).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "Add to My track groups" }),
  ).toBeNull();
  rerender(
    <ImportReview
      preview={preview}
      confirmed
      job={{ state: "completed", message: "Group added." }}
      onDone={vi.fn()}
    />,
  );
  expect(screen.getByText("Installed")).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "View in My track groups" }),
  ).toBeTruthy();
});
test("creating and renaming submit distinct drafts for review", () => {
  const submit = vi.fn();
  const { rerender } = render(
    <GroupEditor onSubmit={submit} onCancel={vi.fn()} />,
  );
  fireEvent.change(screen.getByLabelText("Group name"), {
    target: { value: "New race" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Paste Workshop links" }));
  fireEvent.change(screen.getByLabelText(/Workshop item IDs/), {
    target: { value: "123\n456" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Review changes" }));
  expect(submit).toHaveBeenCalledWith("create", {
    name: "New race",
    items: "123\n456",
  });
  rerender(
    <GroupEditor
      key="rename"
      group={group}
      onSubmit={submit}
      onCancel={vi.fn()}
    />,
  );
  expect(
    screen.queryByRole("textbox", { name: /Workshop item IDs/ }),
  ).toBeNull();
  fireEvent.change(screen.getByLabelText("Group name"), {
    target: { value: "New name" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Review changes" }));
  expect(submit).toHaveBeenCalledWith("rename", {
    id: group.id,
    name: "New name",
  });
});
test("unresolved local dependencies disable export", () => {
  render(
    <GroupDetails
      group={{
        ...group,
        exportReady: false,
        reason: "Workshop dependency unresolved",
      }}
      local
      connected
      onClose={vi.fn()}
      onExport={vi.fn()}
    />,
  );
  expect(screen.getByRole("button", { name: "Export group" }).disabled).toBe(
    true,
  );
  expect(screen.getByText("Workshop dependency unresolved")).toBeTruthy();
});

test("dragging reorders directly and discard restores the saved order", () => {
  render(
    <GroupDetails
      group={{ ...group, expectedHash: "original" }}
      local
      connected
      onEdit={vi.fn()}
    />,
  );
  const sortable = sortableInstances.at(-1);
  expect(sortable.options.animation).toBe(180);
  expect(sortable.options.handle).toBe(".drag-handle");
  expect(sortable.options.forceFallback).toBe(true);
  expect(sortable.options.scroll).toBe(true);
  expect(sortable.options.bubbleScroll).toBe(true);
  act(() => {
    sortable.options.onStart();
    sortable.options.onEnd({ oldIndex: 1, newIndex: 0 });
  });
  expect(sortable.sort).toHaveBeenCalledWith(["0", "1"], false);
  expect(
    screen.getAllByRole("listitem")[0].querySelector("strong").textContent,
  ).toBe("Second");
  expect(screen.getByRole("button", { name: "Save changes" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Discard" }));
  expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
  expect(
    screen.getAllByRole("listitem")[0].querySelector("strong").textContent,
  ).toBe("First");
});

test("acknowledges the submitted job, hides save controls and rebases the next edit", async () => {
  const oldJob = { id: "old", state: "completed" };
  const onEdit = vi.fn().mockResolvedValue({ jobId: "new" });
  const initial = { ...group, expectedHash: "original" };
  const props = {
    group: initial,
    local: true,
    connected: true,
    onEdit,
    editJob: oldJob,
  };
  const { rerender, container } = render(<GroupDetails {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Move Second up" }));
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Save changes" })),
  );
  expect(screen.getByRole("button", { name: "Save changes" }).disabled).toBe(
    true,
  );
  // A delayed running-state poll must not acknowledge the previous completed job.
  rerender(
    <GroupDetails {...props} editJob={{ id: "refresh", state: "completed" }} />,
  );
  expect(screen.getByRole("button", { name: "Save changes" }).disabled).toBe(
    true,
  );
  fireEvent.submit(container.querySelector("form"));
  expect(onEdit).toHaveBeenCalledTimes(1);
  const saved = {
    ...initial,
    expectedHash: "saved",
    tracks: [...initial.tracks].reverse(),
  };
  rerender(
    <GroupDetails
      {...props}
      group={saved}
      editJob={{ id: "new", state: "completed" }}
    />,
  );
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull(),
  );
  expect(
    screen.getAllByRole("listitem")[0].querySelector("strong").textContent,
  ).toBe("Second");
  fireEvent.click(screen.getByRole("button", { name: "Move First up" }));
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Save changes" })),
  );
  expect(onEdit.mock.calls[1][0]).toMatchObject({
    expectedHash: "saved",
    order: [1, 0],
  });
});

test("failed group saves keep the draft and allow retry", async () => {
  const onEdit = vi.fn().mockResolvedValue({ jobId: "save" });
  const props = { group, local: true, connected: true, onEdit };
  const { rerender } = render(<GroupDetails {...props} />);
  fireEvent.change(screen.getByLabelText("Group name"), {
    target: { value: "My draft" },
  });
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Save changes" })),
  );
  rerender(
    <GroupDetails {...props} editJob={{ id: "save", state: "failed" }} />,
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Save changes" }).disabled).toBe(
      false,
    ),
  );
  expect(screen.getByLabelText("Group name").value).toBe("My draft");
});

test("polling keeps an unsaved draft bound to its original save hash", () => {
  const onEdit = vi.fn();
  const { rerender } = render(
    <GroupDetails
      group={{ ...group, expectedHash: "original" }}
      local
      connected
      onEdit={onEdit}
    />,
  );
  fireEvent.change(screen.getByLabelText("Group name"), {
    target: { value: "Draft" },
  });
  rerender(
    <GroupDetails
      group={{ ...group, expectedHash: "newer" }}
      local
      connected
      onEdit={onEdit}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(onEdit).toHaveBeenCalledWith(
    expect.objectContaining({ expectedHash: "original", name: "Draft" }),
  );
});

test("Discover track groups has independent gallery and list controls", () => {
  localStorage.removeItem("browse-groups-view");
  render(
    <Library
      state={{ groups: [{ ...group, category: "speedrun" }], localGroups: [] }}
      run={vi.fn()}
    />,
  );
  expect(
    screen
      .getByRole("button", { name: "Gallery" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "List" }));
  expect(
    screen.getByRole("button", { name: "List" }).getAttribute("aria-pressed"),
  ).toBe("true");
  expect(localStorage.getItem("browse-groups-view")).toBe("list");
});

test("a pristine panel picks up refreshed track identities without changing the save", () => {
  const initial = {
    ...group,
    expectedHash: "same",
    tracks: [{ kind: "workshop", modId: "unknown" }],
  };
  const { rerender } = render(<GroupDetails group={initial} local connected />);
  expect(
    screen.queryByRole("link", { name: "View Resolved in Steam" }),
  ).toBeNull();
  rerender(
    <GroupDetails
      group={{
        ...initial,
        tracks: [
          {
            kind: "workshop",
            modId: "unknown",
            title: "Resolved",
            workshopId: "123",
          },
        ],
      }}
      local
      connected
    />,
  );
  expect(
    screen.getByRole("link", { name: "View Resolved in Steam" }),
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
});

test("official names and images are shared across details and galleries", () => {
  const official = {
    ...group,
    tracks: [
      { kind: "official", configId: 267992, title: "Official track 267992" },
    ],
  };
  const { container } = render(
    <GroupDetails group={official} connected onPreview={vi.fn()} />,
  );
  expect(screen.getByText("Gauntlet Run")).toBeTruthy();
  expect(container.querySelector("img").getAttribute("src")).toBe(
    "/Tracks/Gauntlet%20Run.jpg",
  );
});
test("save controls reserve space and become inert when pristine", () => {
  const { container } = render(<GroupDetails group={group} local connected />);
  const slot = container.querySelector(".edit-actions-slot");
  expect(slot).toBeTruthy();
  expect(slot.firstElementChild.hasAttribute("inert")).toBe(true);
  fireEvent.change(screen.getByLabelText("Group name"), {
    target: { value: "Changed" },
  });
  expect(container.querySelector(".edit-actions-slot")).toBe(slot);
  expect(slot.firstElementChild.hasAttribute("inert")).toBe(false);
});
