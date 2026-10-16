import { expect, it } from "vitest";
import { sortEntries } from "./libraryState.js";
it("sorts using installed dates and Garage usage without changing the custom order", () => {
  const all = [
    { id: "a", name: "Zed", added: 100 },
    { id: "b", name: "Amy", added: 200 },
    { id: "c", name: "Bob", added: 300 },
  ];
  const settings = {
    key: (e) => e.id,
    name: (e) => e.name,
    added: (e) => e.added,
    activity: { a: { last: 3, count: 1 }, b: { last: 2, count: 5 } },
    favorites: ["c"],
  };
  const order = (s) =>
    sortEntries(all, s, settings)
      .map((e) => e.id)
      .join("");
  expect(order("custom")).toBe("abc");
  expect(order("alphabetical")).toBe("bca");
  expect(order("newest")).toBe("cba");
  expect(order("oldest")).toBe("abc");
  expect(order("recent")).toBe("abc");
  expect(order("popular")).toBe("bac");
  expect(order("favorites")).toBe("cba");
  expect(all.map((e) => e.id).join("")).toBe("abc");
});
