import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { stringify } from "lossless-json";
import WebApp from "./WebApp.jsx";
import { catalog } from "./catalog.js";
import { encodeLength, readProfile } from "./profile.js";
import { download } from "./download.js";

vi.mock("./download.js", () => ({ download: vi.fn() }));
const filename = "1PTK_PlayerData_v19tpp0_bt0";
const official = catalog.find((g) =>
  g.tracks.every((t) => t.kind === "official"),
);
function fixture() {
  const data = {
    untouched: "preserve",
    account: 123,
    ItemsGroupDefinedContainers: [
      {
        GroupDefinition: {
          UniqueID: "builtin",
          Index: 0,
          Name: "Official",
          Type: 0,
          SubType: 0,
          IsDefault: true,
        },
        groupItems: official.tracks.map((t) => ({
          configID: t.configId,
          modHashID: "",
          iPresetID: -1,
        })),
      },
    ],
  };
  return new Uint8Array(
    ["synthetic presets", "separator", JSON.stringify(data)].flatMap((text) => {
      const bytes = new TextEncoder().encode(text);
      return [...encodeLength(bytes.length), ...bytes];
    }),
  );
}
async function openSave() {
  const bytes = fixture();
  fireEvent.change(screen.getByLabelText("Choose game save file"), {
    target: {
      files: [
        {
          name: filename,
          size: bytes.length,
          arrayBuffer: async () => bytes.buffer,
        },
      ],
    },
  });
  await waitFor(() =>
    expect(screen.getByRole("heading", { name: "My groups" })).toBeTruthy(),
  );
  return bytes;
}
async function addOfficial() {
  fireEvent.click(
    screen.getByRole("button", { name: "Browse groups", exact: true }),
  );
  fireEvent.click(screen.getByRole("button", { name: /Official 16-Track GP/ }));
  fireEvent.click(
    screen.getByRole("button", { name: "Review save update", exact: true }),
  );
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
  fireEvent.click(
    screen.getByRole("button", { name: "Add to edited save", exact: true }),
  );
}
beforeEach(() => {
  vi.stubGlobal("PointerEvent", MouseEvent);
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Browser edition must not call a backend.");
    }),
  );
  vi.mocked(download).mockClear();
});

