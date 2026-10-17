import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import AppearanceChoice from "./AppearanceChoice.jsx";
afterEach(cleanup);
it("keeps a favorite star on the selected single-variant tile at every step", () => {
  const library = {
    observe: vi.fn(),
    migrateFavorites: vi.fn(),
    favorite: () => false,
    used: vi.fn(),
    toggle: vi.fn(),
    data: {},
  };
  const data = { iCharacterSkinMaterialID_Modded: 42 };
  render(
    <AppearanceChoice
      label="Character"
      kind="characters"
      field="iCharacterSkinMaterialID_Modded"
      data={data}
      presets={[{ data }]}
      appearance={{
        items: {
          characters: {
            42: {
              name: "Bobby",
              label: "Bobby · Blue · Default",
              entity: "Bobby",
              skin: "Blue",
              variant: "Default",
            },
          },
        },
      }}
      library={library}
      onChange={vi.fn()}
    />,
  );
  const favorite = screen.getByRole("button", {
    name: "Favorite Bobby · Blue · Default",
  });
  expect(favorite.closest(".appearance-choice")).toBeTruthy();
  expect(document.querySelector(".selected-appearance")).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: /^Bobby$/, pressed: true }),
  );
  expect(
    screen.getByRole("button", { name: "Variant: Default", pressed: true }),
  ).toBeTruthy();
  expect(
    screen.getByText("One appearance available. Ready to save."),
  ).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Favorite Bobby · Blue · Default" }),
  );
  expect(library.toggle).toHaveBeenCalledWith("appearance:characters:42");
});
