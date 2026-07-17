import type { EvalRunRecord } from "@devdigest/shared";

/** Run snapshots embed `{findings, snapshot: {version, ...}}` in
    `actual_output` (D3) — extract the version-group id a run belongs to.
    Compare/Promote (T-E's `CompareRunsModal`) is driven by the SNAPSHOT
    version, not `ran_at` (plan §9 T-C: "the run's snapshot version, not
    ran_at"). Mirrors the `actual_output` cast pattern already used in
    `EvalCaseEditorModal.tsx`. */
export function snapshotVersion(run: EvalRunRecord): number | null {
  const output = run.actual_output as { snapshot?: { version?: number } } | null | undefined;
  const v = output?.snapshot?.version;
  return typeof v === "number" ? v : null;
}

/** Derive the exactly-two `[v1, v2]` version pair Compare needs from the
    currently-selected run ids, or `null` if the selection isn't exactly two
    runs with a resolvable snapshot version each. */
export function compareVersionsFor(runs: EvalRunRecord[], selectedIds: Set<string>): [number, number] | null {
  const versions = runs
    .filter((r) => selectedIds.has(r.id))
    .map(snapshotVersion)
    .filter((v): v is number => v != null);
  return versions.length === 2 ? [versions[0]!, versions[1]!] : null;
}

/** One "Recent runs" row — a whole batch (every case run together at one
    snapshot version by a single "Run eval" click), not one row per case.
    Design mock has no case column: RAN AT/VERSION/RECALL/PRECISION/CITATION/
    PASS/COST only, PASS as "{passed}/{total}" for the batch. */
export interface RunGroup {
  key: string;
  version: number | null;
  ranAt: string;
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  passed: number;
  total: number;
  costUsd: number | null;
  /** Every case run id in this batch — index 0 is used as the row's Compare
      selection identity, fed straight into `compareVersionsFor`. */
  runIds: string[];
}

function average(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length === 0) return null;
  return nums.reduce((sum, v) => sum + v, 0) / nums.length;
}

function sum(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length === 0) return null;
  return nums.reduce((total, v) => total + v, 0);
}

/** Groups case-level `EvalRunRecord`s into one row per run batch (version-
    group), averaging recall/precision/citation, summing cost, and counting
    pass/total. Newest batch first. */
export function groupRunsByVersion(runs: EvalRunRecord[]): RunGroup[] {
  const buckets = new Map<string, { version: number | null; runs: EvalRunRecord[] }>();
  for (const r of runs) {
    const version = snapshotVersion(r);
    const key = version != null ? String(version) : r.id;
    const bucket = buckets.get(key) ?? { version, runs: [] };
    bucket.runs.push(r);
    buckets.set(key, bucket);
  }
  return Array.from(buckets.entries())
    .map(([key, b]) => {
      const ranAt = b.runs.reduce((latest, r) => (new Date(r.ran_at) > new Date(latest) ? r.ran_at : latest), b.runs[0]!.ran_at);
      return {
        key,
        version: b.version,
        ranAt,
        recall: average(b.runs.map((r) => r.recall)),
        precision: average(b.runs.map((r) => r.precision)),
        citationAccuracy: average(b.runs.map((r) => r.citation_accuracy)),
        passed: b.runs.filter((r) => r.pass).length,
        total: b.runs.length,
        costUsd: sum(b.runs.map((r) => r.cost_usd)),
        runIds: b.runs.map((r) => r.id),
      };
    })
    .sort((a, b) => new Date(b.ranAt).getTime() - new Date(a.ranAt).getTime());
}

/** "2026-05-29 09:14" — matches the Recent runs table's RAN AT column. */
export function formatRunDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
