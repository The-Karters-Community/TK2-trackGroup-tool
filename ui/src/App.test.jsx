import React from "react";
import { afterEach, expect, test, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import App from "./App.jsx";
import { api } from "./api.js";

vi.mock("./api.js", () => ({ api: vi.fn(), download: vi.fn() }));
HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute("open", "");
};
HTMLDialogElement.prototype.close = function () {
  this.removeAttribute("open");
};
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

test("import review stays visible through completion and opens the saved local group", async () => {
  const group = {
    format: "tk2-track-group",
    version: 1,
    revision: 1,
    id: "new",
    name: "New collection",
    category: "speedrun",
    tracks: [
      { kind: "workshop", modId: "one", workshopId: "123", title: "Track One" },
    ],
  };
  let state = {
    version: "0.1.0-dev",
    steamConnected: true,
    syncError: "",
    groups: [group],
    localGroups: [],
    trackStatus: {},
  };
  api.mockImplementation(async (action) => {
    if (action === "state") return state;
    if (action === "preview")
      state = {
        ...state,
        job: {
          id: "preview",
          action,
          state: "completed",
          message: "Review",
          result: {
            preview: {
              group,
              destinationName: group.name,
              token: "token",
              outcome: "added",
              missingSubscriptions: ["123"],
              pendingDownloads: ["123"],
              trackStatus: { 123: { subscribed: false, ready: false } },
            },
          },
        },
      };
    if (action === "import")
      state = {
        ...state,
        job: {
          id: "import",
          action,
          state: "running",
          phase: "downloading",
          message: "Downloading Track One",
          completed: 0,
          total: 1,
          items: {
            123: { subscribed: true, ready: false, downloaded: 30, total: 100 },
          },
        },
      };
    return { message: "Operation started." };
  });
  render(<App />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Tracks", exact: true }),
  );
  expect(
    screen
      .getByRole("button", { name: "Discover groups" })
      .getAttribute("aria-current"),
  ).toBe("page");
  expect(screen.queryByRole("button", { name: "Export selected" })).toBeNull();
  expect(screen.queryByRole("checkbox")).toBeNull();
  fireEvent.click(await screen.findByText(group.name));
  fireEvent.click(screen.getByRole("button", { name: "Preview import" }));
  await screen.findByText("Review before adding to My track groups");
  fireEvent.click(
    screen.getByRole("button", { name: "Add to My track groups" }),
  );
  await screen.findByText("Downloading · 30%");
  expect(
    within(screen.getByRole("dialog")).getByText("Track One"),
  ).toBeTruthy();
  state = {
    ...state,
    localGroups: [{ ...group, exportReady: true }],
    job: {
      ...state.job,
      state: "completed",
      message: "Group added.",
      result: { groupId: group.id },
    },
  };
  fireEvent.click(
    await screen.findByRole("button", { name: "View in My track groups" }),
  );
  await waitFor(() => expect(screen.getByLabelText("Group name")).toBeTruthy());
  expect(
    screen.getByRole("button", { name: "Import group file" }),
  ).toBeTruthy();
});

test("success messages stay beyond five seconds and expire after ten and credits have no repository link", async () => {
  let state = {
    version: "0.1.0-dev",
    groups: [],
    localGroups: [],
    steamConnected: true,
    syncError: "",
    trackStatus: {},
  };
  api.mockImplementation(async (action) => {
    if (action === "refresh")
      state = {
        ...state,
        job: {
          id: "refresh",
          action,
          state: "completed",
          message: "Steam refreshed. Known Workshop tracks are installed.",
        },
      };
    return action === "state" ? state : { message: "Started" };
  });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Refresh Steam" }));
  await screen.findByText(
    "Steam refreshed. Known Workshop tracks are installed.",
  );
  expect(screen.getByText("Made by DarkSlayer")).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Project & help" })).toBeNull();
  await new Promise((resolve) => setTimeout(resolve, 6000));
  expect(
    screen.getByText("Steam refreshed. Known Workshop tracks are installed."),
  ).toBeTruthy();
  await waitFor(
    () =>
      expect(
        screen.queryByText(
          "Steam refreshed. Known Workshop tracks are installed.",
        ),
      ).toBeNull(),
    { timeout: 11500 },
  );
}, 13000);
