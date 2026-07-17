import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalDashboard, EvalRunRecord } from "@devdigest/shared";
import messages from "../../../../../messages/en/eval.json";
import { CompareRunsModal } from "./CompareRunsModal";

afterEach(cleanup);

const promoteMutate = vi.fn();
let promotePending = false;

vi.mock("@/lib/hooks/eval", () => ({
  useEvalRunSnapshot: (_agentId: string, version: number) => ({
    data:
      version === 4
        ? { system_prompt: "line one\nline two\nline three", model: "gpt-4.1", skills: [], version: 4, ran_at: "2026-07-10T00:00:00Z" }
        : { system_prompt: "line one\nline TWO changed\nline three\nline four", model: "gpt-4.1", skills: [], version: 3, ran_at: "2026-07-01T00:00:00Z" },
    isLoading: false,
  }),
  useEvalDashboard: () => ({ data: dashboardData, isLoading: false }),
  usePromoteConfig: () => ({ mutate: promoteMutate, isPending: promotePending }),
}));

function runRecord(id: string, version: number, overrides: Partial<EvalRunRecord> = {}): EvalRunRecord {
  return {
    id,
    case_id: `case-${id}`,
    case_name: `case-${id}`,
    ran_at: "2026-07-10T00:00:00Z",
    actual_output: { findings: [], snapshot: { system_prompt: "p", model: "gpt-4.1", skills: [], version } },
    pass: true,
    recall: 0.8,
    precision: 0.9,
    citation_accuracy: 0.7,
    duration_ms: 1000,
    cost_usd: 0.01,
    ...overrides,
  };
}

const DASHBOARD: EvalDashboard = {
  owner_kind: "agent",
  owner_id: "agent-1",
  cases_total: 2,
  current: { recall: 0.8, precision: 0.9, citation_accuracy: 0.7, traces_passed: 2, traces_total: 3, cost_usd: 0.02 },
  delta: { recall: 0.1, precision: 0.05, citation_accuracy: 0 },
  trend: [],
  recent_runs: [
    runRecord("run-a", 4, { recall: 0.9, precision: 1, citation_accuracy: 0.8, cost_usd: 0.02 }),
    runRecord("run-b", 3, { recall: 0.6, precision: 0.7, citation_accuracy: 0.5, cost_usd: 0.01 }),
  ],
  alert: null,
};

let dashboardData: EvalDashboard | undefined = DASHBOARD;

function renderModal(overrides: Partial<React.ComponentProps<typeof CompareRunsModal>> = {}) {
  const onClose = vi.fn();
  const onPromoted = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <CompareRunsModal agentId="agent-1" versions={[4, 3]} onClose={onClose} onPromoted={onPromoted} {...overrides} />
    </NextIntlClientProvider>,
  );
  return { onClose, onPromoted };
}

describe("CompareRunsModal", () => {
  afterEach(() => {
    dashboardData = DASHBOARD;
    promotePending = false;
    promoteMutate.mockClear();
  });

  it("renders metric deltas computed from recent_runs for the two selected versions (AC-34)", () => {
    renderModal();
    // recall: versionA(4)=90%, versionB(3)=60%, delta = versionB - versionA = -30pp
    expect(screen.getByText("90%")).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();
    expect(screen.getAllByText("-30pp").length).toBeGreaterThan(0);
  });

  it("renders a system-prompt diff distinguishing added and removed lines (AC-35)", () => {
    renderModal();
    // Lines unique to versionB(3)'s prompt but absent from versionA(4)'s.
    expect(screen.getByText("line TWO changed")).toBeInTheDocument();
    expect(screen.getByText("line four")).toBeInTheDocument();
    // Line unique to versionA(4)'s prompt, absent from versionB(3)'s.
    expect(screen.getByText("line two")).toBeInTheDocument();
  });

  it('shows a "no data" note when one version-group has zero matching runs in the window', () => {
    dashboardData = { ...DASHBOARD, recent_runs: [runRecord("run-a", 4)] };
    renderModal();
    expect(screen.getByText(/No runs recorded for this version yet\./)).toBeInTheDocument();
  });

  it('clicking "Promote v4" calls usePromoteConfig.mutate(4) and onPromoted fires on success (AC-36)', () => {
    promoteMutate.mockImplementation((_version, opts) => {
      opts?.onSuccess?.();
    });
    const { onPromoted } = renderModal();
    fireEvent.click(screen.getByText("Promote v4"));
    expect(promoteMutate).toHaveBeenCalledWith(4, expect.anything());
    expect(onPromoted).toHaveBeenCalledTimes(1);
  });

  it('clicking "Promote v3" calls usePromoteConfig.mutate(3)', () => {
    renderModal();
    fireEvent.click(screen.getByText("Promote v3"));
    expect(promoteMutate).toHaveBeenCalledWith(3, expect.anything());
  });

  it('clicking "Close" calls onClose and fires no mutation (AC-37)', () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByText("Close"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(promoteMutate).not.toHaveBeenCalled();
  });
});
