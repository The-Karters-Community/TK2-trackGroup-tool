import { it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import GroupEditor from "./GroupEditor.jsx";
afterEach(cleanup);

it("creates mixed groups from selected downloaded tracks in the edited order", () => {
  const submit = vi.fn();
  const tracks = [
    { kind: "official", configId: 267992, title: "Gauntlet Run", ready: true },
    {
      kind: "workshop",
      workshopId: "123",
      modId: "one",
      title: "Workshop One",
      ready: true,
      image: "https://example.test/image.png",
    },
    {
      kind: "workshop",
      workshopId: "456",
      modId: "two",
      title: "Pending Two",
      ready: false,
      subscribed: true,
    },
  ];
  render(<GroupEditor tracks={tracks} onSubmit={submit} onCancel={vi.fn()} />);
  expect(
    screen.queryByRole("checkbox", { name: "Select Pending Two" }),
  ).toBeNull();
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Select Workshop One" }),
  );
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Select Gauntlet Run" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Move Gauntlet Run up" }));
  fireEvent.change(screen.getByLabelText("Group name"), {
    target: { value: "Mixed group" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Review changes" }));
  expect(submit).toHaveBeenCalledWith("create", {
    name: "Mixed group",
    tracks: [
      { kind: "official", configId: 267992, title: "Gauntlet Run" },
      {
        kind: "workshop",
        workshopId: "123",
        modId: "one",
        title: "Workshop One",
      },
    ],
  });
  fireEvent.click(screen.getByRole("button", { name: "All known" }));
  expect(screen.getByText("Subscribed · download pending")).toBeTruthy();
});
