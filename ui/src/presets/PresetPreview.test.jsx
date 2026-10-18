import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import PresetPreview from "./PresetPreview.jsx";

afterEach(cleanup);
it("retries a game PNG briefly unavailable during replacement", async () => {
  const load = vi
    .fn()
    .mockRejectedValueOnce(new Error("replacing"))
    .mockResolvedValue("blob:new");
  render(
    <PresetPreview
      source="/api/preset-image/Icon_PresetID_1.png"
      loadImage={load}
      alt="Setup"
    />,
  );
  await waitFor(() =>
    expect(screen.getByAltText("Setup").src).toBe("blob:new"),
  );
  expect(load).toHaveBeenCalledTimes(2);
});
it("refreshes the same path when its independent image revision changes", async () => {
  const load = vi
    .fn()
    .mockResolvedValueOnce("blob:old")
    .mockResolvedValue("blob:new");
  const { rerender } = render(
    <PresetPreview
      source="/icon.png"
      revision="first"
      loadImage={load}
      alt="Setup"
    />,
  );
  await screen.findByAltText("Setup");
  rerender(
    <PresetPreview
      source="/icon.png"
      revision="second"
      loadImage={load}
      alt="Setup"
    />,
  );
  await waitFor(() =>
    expect(screen.getByAltText("Setup").src).toBe("blob:new"),
  );
});
