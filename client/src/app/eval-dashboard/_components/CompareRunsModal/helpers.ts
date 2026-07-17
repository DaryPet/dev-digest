import type { EvalRunRecord } from "@devdigest/shared";

/** Line-level diff classification, mirroring `diff-viewer/helpers.ts`'s `Line`
    shape but for a plain two-string comparison (no unified-diff hunks). */
export interface DiffLine {
  kind: "add" | "del" | "ctx";
  text: string;
}

/** Hand-rolled LCS-based line diff — no new npm dependency (matches the
    project's existing hand-rolled `parsePatch` convention,
    `components/diff-viewer/helpers.ts`). Classifies every line of `before`/
    `after` as unchanged/added/removed. Straightforward O(n*m) DP table; the
    inputs here are single system-prompt strings, not full file trees, so this
    is more than fast enough. */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const n = a.length;
  const m = b.length;

  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: "ctx", text: a[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      out.push({ kind: "del", text: a[i]! });
      i++;
    } else {
      out.push({ kind: "add", text: b[j]! });
      j++;
    }
  }
  while (i < n) {
    out.push({ kind: "del", text: a[i]! });
    i++;
  }
  while (j < m) {
    out.push({ kind: "add", text: b[j]! });
    j++;
  }
  return out;
}

/** Per-version-group metric aggregate, resolved client-side from
    `EvalDashboard.recent_runs` (§9 T-E resolution — `EvalTrendPoint` carries
    no `version` field, so the trend array can't be indexed by version; the
    recent-runs window is the only place a run's snapshot version is
    recoverable). Averages skip nulls; an empty subset yields all-null
    ("unavailable" — rendered as "—" by the component, never faked as 0). */
export interface VersionMetrics {
  recall: number | null;
  precision: number | null;
  citation_accuracy: number | null;
  cost_usd: number | null;
  sampleCount: number;
}

/** Local equivalent of `[agentId]/helpers.ts`'s `snapshotVersion` — kept
    self-contained per this task's ownership boundary rather than
    cross-importing a sibling directory's helper (a few duplicated lines is
    the accepted tradeoff here). */
function versionOfRun(run: EvalRunRecord): number | null {
  const output = run.actual_output as { snapshot?: { version?: number } } | null | undefined;
  const v = output?.snapshot?.version;
  return typeof v === "number" ? v : null;
}

function average(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length === 0) return null;
  return nums.reduce((sum, v) => sum + v, 0) / nums.length;
}

export function metricsForVersion(runs: EvalRunRecord[], version: number): VersionMetrics {
  const rows = runs.filter((r) => versionOfRun(r) === version);
  return {
    recall: average(rows.map((r) => r.recall)),
    precision: average(rows.map((r) => r.precision)),
    citation_accuracy: average(rows.map((r) => r.citation_accuracy)),
    cost_usd: average(rows.map((r) => r.cost_usd)),
    sampleCount: rows.length,
  };
}

/** `b - a`, or `null` when either side has no data to diff. */
export function metricDelta(a: number | null, b: number | null): number | null {
  if (a == null || b == null) return null;
  return b - a;
}

export function formatPercent(v: number | null): string {
  return v == null ? "—" : `${Math.round(v * 100)}%`;
}

export function formatPercentDelta(v: number | null): string {
  if (v == null) return "—";
  const pp = Math.round(v * 100);
  return pp === 0 ? "0pp" : `${pp > 0 ? "+" : ""}${pp}pp`;
}

export function formatCostDelta(v: number | null): string {
  if (v == null) return "—";
  if (v === 0) return "$0.000";
  return `${v > 0 ? "+" : "-"}$${Math.abs(v).toFixed(3)}`;
}
