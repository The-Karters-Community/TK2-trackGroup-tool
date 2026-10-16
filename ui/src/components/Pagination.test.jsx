import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PagedCollection } from "./Pagination.jsx";
import { groupPack, unpackGroups } from "./groupPack.js";
afterEach(cleanup);
it("limits a thousand items, changes page size and resets after filtering", () => {
  const all = Array.from({ length: 1000 }, (_, i) => i);
  const draw = (items, scope) => (
    <PagedCollection items={items} scope={scope} label="Tracks">
      {(shown) => <div data-testid="items">{shown.join(",")}</div>}
    </PagedCollection>
  );
  const { rerender } = render(draw(all, "all"));
  expect(screen.getByTestId("items").textContent.split(",")).toHaveLength(24);
  fireEvent.click(screen.getByRole("button", { name: "Next Tracks page" }));
  expect(screen.getByTestId("items").textContent.startsWith("24,")).toBe(true);
  fireEvent.change(screen.getByLabelText("Tracks per page"), {
    target: { value: "48" },
  });
  expect(screen.getByTestId("items").textContent.split(",")).toHaveLength(48);
  rerender(draw([999], "filtered"));
  expect(screen.getByTestId("items").textContent).toBe("999");
  expect(screen.getByLabelText("Tracks page").value).toBe("1");
});
it("recognizes multi-group packs and rejects empty or malformed packs", () => {
  const groups = [
    { name: "One", tracks: [] },
    { name: "Two", tracks: [] },
  ];
  expect(unpackGroups(groupPack(groups))).toEqual(groups);
  expect(unpackGroups(groups[0])).toEqual([groups[0]]);
  expect(() => unpackGroups(groupPack([]))).toThrow();
  expect(() =>
    unpackGroups({ format: "tk2-track-groups", version: 2 }),
  ).toThrow();
});
