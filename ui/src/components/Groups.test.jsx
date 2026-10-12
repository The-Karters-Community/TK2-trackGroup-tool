import React from "react";
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import Library from "../pages/Library.jsx";
import GroupDetails from "./GroupDetails.jsx";
import ImportReview from "./ImportReview.jsx";
import GroupEditor from "./GroupEditor.jsx";

afterEach(cleanup);
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
test("catalog categories filter groups and file importing is only in My groups", () => {
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
  expect(screen.getByText("Subscribe and download")).toBeTruthy();
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
  expect(screen.queryByRole("button", { name: "Add to My groups" })).toBeNull();
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
    screen.getByRole("button", { name: "View in My groups" }),
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
