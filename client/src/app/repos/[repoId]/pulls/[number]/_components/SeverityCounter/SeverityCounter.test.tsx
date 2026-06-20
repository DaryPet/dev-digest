import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { FindingRecord } from "@devdigest/shared";

import { SeverityCounter } from "./SeverityCounter";

afterEach(cleanup);

function finding(overrides: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "x",
    file: "src/x.ts",
    start_line: 1,
    end_line: 1,
    rationale: "x",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...overrides,
  };
}

const FINDINGS: FindingRecord[] = [
  finding({ id: "f1", severity: "CRITICAL" }),
  finding({ id: "f2", severity: "CRITICAL" }),
  finding({ id: "f3", severity: "WARNING" }),
  finding({ id: "f4", severity: "SUGGESTION" }),
];

describe("SeverityCounter", () => {
  it("renders a count per severity level", () => {
    render(<SeverityCounter findings={FINDINGS} selected={null} onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Critical/i })).toHaveTextContent("2");
    expect(screen.getByRole("button", { name: /Warning/i })).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: /Suggestion/i })).toHaveTextContent("1");
  });

  it("selects a severity on click", () => {
    const onSelect = vi.fn();
    render(<SeverityCounter findings={FINDINGS} selected={null} onSelect={onSelect} />);
    screen.getByRole("button", { name: /Warning/i }).click();
    expect(onSelect).toHaveBeenCalledWith("WARNING");
  });

  it("clears the filter when the active level is clicked again", () => {
    const onSelect = vi.fn();
    render(<SeverityCounter findings={FINDINGS} selected="WARNING" onSelect={onSelect} />);
    screen.getByRole("button", { name: /Warning/i }).click();
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});
