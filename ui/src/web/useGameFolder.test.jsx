import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { renderHook, act, waitFor, cleanup } from "@testing-library/react";
import useGameFolder from "./useGameFolder.js";
import { rememberedFolder, folderFiles } from "./localFolder.js";
import { fixture } from "../presets/test-fixture.js";
vi.mock("./localFolder.js", async (importOriginal) => ({
  ...(await importOriginal()),
  rememberedFolder: vi.fn(),
  folderFiles: vi.fn(),
}));
const saved = () => {
  const bytes = fixture();
  return {
    name: "1009PTK_PlayerData_v19tpp0_bt0",
    size: bytes.length,
    arrayBuffer: async () => bytes.buffer,
  };
};
beforeEach(() => {
  rememberedFolder.mockResolvedValue(null);
  folderFiles.mockResolvedValue([saved()]);
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});
it("automatically reloads a remembered granted directory without requesting access", async () => {
  const handle = {
    queryPermission: vi.fn().mockResolvedValue("granted"),
    requestPermission: vi.fn(),
  };
  rememberedFolder.mockResolvedValue(handle);
  const onConnected = vi.fn();
  renderHook(() =>
    useGameFolder({ dirty: false, onConnected, onError: vi.fn() }),
  );
  await waitFor(() => expect(onConnected).toHaveBeenCalled());
  expect(folderFiles).toHaveBeenCalledWith(handle);
  expect(handle.requestPermission).not.toHaveBeenCalled();
  expect(onConnected.mock.calls[0][0].next.records).toBeTruthy();
});
it("waits for a user click if remembered permission expired", async () => {
  const handle = {
    queryPermission: vi.fn().mockResolvedValue("prompt"),
    requestPermission: vi.fn().mockResolvedValue("granted"),
  };
  rememberedFolder.mockResolvedValue(handle);
  vi.stubGlobal("showDirectoryPicker", vi.fn());
  const onConnected = vi.fn();
  const { result } = renderHook(() =>
    useGameFolder({ dirty: false, onConnected, onError: vi.fn() }),
  );
  await waitFor(() => expect(result.current.needsPermission).toBe(true));
  expect(folderFiles).not.toHaveBeenCalled();
  expect(handle.requestPermission).not.toHaveBeenCalled();
  await act(() => result.current.connectFolder(true));
  expect(onConnected).toHaveBeenCalledTimes(1);
  expect(handle.requestPermission).toHaveBeenCalledWith({ mode: "read" });
});
it("retains dirty edits when the user cancels replacing them", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(false);
  const onConnected = vi.fn();
  const { result } = renderHook(() =>
    useGameFolder({ dirty: true, onConnected, onError: vi.fn() }),
  );
  await act(() => result.current.applyFolder([saved()]));
  expect(onConnected).not.toHaveBeenCalled();
  window.confirm.mockRestore();
});
it("requires an explicit choice when more than one profile is present", async () => {
  const onConnected = vi.fn();
  const { result } = renderHook(() =>
    useGameFolder({ dirty: false, onConnected, onError: vi.fn() }),
  );
  const first = saved(),
    second = { ...saved(), name: "2000PTK_PlayerData_v19tpp0_bt0" };
  await act(() => result.current.applyFolder([first, second]));
  expect(result.current.profileChoices).toHaveLength(2);
  expect(onConnected).not.toHaveBeenCalled();
  await act(() => result.current.applyFolder([second]));
  expect(onConnected.mock.calls[0][0].file.name).toBe(second.name);
});
