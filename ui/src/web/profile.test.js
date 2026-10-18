import { describe, expect, it } from "vitest";
import { parse, stringify } from "lossless-json";
import {
  customGroups,
  editGroup,
  encodeLength,
  importGroup,
  portableGroup,
  readProfile,
  reviewImport,
  serializeProfile,
  validateGroup,
} from "./profile.js";

const id = "58d56a74-7974-42f0-92ef-34f6b2361966";
const encoder = new TextEncoder();
const decoder = new TextDecoder();
export function fixture(
  third = '{"account":76561198123456789,"decimal":1.234567890123456789,"unknown":[1,2],"ItemsGroupDefinedContainers":[]}',
) {
  const records = ["private — 雪", "second record\n", third];
  return new Uint8Array(
    records.flatMap((text) => {
      const bytes = encoder.encode(text);
      return [...encodeLength(bytes.length), ...bytes];
    }),
  );
}
const group = () => ({
  format: "tk2-track-group",
  version: 1,
  id,
  revision: 1,
  name: "Suomi — 雪",
  tracks: [
    { kind: "official", configId: 44 },
    { kind: "workshop", modId: "example", workshopId: "3263970719" },
  ],
});
function supported() {
  const p = readProfile(fixture());
  p.data.ItemsGroupDefinedContainers.push({
    groupItems: [{ configID: 44, modHashID: "", iPresetID: -1 }],
    GroupDefinition: {
      UniqueID: "builtin",
      Name: "Official",
      IsDefault: true,
      Type: 0,
      SubType: 0,
      Index: 0,
    },
  });
  return readProfile(serializeProfile(p, p.data));
}

