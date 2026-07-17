/* NOTE (plan `plans/eval-pipeline.md` §9 T-C): this suite renders `./page`,
   which statically imports T-E's `../_components/CompareRunsModal` (mocked
   below). Confirmed via an isolated probe: Vite's `vite:import-analysis`
   resolves every static/dynamic import of a transformed module BEFORE
   Vitest's `vi.mock` registry can substitute it, so this file only executes
   once that path exists on disk (any content — the mock factory below still
   fully overrides it at runtime; only structural resolution needs a real
   file). Until T-E lands, `vitest run` fails this file with "Failed to
   resolve import" — that failure is a cross-task landing-order artifact, not
   a defect in this test or in EvalDashboardDetailPage. The pure
   version-selection logic this page delegates to is covered independently,
   without needing this file to run, in `./helpers.test.ts`. */
import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, EvalDashboard } from "@devdigest/shared";
import messages from "../../../../messages/en/eval.json";
import EvalDashboardDetailPage from "./page";

afterEach(cleanup);

vi.mock("next/navigation", () => ({
  useParams: () => ({ agentId: "agent-1" }),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const AGENT: Agent = {
  id: "agent-1",
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
  version: 4,
  project_context_paths: [],
};

vi.mock("@/lib/hooks/agents", async () => {
  const actual = await vi.importActual<typeof import("@/lib/hooks/agents")>("@/lib/hooks/agents");
  return {
    ...actual,
    useAgent: () => ({ data: AGENT, isLoading: false }),
    useAgents: () => ({ data: [AGENT], isLoading: false }),
  };
});

// T-E's implementation doesn't exist yet — this task's own tests must not
// depend on it (plan §9 T-C done-conditions). Assert on the props it's
// called with instead of any real modal behavior.
const compareRunsModalSpy = vi.fn();
vi.mock("../_components/CompareRunsModal", () => ({
  CompareRunsModal: (props: { agentId: string; versions: [number, number]; onClose: () => void; onPromoted?: () => void }) => {
    compareRunsModalSpy(props);
    return <div data-testid="compare-modal">{props.versions.join(",")}</div>;
  },
}));

function runRecord(id: string, version: number, overrides: Partial<EvalDashboard["recent_runs"][number]> = {}) {
  return {
    id,
    case_id: `case-${id}`,
    case_name: `case-${id}`,
    ran_at: "2026-07-10T00:00:00Z",
    actual_output: { findings: [], snapshot: { system_prompt: "p", model: "gpt-4.1", skills: [], version } },
    pass: true,
    recall: 1,
    precision: 1,
    citation_accuracy: 1,
    duration_ms: 1000,
    cost_usd: 0.01,
    ...overrides,
  };
}

const DASHBOARD: EvalDashboard = {
  owner_kind: "agent",
  owner_id: "agent-1",
  cases_total: 3,
  current: { recall: 0.8, precision: 0.9, citation_accuracy: 0.75, traces_passed: 2, traces_total: 3, cost_usd: 0.02 },
  delta: { recall: 0.05, precision: -0.02, citation_accuracy: 0 },
  trend: [
    { ran_at: "2026-07-01T00:00:00Z", recall: 0.7, precision: 0.85, citation_accuracy: 0.7, pass_rate: 0.5, cost_usd: 0.01 },
    { ran_at: "2026-07-10T00:00:00Z", recall: 0.8, precision: 0.9, citation_accuracy: 0.75, pass_rate: 0.67, cost_usd: 0.02 },
  ],
  recent_runs: [runRecord("run-1", 4), runRecord("run-2", 3, { pass: false, recall: 0, precision: 0, citation_accuracy: 0 })],
  alert: null,
};

let dashboardData: EvalDashboard | undefined = DASHBOARD;

vi.mock("@/lib/hooks/eval", async () => {
  const actual = await vi.importActual<typeof import("@/lib/hooks/eval")>("@/lib/hooks/eval");
  return {
    ...actual,
    useEvalDashboard: () => ({ data: dashboardData, isLoading: false }),
    useRunAllEvals: () => ({ mutate: vi.fn(), isPending: false }),
  };
});

function renderPage() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <EvalDashboardDetailPage />
    </NextIntlClientProvider>,
  );
}

describe("Eval Dashboard detail page", () => {
  afterEach(() => {
    dashboardData = DASHBOARD;
    compareRunsModalSpy.mockClear();
  });

  it("renders the three metric cards with deltas from the current version-group", () => {
    renderPage();
    expect(screen.getByText("RECALL")).toBeInTheDocument();
    expect(screen.getByText("PRECISION")).toBeInTheDocument();
    expect(screen.getByText("CITATION ACCURACY")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(screen.queryByText("TRACES PASSED")).not.toBeInTheDocument();
  });

  it("renders no alert banner when dashboard.alert is null", () => {
    renderPage();
    expect(screen.queryByText(/dropped/i)).not.toBeInTheDocument();
  });

  it("renders the alert string when non-null (AC-33)", () => {
    dashboardData = { ...DASHBOARD, alert: "Recall dropped 3pp vs. the previous version." };
    renderPage();
    expect(screen.getByText("Recall dropped 3pp vs. the previous version.")).toBeInTheDocument();
  });

  it("lists recent runs with a checkbox each; Compare stays disabled until exactly two are checked", () => {
    renderPage();
    const compareBtn = screen.getByText("Compare");
    expect(compareBtn).toBeDisabled();

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(2);
    fireEvent.click(checkboxes[0]!);
    expect(compareBtn).toBeDisabled();
    fireEvent.click(checkboxes[1]!);
    expect(compareBtn).not.toBeDisabled();
  });

  it("clicking Compare with two selected runs opens CompareRunsModal with their snapshot versions", () => {
    renderPage();
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]!);
    fireEvent.click(checkboxes[1]!);
    fireEvent.click(screen.getByText("Compare"));

    expect(screen.getByTestId("compare-modal")).toBeInTheDocument();
    expect(compareRunsModalSpy).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: "agent-1", versions: [4, 3] }),
    );
  });

  it("shows an empty state with a configure CTA when there are no recent runs", () => {
    dashboardData = { ...DASHBOARD, recent_runs: [] };
    renderPage();
    expect(screen.getByText("Configure eval cases →")).toBeInTheDocument();
  });
});
