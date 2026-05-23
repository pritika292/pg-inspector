import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "../../src/client/App.js";

// react-flow needs ResizeObserver; jsdom doesn't ship it.
class ResizeObserverMock {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("[]", { status: 200 })),
  );
});

describe("<App />", () => {
  it("renders the topbar wordmark and an empty-visualizer prompt", () => {
    render(<App />);
    expect(screen.getByText("pg-inspector")).toBeInTheDocument();
    expect(screen.getByText("visualizer")).toBeInTheDocument();
    expect(screen.getByText(/pick a scenario on the left/i)).toBeInTheDocument();
  });
});
