import { it, expect, vi } from "vitest";
import { folderFiles, inspectFiles, rememberedFolder } from "./localFolder.js";
it("finds one save and both preview modes with one granted game folder", async () => {
  const file = (name) => ({
    kind: "file",
    name,
    getFile: async () => ({ name, size: 50 }),
  });
  const folder = {
    async *values() {
      yield file("1009PTK_PlayerData_v19tpp0_bt0");
      yield file("progress.txt");
      yield {
        kind: "directory",
        name: "PresetIcons",
        async *values() {
          yield file("Icon_PresetID_100.png");
          yield file("Icon_PresetID_100_Modded.png");
          yield file("UploadPasswordNotShared.txt");
        },
      };
      yield {
        kind: "directory",
        name: "Mods",
        values: vi.fn(() => {
          throw new Error("Never read mods here");
        }),
      };
    },
  };
  const result = inspectFiles(await folderFiles(folder));
  expect(result.saves).toHaveLength(1);
  expect(result.previews.map((p) => p.view)).toEqual(["original", "modded"]);
});
it("keeps multiple profile choices explicit and rejects oversized pictures", () => {
  const result = inspectFiles([
    { name: "1PTK_PlayerData_v19tpp0_bt0", size: 1 },
    { name: "2PTK_PlayerData_v19tpp0_bt0", size: 1 },
    { name: "Icon_PresetID_100.png", size: 5 * 1024 * 1024 },
  ]);
  expect(result.saves).toHaveLength(2);
  expect(result.previews).toHaveLength(0);
});
it("gracefully skips remembered access if browser storage is unavailable", async () => {
  expect(await rememberedFolder()).toBeNull();
});
