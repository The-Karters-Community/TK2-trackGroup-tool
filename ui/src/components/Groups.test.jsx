import React from "react";
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import Library from "../pages/Library.jsx";
import GroupDetails from "./GroupDetails.jsx";

afterEach(cleanup);
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
      state={{ groups: [group], localGroups: [], steamConnected: true }}
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
