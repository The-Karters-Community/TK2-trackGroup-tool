import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import Home from "./Home.jsx";
import TracksHub from "./TracksHub.jsx";

afterEach(cleanup);

test("main menu has four clear destinations and keeps tracks together", () => {
  const navigate = vi.fn(),
    quick = vi.fn();
  render(<Home onNavigate={navigate} onQuickSetup={quick} />);
  expect(
    screen.queryByRole("button", { name: /Discover track groups/ }),
  ).toBeNull();
  expect(screen.queryByRole("button", { name: /My track groups/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Quick Setup/ }));
  expect(quick).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: /^Tracks/ }));
  expect(navigate).toHaveBeenCalledWith("browse");
  fireEvent.click(screen.getByRole("button", { name: /^Lobby/ }));
  expect(navigate).toHaveBeenCalledWith("lobby");
});

test("track hub exposes three destinations and browser only shows available libraries", () => {
  const change = vi.fn();
  const { rerender } = render(
    <TracksHub active="local" onChange={change}>
      Library
    </TracksHub>,
  );
  expect(
    screen
      .getByRole("button", { name: "My groups" })
      .getAttribute("aria-current"),
  ).toBe("page");
  fireEvent.click(screen.getByRole("button", { name: "My tracks" }));
  expect(change).toHaveBeenCalledWith("tracks");
  rerender(
    <TracksHub active="browse" onChange={change} browser>
      Library
    </TracksHub>,
  );
  expect(screen.queryByRole("button", { name: "My tracks" })).toBeNull();
});