describe("browser save codec", () => {
  it("accepts numeric profile generations without accepting backup paths", () => {
    const name = "1PTK_PlayerData_v999tpp2_bt3";
    expect(readProfile(fixture(), name).original).toEqual(fixture());
    for (const invalid of [
      name + ".bak",
      "../" + name,
      "1PTK_PlayerData_future",
    ]) {
      expect(() => readProfile(fixture(), invalid)).toThrow();
    }
  });
  it("round trips unchanged bytes and preserves numeric tokens", () => {
    const bytes = fixture();
    const p = readProfile(bytes);
    expect(p.original).toEqual(bytes);
    expect(serializeProfile(p, p.data)).toEqual(bytes);
    expect(stringify(p.data)).toContain("76561198123456789");
    expect(stringify(p.data)).toContain("1.234567890123456789");
  });
  it("preserves computed built-in groups with absent or null item arrays", () => {
    const p = supported();
    p.data.ItemsGroupDefinedContainers.unshift(
      {
        GroupDefinition: {
          UniqueID: "computed",
          Name: "Built-in",
          IsDefault: true,
          Type: 0,
          SubType: 0,
          Index: 2,
        },
      },
      {
        groupItems: null,
        GroupDefinition: {
          UniqueID: "other",
          Name: "Other",
          IsDefault: true,
          Type: 1,
          SubType: 4,
          Index: 0,
        },
      },
    );
    const original = readProfile(fixture(stringify(p.data)));
    const after = readProfile(importGroup(original, group()).bytes);
    expect(stringify(after.data.ItemsGroupDefinedContainers.slice(0, 2))).toBe(
      stringify(original.data.ItemsGroupDefinedContainers.slice(0, 2)),
    );
  });
  it("adds Unicode mixed groups while preserving the two records, built-ins and unrelated data", () => {
    const p = supported();
    const result = importGroup(p, group());
    const after = readProfile(result.bytes);
    expect(result.action).toBe("added");
    expect(after.spans.slice(0, 2)).toEqual(p.spans.slice(0, 2));
    expect(stringify(after.data.account)).toBe("76561198123456789");
    expect(stringify(after.data.decimal)).toBe("1.234567890123456789");
    expect(stringify(after.data.ItemsGroupDefinedContainers[0])).toBe(
      stringify(p.data.ItemsGroupDefinedContainers[0]),
    );
    expect(customGroups(after)[0].name).toBe(group().name);
    expect(customGroups(after)[0].tracks.map((t) => t.kind)).toEqual([
      "official",
      "workshop",
    ]);
    expect(p.data.ItemsGroupDefinedContainers).toHaveLength(1);
  });
  it("duplicates are byte-identical and updates require confirmation, preserving position", () => {
    const initial = importGroup(supported(), group()).bytes;
    const p = readProfile(initial);
    expect(importGroup(p, group()).bytes).toEqual(initial);
    const change = group();
    change.tracks.reverse();
    expect(() => importGroup(p, change)).toThrow("confirm");
    const after = readProfile(
      importGroup(p, change, { confirmUpdate: true }).bytes,
    );
    expect(
      Number(after.data.ItemsGroupDefinedContainers[1].GroupDefinition.Index),
    ).toBe(1);
    expect(customGroups(after)[0].tracks[0].kind).toBe("workshop");
  });
  it("same-name update is explicit and retains the local ID; otherwise adds a named copy", () => {
    const p = readProfile(importGroup(supported(), group()).bytes);
    const other = {
      ...group(),
      id: "2609e34d-a412-43a0-9bbc-4026a9ffb000",
      tracks: group().tracks.slice(0, 1),
    };
    expect(reviewImport(p, other).sameName).toHaveLength(1);
    expect(() => importGroup(p, other, { targetId: id })).toThrow("confirm");
    const updated = readProfile(
      importGroup(p, other, { targetId: id, confirmUpdate: true }).bytes,
    );
    expect(customGroups(updated)).toHaveLength(1);
    expect(customGroups(updated)[0].id).toBe(id);
    const added = readProfile(importGroup(p, other).bytes);
    expect(customGroups(added)[1].name).toBe(`${other.name} (2)`);
  });
  it("edits preserve full native item fields and presets", () => {
    const p = readProfile(importGroup(supported(), group()).bytes);
    p.data.ItemsGroupDefinedContainers[1].groupItems[0].iPresetID = 17;
    p.data.ItemsGroupDefinedContainers[1].groupItems[0].future = "preserve";
    const original = readProfile(serializeProfile(p, p.data));
    const after = readProfile(
      editGroup(original, { id, name: "新しい名前", order: [1, 0] }),
    );
    expect(after.data.ItemsGroupDefinedContainers[1].groupItems[1].future).toBe(
      "preserve",
    );
    expect(
      Number(after.data.ItemsGroupDefinedContainers[1].groupItems[1].iPresetID),
    ).toBe(17);
    expect(() =>
      editGroup(original, { id, name: "Official", order: [1, 0] }),
    ).toThrow("already");
    expect(() =>
      editGroup(original, { id, name: "Valid", order: [0, 0] }),
    ).toThrow("once");
  });
  it("rejects unknown official tracks and protected replacement", () => {
    expect(() => reviewImport(readProfile(fixture()), group())).toThrow(
      "built-in",
    );
    const p = supported();
    p.data.ItemsGroupDefinedContainers[0].GroupDefinition.UniqueID = id;
    expect(() => reviewImport(p, group())).toThrow("protected");
    expect(() => editGroup(p, { id, name: "Changed", order: [0] })).toThrow(
      "modifiable",
    );
  });
  it("rejects malformed, unsupported, ambiguous and oversized saves", () => {
    const bytes = fixture();
    for (const input of [
      new Uint8Array(),
      bytes.slice(0, -1),
      new Uint8Array([...bytes, 1]),
      new Uint8Array([255, 255, 255, 255, 127]),
      fixture("{}"),
      fixture('{"ItemsGroupDefinedContainers":[],"x":1,"x":2}'),
    ])
      expect(() => readProfile(input)).toThrow();
    expect(() => readProfile(bytes, "wrong-file.backup")).toThrow("original");
    const p = supported();
    p.data.ItemsGroupDefinedContainers.push(
      p.data.ItemsGroupDefinedContainers[0],
    );
    expect(() => readProfile(fixture(stringify(p.data)))).toThrow("duplicate");
    const badUtf8 = bytes.slice();
    badUtf8[1] = 255;
    expect(() => readProfile(badUtf8)).toThrow();
    expect(() => encodeLength(33 * 1024 * 1024)).toThrow();
    expect(decoder.decode(bytes)).toContain("private");
  });
  it("exports only group metadata and blocks unresolved Workshop IDs", () => {
    const p = readProfile(importGroup(supported(), group()).bytes);
    const unknown = customGroups(p)[0];
    expect(() => portableGroup(unknown)).toThrow("decimal");
    const known = new Map([
      ["example", { workshopId: "3263970719", title: "Example" }],
    ]);
    const exported = portableGroup(customGroups(p, known)[0]);
    expect(Object.keys(exported)).toEqual([
      "format",
      "version",
      "id",
      "revision",
      "name",
      "description",
      "tracks",
    ]);
    expect(stringify(exported)).not.toContain("account");
  });
  it.each([
    (g) => ({ ...g, account: "secret" }),
    (g) => ({ ...g, tracks: [...g.tracks, g.tracks[0]] }),
    (g) => ({ ...g, tracks: [{ ...g.tracks[1], workshopId: 3263970719 }] }),
    (g) => ({ ...g, tracks: [{ ...g.tracks[1], workshopId: "03263970719" }] }),
    (g) => ({
      ...g,
      tracks: [{ ...g.tracks[1], workshopId: "18446744073709551616" }],
    }),
    (g) => ({ ...g, tracks: [{ kind: "official", configId: 2 ** 31 }] }),
    (g) => ({ ...g, name: "bad\nname" }),
  ])("rejects malformed shared groups", (mutate) =>
    expect(() => validateGroup(mutate(group()))).toThrow(),
  );
});
