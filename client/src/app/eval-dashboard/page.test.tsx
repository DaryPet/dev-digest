import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en/eval.json";
import type { EvalAgentSummary } from "@/lib/hooks/eval";
import EvalDashboardOverviewPage from "./page";

afterEach(cleanup);

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

function dashboardFor(recall: number, precision: number, citation: number, runs: EvalAgentSummary["dashboard"]["recent_runs"]) {
  return {
    owner_kind: "agent" as const,
    owner_id: "agent-owner",
    cases_total: 3,
    current: { recall, precision, citation_accuracy: citation, traces_passed: 2, traces_total: 3, cost_usd: 0.01 },
    delta: { recall: 0, precision: 0, citation_accuracy: 0 },
    trend: [
      { ran_at: "2026-06-20T00:00:00Z", recall: recall - 0.1, precision: precision - 0.1, citation_accuracy: citation - 0.1, pass_rate: 0.5, cost_usd: 0.01 },
      { ran_at: "2026-07-01T00:00:00Z", recall, precision, citation_accuracy: citation, pass_rate: 0.6, cost_usd: 0.01 },
    ],
    recent_runs: runs,
    alert: null,
  };
}

const SUMMARIES: EvalAgentSummary[] = [
  {
    agent_id: "agent-1",
    agent_name: "Security Reviewer",
    dashboard: dashboardFor(0.8, 0.9, 0.75, [
      {
        id: "run-a",
        case_id: "case-a",
        case_name: "stripe-key-leak",
        ran_at: "2026-07-10T00:00:00Z",
        actual_output: { findings: [] },
        pass: true,
        recall: 1,
        precision: 1,
        citation_accuracy: 1,
        duration_ms: 1000,
        cost_usd: 0.01,
      },
    ]),
  },
  {
    agent_id: "agent-2",
    agent_name: "Style Reviewer",
    dashboard: dashboardFor(0.6, 0.7, 0.5, [
      {
        id: "run-b",
        case_id: "case-b",
        case_name: "lint-rule",
        ran_at: "2026-07-15T00:00:00Z",
        actual_output: { findings: [] },
        pass: false,
        recall: 0,
        precision: 0,
        citation_accuracy: 0,
        duration_ms: 800,
        cost_usd: 0.02,
      },
    ]),
  },
];

let summariesData: EvalAgentSummary[] | undefined = SUMMARIES;
const runAllMutate = vi.fn((_arg?: unknown, opts?: { onSettled?: () => void }) => opts?.onSettled?.());

vi.mock("@/lib/hooks/eval", async () => {
  const actual = await vi.importActual<typeof import("@/lib/hooks/eval")>("@/lib/hooks/eval");
  return {
    ...actual,
    useEvalAgentSummaries: () => ({ data: summariesData, isLoading: false }),
    useRunAllEvals: () => ({ mutate: runAllMutate, isPending: false }),
  };
});

vi.mock("@/lib/hooks/agents", async () => {
  const actual = await vi.importActual<typeof import("@/lib/hooks/agents")>("@/lib/hooks/agents");
  return {
    ...actual,
    useAgents: () => ({
      data: [
        { id: "agent-1", model: "gpt-4.1" },
        { id: "agent-2", model: "gpt-4o-mini" },
      ],
    }),
  };
});

function renderPage() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <EvalDashboardOverviewPage />
    </NextIntlClientProvider>,
  );
}

describe("Eval Dashboard overview page", () => {
  afterEach(() => {
    summariesData = SUMMARIES;
    runAllMutate.mockClear();
  });

  it("lists every agent with its current recall/precision/citation and links to its detail page", () => {
    renderPage();
    expect(screen.getAllByText("Security Reviewer").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Style Reviewer").length).toBeGreaterThan(0);
    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(screen.getByText("90%")).toBeInTheDocument();
    const link = screen.getAllByText("Security Reviewer")[0]!.closest("a");
    expect(link).toHaveAttribute("href", "/eval-dashboard/agent-1");
  });

  it("shows a flat, newest-first recent-runs table across every agent, grouped by run (no case column)", () => {
    renderPage();
    const heading = screen.getByText("Recent eval runs · all agents");
    const section = heading.closest("section")!;
    expect(within(section).queryByText("lint-rule")).not.toBeInTheDocument();
    expect(within(section).queryByText("stripe-key-leak")).not.toBeInTheDocument();
    const names = within(section)
      .getAllByText(/^(Security Reviewer|Style Reviewer)$/)
      .map((el) => el.textContent);
    expect(names[0]).toBe("Style Reviewer"); // 2026-07-15 is newer than 2026-07-10
    expect(names[1]).toBe("Security Reviewer");
  });

  it("clicking Run all agents fires the batch-run mutation once per agent", async () => {
    renderPage();
    fireEvent.click(screen.getByText("Run all agents"));
    await waitFor(() => expect(runAllMutate).toHaveBeenCalledTimes(2));
  });

  it("renders an empty state instead of an actionable table when no agent owns eval cases", () => {
    summariesData = [];
    renderPage();
    expect(screen.getByText("No eval agents yet")).toBeInTheDocument();
    expect(screen.queryByText("Security Reviewer")).not.toBeInTheDocument();
  });
});
