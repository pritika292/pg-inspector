import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "../../src/client/App.js";

describe("<App />", () => {
  it("renders the wordmark and a tagline", () => {
    render(<App />);
    expect(screen.getByText("pg-inspector")).toBeInTheDocument();
    expect(screen.getByText(/multi-scenario data sandbox/i)).toBeInTheDocument();
  });
});
