import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ConfidenceBar } from "./ConfidenceBar";

afterEach(cleanup);

describe("ConfidenceBar", () => {
  it("renders the rounded percent, the label and an accessible meter value", () => {
    render(<ConfidenceBar value={0.912} label="Confidence" />);
    expect(screen.getByText("Confidence")).toBeInTheDocument();
    expect(screen.getByText("91%")).toBeInTheDocument();
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "91");
  });

  it("clamps out-of-range values", () => {
    render(<ConfidenceBar value={1.4} label="c" />);
    expect(screen.getByText("100%")).toBeInTheDocument();
  });
});