it("outside dismissal retains a dirty browser editor until discard is confirmed", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<WebApp />);
  await openSave();
  await addOfficial();
  fireEvent.click(screen.getByRole("button", { name: /Official 16-Track GP/ }));
  const dialog = screen.getByRole("dialog");
  vi.spyOn(dialog, "getBoundingClientRect").mockReturnValue({
    left: 100,
    right: 400,
    top: 100,
    bottom: 500,
  });
  fireEvent.change(
    within(dialog).getByRole("textbox", { name: "Group name" }),
    { target: { value: "Keep this draft" } },
  );
  function backdropClick() {
    fireEvent.pointerDown(dialog, { button: 0, clientX: 50, clientY: 200 });
    fireEvent.click(dialog, { clientX: 50, clientY: 200 });
  }
  backdropClick();
  expect(confirm).toHaveBeenCalledWith(
    "Discard the name or track order changes in this panel?",
  );
  expect(screen.getByRole("textbox", { name: "Group name" }).value).toBe(
    "Keep this draft",
  );
  confirm.mockReturnValue(true);
  backdropClick();
  expect(screen.queryByRole("dialog")).toBeNull();
  confirm.mockRestore();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("browser edition", () => {
  it("browses the static catalog, filters and exports with no server", () => {
    render(<WebApp />);
    expect(
      screen.getAllByRole("button", { name: /Download or add/ }),
    ).toHaveLength(4);
    fireEvent.change(
      screen.getByRole("textbox", { name: "Search track groups" }),
      { target: { value: "Scuba Driving" } },
    );
    expect(
      screen.getAllByRole("button", { name: /Download or add/ }),
    ).toHaveLength(1);
    fireEvent.click(
      screen.getByRole("button", { name: /Official 16-Track GP/ }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Download group file", exact: true }),
    );
    const payload = JSON.parse(vi.mocked(download).mock.calls[0][1]);
    expect(payload.id).toBe(official.id);
    expect(payload).not.toHaveProperty("category");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("adds a group in memory, requires a backup and explicit manual-import acknowledgement", async () => {
    render(<WebApp />);
    const original = await openSave();
    await addOfficial();
    const saveButton = screen.getByRole("button", {
      name: "Download edited save",
      exact: true,
    });
    expect(saveButton.disabled).toBe(true);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Download original backup",
        exact: true,
      }),
    );
    expect(download).toHaveBeenCalledWith(`${filename}.backup`, original);
    expect(saveButton.disabled).toBe(true);
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Game closed · Steam Cloud disabled for this game",
      }),
    );
    expect(saveButton.disabled).toBe(false);
    fireEvent.click(saveButton);
    const [name, bytes] = vi.mocked(download).mock.calls[1];
    expect(name).toBe(filename);
    const result = readProfile(bytes);
    expect(result.spans.slice(0, 2)).toEqual(
      readProfile(original).spans.slice(0, 2),
    );
    expect(result.data.untouched).toBe("preserve");
    expect(result.data.ItemsGroupDefinedContainers).toHaveLength(2);
    expect(
      result.data.ItemsGroupDefinedContainers[1].GroupDefinition.Name,
    ).toBe(official.name);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("renames and reorders in the same panel, then blocks duplicate imports", async () => {
    render(<WebApp />);
    await openSave();
    await addOfficial();
    fireEvent.click(
      screen.getByRole("button", { name: /Official 16-Track GP/ }),
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.change(
      within(dialog).getByRole("textbox", { name: "Group name" }),
      { target: { value: "My Unicode GP — 雪" } },
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Move Gauntlet Run down" }),
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );
    await waitFor(() =>
      expect(
        within(dialog).getByRole("heading", { name: "My Unicode GP — 雪" }),
      ).toBeTruthy(),
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Download group file" }),
    );
    const exported = JSON.parse(vi.mocked(download).mock.calls[0][1]);
    expect(exported.tracks[0].configId).toBe(official.tracks[1].configId);
    expect(exported.tracks[1].configId).toBe(official.tracks[0].configId);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Close group details" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Browse groups", exact: true }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Official 16-Track GP/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Review save update" }));
    const update = screen.getByRole("button", { name: "Update edited save" });
    expect(update.disabled).toBe(true);
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Replace this group's name and track order",
      }),
    );
    fireEvent.click(update);
    fireEvent.click(
      screen.getByRole("button", { name: "Browse groups", exact: true }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Official 16-Track GP/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Review save update" }));
    expect(
      screen.getByText("This group already matches your selected save."),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Update edited save" }).disabled,
    ).toBe(true);
    expect(stringify(exported)).not.toContain("account");
  });
  it("keeps opened group files pending until a destination save is selected", async () => {
    render(<WebApp />);
    fireEvent.click(
      screen.getByRole("button", { name: "My groups", exact: true }),
    );
    const text = JSON.stringify(official);
    // Exported files contain only portable fields, not catalog category metadata.
    const portable = JSON.parse(text);
    delete portable.category;
    fireEvent.change(screen.getByLabelText("Choose shared group file"), {
      target: {
        files: [
          { size: text.length, text: async () => JSON.stringify(portable) },
        ],
      },
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Choose destination save" }),
      ).toBeTruthy(),
    );
    const bytes = fixture();
    fireEvent.change(screen.getByLabelText("Choose game save file"), {
      target: {
        files: [
          {
            name: filename,
            size: bytes.length,
            arrayBuffer: async () => bytes.buffer,
          },
        ],
      },
    });
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    expect(
      screen.getByRole("button", { name: "Add to edited save" }),
    ).toBeTruthy();
  });
});
