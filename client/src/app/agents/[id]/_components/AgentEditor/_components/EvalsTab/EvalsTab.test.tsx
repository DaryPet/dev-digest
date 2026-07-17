import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, EvalDashboard } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/eval.json";
import type { EvalCaseStatus } from "@/lib/hooks/eval";
import { EvalsTab } from "./EvalsTab";

afterEach(cleanup);

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets and injection",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 3,
  project_context_paths: [],
};

const STATUSES: EvalCaseStatus[] = [
  {
    case_id: "case1",
    name: "stripe-key-leak",
    status: "passing",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded Stripe key",
    last_run: {
      id: "run1",
      case_id: "case1",
      case_name: "stripe-key-leak",
      ran_at: "2026-07-10T00:00:00Z",
      actual_output: { findings: [] },
      pass: true,
      recall: 1,
      precision: 1,
      citation_accuracy: 1,
      duration_ms: 1200,
      cost_usd: 0.01,
    },
  },
  {
    case_id: "case2",
    name: "no-sql-injection",
    status: "never-run",
    severity: null,
    category: null,
    title: null,
    last_run: null,
  },
];

const DASHBOARD: EvalDashboard = {
  owner_kind: "agent",
  owner_id: "ag1",
  cases_total: 2,
  current: {
    recall: 0.8,
    precision: 0.9,
    citation_accuracy: 0.75,
    traces_passed: 1,
    traces_total: 2,
    cost_usd: 0.02,
  },
  delta: { recall: 0.05, precision: -0.02, citation_accuracy: 0 },
  trend: [
    { ran_at: "2026-07-01T00:00:00Z", recall: 0.7, precision: 0.85, citation_accuracy: 0.7, pass_rate: 0.5, cost_usd: 0.01 },
    { ran_at: "2026-07-10T00:00:00Z", recall: 0.8, precision: 0.9, citation_accuracy: 0.75, pass_rate: 0.5, cost_usd: 0.02 },
  ],
  recent_runs: [],
  alert: null,
};

let statusesData: EvalCaseStatus[] | undefined = STATUSES;
let dashboardData: EvalDashboard | undefined = DASHBOARD;
const runAllMutate = vi.fn();
const runCaseMutate = vi.fn();

vi.mock("@/lib/hooks/eval", async () => {
  const actual = await vi.importActual<typeof import("@/lib/hooks/eval")>("@/lib/hooks/eval");
  return {
    ...actual,
    useEvalCaseStatuses: () => ({ data: statusesData, isLoading: false }),
    useEvalDashboard: () => ({ data: dashboardData, isLoading: false }),
    useRunAllEvals: () => ({ mutate: runAllMutate, isPending: false }),
    useRunEvalCase: () => ({ mutate: runCaseMutate, isPending: false }),
  };
});

// The editor modal is exercised by its own test file — mock it here so
// EvalsTab's test stays scoped to the tab's own list/metrics/actions.
vi.mock("./_components/EvalCaseEditorModal", () => ({
  EvalCaseEditorModal: ({ caseId }: { caseId: string | null }) => (
    <div data-testid="editor-modal">{caseId ?? "new"}</div>
  ),
}));

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ eval: messages }}>{ui}</NextIntlClientProvider>);
}

describe("Agent editor EvalsTab", () => {
  afterEach(() => {
    statusesData = STATUSES;
    dashboardData = DASHBOARD;
    runAllMutate.mockClear();
    runCaseMutate.mockClear();
  });

  it("renders the four metric cards from the current version-group", () => {
    renderWithIntl(<EvalsTab agent={AGENT} />);
    expect(screen.getByText("RECALL")).toBeInTheDocument();
    expect(screen.getByText("PRECISION")).toBeInTheDocument();
    expect(screen.getByText("CITATION ACCURACY")).toBeInTheDocument();
    expect(screen.getByText("TRACES PASSED")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(screen.getByText("1/2")).toBeInTheDocument();
  });

  it("lists every eval case with its status and severity·category badge", () => {
    renderWithIntl(<EvalsTab agent={AGENT} />);
    expect(screen.getByText("stripe-key-leak")).toBeInTheDocument();
    expect(screen.getByText("no-sql-injection")).toBeInTheDocument();
    expect(screen.getByText("passed")).toBeInTheDocument();
    expect(screen.getByText("never run")).toBeInTheDocument();
    expect(screen.getByText("security")).toBeInTheDocument();
  });

  it("shows the N/M passing counter and a link to the full dashboard", () => {
    renderWithIntl(<EvalsTab agent={AGENT} />);
    expect(screen.getByText("1/2 passing")).toBeInTheDocument();
    const link = screen.getByText("View full dashboard →");
    expect(link.closest("a")).toHaveAttribute("href", "/eval-dashboard/ag1");
  });

  it("clicking Run all evals triggers the batch-run mutation", () => {
    renderWithIntl(<EvalsTab agent={AGENT} />);
    fireEvent.click(screen.getByText("Run all evals"));
    expect(runAllMutate).toHaveBeenCalledTimes(1);
  });

  it("clicking a case's Run action triggers only that case's run mutation", () => {
    renderWithIntl(<EvalsTab agent={AGENT} />);
    const runButtons = screen.getAllByText("Run");
    fireEvent.click(runButtons[0]!);
    expect(runCaseMutate).toHaveBeenCalledTimes(1);
  });

  it("clicking New eval case opens the editor modal empty", () => {
    renderWithIntl(<EvalsTab agent={AGENT} />);
    expect(screen.queryByTestId("editor-modal")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("New case"));
    expect(screen.getByTestId("editor-modal")).toHaveTextContent("new");
  });

  it("clicking Edit on a case opens the editor modal for that case", () => {
    renderWithIntl(<EvalsTab agent={AGENT} />);
    fireEvent.click(screen.getAllByText("Edit")[0]!);
    expect(screen.getByTestId("editor-modal")).toHaveTextContent("case1");
  });

  it("shows an empty state when the agent has no eval cases", () => {
    statusesData = [];
    renderWithIntl(<EvalsTab agent={AGENT} />);
    expect(screen.getByText("No eval cases yet. Create one to assert this agent's expected findings on a sample diff.")).toBeInTheDocument();
    expect(screen.getByText("0/0 passing")).toBeInTheDocument();
  });
});
