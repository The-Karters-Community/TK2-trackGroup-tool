import { it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import Tracks from "./Tracks.jsx";
afterEach(cleanup);

it("opens selected tracks in the group builder without duplicating Steam actions", () => {
  const onCreate = vi.fn();
  const track = {
    kind: "official",
    configId: 267992,
    title: "Gauntlet Run",
    ready: true,
  };
  render(
    <Tracks
      state={{ tracks: [track], trackSummary: { downloaded: 107 } }}
      onCreate={onCreate}
    />,
  );
  expect(screen.getByRole("heading", { name: "My tracks" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Refresh Steam" })).toBeNull();
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Select Gauntlet Run" }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Create group with selected tracks" }),
  );
  expect(onCreate).toHaveBeenCalledWith([
    { kind: "official", configId: 267992, title: "Gauntlet Run" },
  ]);
});
