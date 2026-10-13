import { describe, it, expect } from "vitest";
import { parse, stringify } from "lossless-json";
import { readProfile, encodeLength } from "../web/profile.js";
import {
  applyPresetChange,
  cosmetic,
  exportPresets,
  presetState,
  validatePack,
} from "./model.js";

import { fixture, groupId } from "./test-fixture.js";
const open = (bytes) => readProfile(bytes, "1PTK_PlayerData_v19tpp0_bt0");
describe("Portable presets", () => {
  it("keeps distinct identical presets distinct and repeated imports unchanged", () => {
    const p = open(fixture());
    const q = open(applyPresetChange(p, { mode: "duplicate", presetId: 100 }));
    const source = open(
      applyPresetChange(q, {
        mode: "group",
        groupId,
        name: "Sonic",
        members: [102, 100],
      }),
    );
    const pack = exportPresets(presetState(source), [], [groupId]);
    const after = open(
      applyPresetChange(p, { mode: "import", pack, confirmUpdate: true }),
    );
    expect(presetState(after).presets).toHaveLength(2);
    expect(presetState(after).groups[0].members).toEqual([102, 100]);
    expect(
      applyPresetChange(after, { mode: "import", pack, confirmUpdate: true }),
    ).toEqual(after.original);
  });
  it("exports selected groups without private data or native extensions", () => {
    const pack = exportPresets(presetState(open(fixture())), [], [groupId]);
    expect(pack.groups[0].name).toBe("Sönic");
    expect(JSON.stringify(pack)).not.toMatch(/account|decimal|future/);
  });
  it("duplicates outside quick-creation IDs and keeps second and third records byte-identical", () => {
    const p = open(fixture());
    const after = open(
      applyPresetChange(p, { mode: "duplicate", presetId: 100 }),
    );
    expect(presetState(after).presets.map((p) => p.id)).toEqual([100, 102]);
    expect(after.spans.slice(1)).toEqual(p.spans.slice(1));
  });
  it("remaps colliding IDs, deduplicates shared presets and requires group-update confirmation", () => {
    const p = open(fixture());
    const pack = exportPresets(presetState(p), [100], []);
    pack.presets[0].data.iVehicleMaterialID = 8;
    pack.groups = ["2", "3"].map((d) => ({
      id: `${d.repeat(8)}-${d.repeat(4)}-${d.repeat(4)}-${d.repeat(4)}-${d.repeat(12)}`,
      name: d,
      presets: ["preset:100"],
    }));
    const after = open(applyPresetChange(p, { mode: "import", pack }));
    expect(
      presetState(after)
        .groups.slice(-2)
        .map((g) => g.members),
    ).toEqual([[102], [102]]);
    expect(after.spans[1]).toEqual(p.spans[1]);
    expect(after.data.account.toString()).toBe("76561198123456789");
    expect(after.data.decimal.toString()).toBe("1.234567890123456789");
    expect(() => applyPresetChange(after, { mode: "import", pack })).toThrow(
      /Confirm/,
    );
    expect(
      applyPresetChange(after, { mode: "import", pack, confirmUpdate: true }),
    ).toEqual(after.original);
  });
  it("edits without dropping future fields or packed sticker settings", () => {
    const p = open(fixture());
    const data = presetState(p).presets[0].data;
    data.iVehicleMaterialID = 22;
    const after = open(
      applyPresetChange(p, { mode: "preset", presetId: 100, data }),
    );
    const native = parse(after.records[0]);
    expect(Number(native[0].futureNativeField.keep)).toBe(42);
    expect(Number(native[0].stickersData[0].futureStickerField)).toBe(6);
    expect(after.spans.slice(1)).toEqual(p.spans.slice(1));
  });
  it("rejects malformed, private and fake-number fields", () => {
    const pack = exportPresets(presetState(open(fixture())), [100], []);
    expect(() => validatePack({ ...pack, credentials: "secret" })).toThrow();
    expect(() =>
      cosmetic(
        {
          ...pack.presets[0].data,
          iVehicleMaterialID: { isLosslessNumber: true, value: "2" },
        },
        true,
      ),
    ).toThrow();
    expect(() =>
      cosmetic({ ...pack.presets[0].data, stickersData: [] }, true),
    ).toThrow();
  });
  it("preserves order and updates only preset group membership", () => {
    const p = open(
      applyPresetChange(open(fixture()), { mode: "duplicate", presetId: 100 }),
    );
    const after = open(
      applyPresetChange(p, {
        mode: "group",
        groupId,
        name: "新しい",
        members: [102, 100],
      }),
    );
    expect(presetState(after).groups[0].members).toEqual([102, 100]);
    expect(after.spans[0]).toEqual(p.spans[0]);
    expect(after.data.ItemsGroupDefinedContainers.slice(0, 2)).toEqual(
      p.data.ItemsGroupDefinedContainers.slice(0, 2),
    );
    const ordered = open(
      applyPresetChange(after, { mode: "order", order: [102, 100] }),
    );
    expect(presetState(ordered).presets.map((p) => p.id)).toEqual([102, 100]);
    expect(() =>
      applyPresetChange(p, { mode: "order", order: [100, 100] }),
    ).toThrow();
  });
  it("guards protected groups and keeps at least one preset", () => {
    const p = open(fixture());
    expect(() =>
      applyPresetChange(p, { mode: "delete-group", groupId: "builtin" }),
    ).toThrow();
    expect(() =>
      applyPresetChange(p, { mode: "delete", presetId: 100 }),
    ).toThrow();
  });
});
