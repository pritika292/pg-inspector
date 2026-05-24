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
  // Default pathname for App routing — Landing page lives at /.
  window.history.replaceState({}, "", "/");
  localStorage.clear();
});

describe("<App />", () => {
  it("renders the landing page at /", () => {
    render(<App />);
    expect(screen.getByText(/five industry schemas/i)).toBeInTheDocument();
    // TRY IT appears twice (hero + bottom CTA)
    expect(screen.getAllByText("TRY IT").length).toBeGreaterThan(0);
  });

  it("renders the about page at /about", () => {
    window.history.replaceState({}, "", "/about");
    render(<App />);
    // About page has a distinctive section heading we can target
    expect(screen.getByText(/how the SQL stays safe/i)).toBeInTheDocument();
    expect(screen.getByText(/← BACK/i)).toBeInTheDocument();
  });

  it("renders the working surface at /app", () => {
    window.history.replaceState({}, "", "/app");
    render(<App />);
    expect(screen.getByText(/pick a scenario on the left/i)).toBeInTheDocument();
  });

  it("on /app, shows onboarding hint when localStorage flag is unset", () => {
    window.history.replaceState({}, "", "/app");
    render(<App />);
    expect(screen.getByText(/pick a scenario to begin/i)).toBeInTheDocument();
  });

  it("on /app, hides onboarding hint when localStorage flag is set", () => {
    window.history.replaceState({}, "", "/app");
    localStorage.setItem("pg-inspector:onboarded:v1", "1");
    render(<App />);
    expect(screen.queryByText(/pick a scenario to begin/i)).not.toBeInTheDocument();
  });
});
