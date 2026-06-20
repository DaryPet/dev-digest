import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RunCostBadge, formatCost, formatRunTokens } from "./RunCostBadge";

afterEach(cleanup);

describe("formatCost", () => {
  it("renders '—' for no data (null/undefined), never '$0.00'", () => {
    expect(formatCost(null)).toBe("—");
    expect(formatCost(undefined)).toBe("—");
  });

  it("renders '$0.00' only for a genuinely free model (0)", () => {
    expect(formatCost(0)).toBe("$0.00");
  });

  it("formats a positive cost to three decimals", () => {
    expect(formatCost(0.0141)).toBe("$0.014");
  });
});

describe("formatRunTokens", () => {
  it("summarises in→out with the spec's K format", () => {
    expect(formatRunTokens(8200, 1300)).toBe("8.2K→1.3K");
  });
});

describe("RunCostBadge", () => {
  it("compact: shows only the cost", () => {
    render(<RunCostBadge cost={0.012} variant="compact" tokensIn={8200} tokensOut={1300} />);
    expect(screen.getByText("$0.012")).toBeInTheDocument();
    expect(screen.queryByText(/→/)).not.toBeInTheDocument();
  });

  it("detailed: shows cost · tokens", () => {
    render(<RunCostBadge cost={0.014} variant="detailed" tokensIn={8200} tokensOut={1300} />);
    expect(screen.getByText("$0.014")).toBeInTheDocument();
    expect(screen.getByText(/8\.2K→1\.3K/)).toBeInTheDocument();
  });

  it("no data: renders '—' and hides tokens even in detailed", () => {
    render(<RunCostBadge cost={null} variant="detailed" tokensIn={8200} tokensOut={1300} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText(/→/)).not.toBeInTheDocument();
  });
});
