import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import Feedback from "./Feedback.jsx";

afterEach(() => {
  cleanup();
  document.querySelectorAll("dialog").forEach((d) => d.remove());
});
it("moves a visible notice into the top native modal and back when it closes", async () => {
  const dismiss = vi.fn();
  render(<Feedback message="Saved" onDismiss={dismiss} />);
  const first = document.createElement("dialog");
  const second = document.createElement("dialog");
  act(() => {
    first.open = true;
    document.body.append(first);
  });
  await waitFor(() =>
    expect(first.contains(screen.getByRole("status"))).toBe(true),
  );
  act(() => {
    second.open = true;
    document.body.append(second);
  });
  await waitFor(() =>
    expect(second.contains(screen.getByRole("status"))).toBe(true),
  );
  fireEvent.click(screen.getByRole("button", { name: "Dismiss message" }));
  expect(dismiss).toHaveBeenCalledOnce();
  act(() => {
    second.open = false;
  });
  await waitFor(() =>
    expect(first.contains(screen.getByRole("status"))).toBe(true),
  );
  act(() => {
    first.open = false;
  });
  await waitFor(() =>
    expect(screen.getByRole("status").parentElement).toBe(document.body),
  );
});
