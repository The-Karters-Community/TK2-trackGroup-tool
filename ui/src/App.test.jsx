import React from "react";
import { afterEach, expect, test, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import App from "./App.jsx";
import { api } from "./api.js";

vi.mock("./api.js", () => ({ api: vi.fn(), download: vi.fn() }));
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
  fireEvent.click(await screen.findByText(group.name));
  fireEvent.click(screen.getByRole("button", { name: "Preview import" }));
  await screen.findByText("Review before adding to My groups");
  fireEvent.click(screen.getByRole("button", { name: "Add to My groups" }));
  await screen.findByText("Downloading · 30%");
  expect(screen.getByText("Track One")).toBeTruthy();
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
    await screen.findByRole("button", { name: "View in My groups" }),
  );
  await waitFor(() => expect(screen.getByLabelText("Group name")).toBeTruthy());
  expect(
    screen.getByRole("button", { name: "Import group file" }),
  ).toBeTruthy();
});
