import { describe, it, expect } from "vitest";
import type { EvalRunRecord } from "@devdigest/shared";
import { snapshotVersion, compareVersionsFor } from "./helpers";

function run(id: string, overrides: Partial<EvalRunRecord> = {}): EvalRunRecord {
  return {
    id,
    case_id: `case-${id}`,
    case_name: `case-${id}`,
    ran_at: "2026-07-10T00:00:00Z",
    actual_output: { findings: [], snapshot: { system_prompt: "p", model: "gpt-4.1", skills: [], version: 4 } },
    pass: true,
    recall: 1,
    precision: 1,
    citation_accuracy: 1,
    duration_ms: 1000,
    cost_usd: 0.01,
    ...overrides,
  };
}

describe("snapshotVersion", () => {
  it("reads the snapshot version embedded in actual_output (D3)", () => {
    expect(snapshotVersion(run("r1"))).toBe(4);
  });

  it("returns null when actual_output has no snapshot (e.g. a failed-case row)", () => {
    expect(snapshotVersion(run("r1", { actual_output: null }))).toBeNull();
    expect(snapshotVersion(run("r1", { actual_output: { findings: [] } }))).toBeNull();
  });
});

describe("compareVersionsFor", () => {
  it("returns the two selected runs' versions in selection order", () => {
    const runs = [
      run("r1", { actual_output: { findings: [], snapshot: { version: 5 } } }),
      run("r2", { actual_output: { findings: [], snapshot: { version: 3 } } }),
      run("r3", { actual_output: { findings: [], snapshot: { version: 7 } } }),
    ];
    const versions = compareVersionsFor(runs, new Set(["r1", "r3"]));
    expect(versions).toEqual([5, 7]);
  });

  it("returns null unless exactly two selected runs resolve a snapshot version", () => {
    const runs = [run("r1"), run("r2"), run("r3")];
    expect(compareVersionsFor(runs, new Set(["r1"]))).toBeNull();
    expect(compareVersionsFor(runs, new Set(["r1", "r2", "r3"]))).toBeNull();
    expect(compareVersionsFor(runs, new Set())).toBeNull();
  });

  it("returns null when a selected run has no resolvable version", () => {
    const runs = [run("r1", { actual_output: null }), run("r2")];
    expect(compareVersionsFor(runs, new Set(["r1", "r2"]))).toBeNull();
  });
});
