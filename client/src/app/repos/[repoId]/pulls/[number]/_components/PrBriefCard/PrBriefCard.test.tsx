import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import briefMessages from "../../../../../../../../messages/en/brief.json";
import prReviewMessages from "../../../../../../../../messages/en/prReview.json";
import { PrBriefCard } from "./PrBriefCard";

afterEach(cleanup);

// Mock the review hooks (findings·blockers pill + score ring, unrelated to the
// Brief) and the Brief hooks (narrative + risk-level color/label) separately —
// per SPEC-02 §6.10 they are independent data sources.
vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: vi.fn(),
  usePrRuns: vi.fn(),
}));

vi.mock("@/lib/hooks/brief", () => ({
  useBrief: vi.fn(),
  useRecomputeBrief: vi.fn(),
}));

import { usePrReviews, usePrRuns } from "@/lib/hooks/reviews";
import { useBrief, useRecomputeBrief } from "@/lib/hooks/brief";

const mockUsePrReviews = vi.mocked(usePrReviews);
const mockUsePrRuns = vi.mocked(usePrRuns);
const mockUseBrief = vi.mocked(useBrief);
const mockUseRecomputeBrief = vi.mocked(useRecomputeBrief);

// Partial stubs double-cast through unknown (per client INSIGHTS on mocking
// TanStack Query hooks).
function queryResult(data: unknown, extra: Record<string, unknown> = {}) {
  return { data, isLoading: false, isError: false, ...extra } as unknown as ReturnType<
    typeof usePrReviews
  >;
}

function mutationResult(extra: Record<string, unknown> = {}) {
  return {
    mutate: vi.fn(),
    isPending: false,
    ...extra,
  } as unknown as ReturnType<typeof useRecomputeBrief>;
}

function renderCard() {
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={{ brief: briefMessages, prReview: prReviewMessages }}
    >
      <PrBriefCard prId="pr-1" />
    </NextIntlClientProvider>,
  );
}

describe("PrBriefCard", () => {
  it("shows a loading skeleton with Recompute disabled while the Brief request is in flight", () => {
    mockUsePrReviews.mockReturnValue(queryResult([]));
    mockUsePrRuns.mockReturnValue(queryResult([]) as unknown as ReturnType<typeof usePrRuns>);
    mockUseBrief.mockReturnValue(
      queryResult(undefined, { isLoading: true }) as unknown as ReturnType<typeof useBrief>,
    );
    mockUseRecomputeBrief.mockReturnValue(mutationResult());

    renderCard();
    expect(screen.getByRole("button", { name: "Recompute" })).toBeDisabled();
  });

  it("shows the honest empty state plus a working Recompute button when the Brief request errors", () => {
    mockUsePrReviews.mockReturnValue(queryResult([]));
    mockUsePrRuns.mockReturnValue(queryResult([]) as unknown as ReturnType<typeof usePrRuns>);
    mockUseBrief.mockReturnValue(
      queryResult(undefined, { isError: true }) as unknown as ReturnType<typeof useBrief>,
    );
    const mutate = vi.fn();
    mockUseRecomputeBrief.mockReturnValue(mutationResult({ mutate }));

    renderCard();
    expect(screen.getByText("Brief not available yet.")).toBeInTheDocument();
    expect(screen.getByText("Run a review or open the PR to compute it.")).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: "Recompute" });
    expect(btn).not.toBeDisabled();
    btn.click();
    expect(mutate).toHaveBeenCalled();
  });

  it("renders the Brief's what/why narrative and risk-level label, with findings·blockers pill and score ring sourced from reviews/runs", () => {
    mockUsePrReviews.mockReturnValue(
      queryResult([
        {
          id: "rev-1",
          run_id: "run-1",
          verdict: "request_changes",
          summary: "Two blockers before merge.",
          score: 61,
          findings: [{ id: "f1" }, { id: "f2" }],
        },
      ]),
    );
    mockUsePrRuns.mockReturnValue(
      queryResult([
        { run_id: "run-1", blockers: 2, cost_usd: 0.014, tokens_in: 8200, tokens_out: 1300 },
      ]) as unknown as ReturnType<typeof usePrRuns>,
    );
    mockUseBrief.mockReturnValue(
      queryResult({
        brief: {
          what: "Adds JWT-based auth.",
          why: "Replaces the legacy session cookie flow.",
          risk_level: "high",
          risks: [],
          review_focus: [],
        },
      }) as unknown as ReturnType<typeof useBrief>,
    );
    mockUseRecomputeBrief.mockReturnValue(mutationResult());

    renderCard();
    expect(
      screen.getByText("Adds JWT-based auth. Replaces the legacy session cookie flow."),
    ).toBeInTheDocument();
    expect(screen.getByText("High risk")).toBeInTheDocument();
    expect(screen.getByText(/2 findings/)).toBeInTheDocument();
    expect(screen.getByText(/2 blockers/)).toBeInTheDocument();
    expect(screen.getByText("61")).toBeInTheDocument();
    expect(screen.getByText(/\$0\.014/)).toBeInTheDocument();
  });

  it("sources the pill/score from the most-blocking review even when it isn't the newest one", () => {
    // Agent-B's comment review is newer (listed first = newest-first API order),
    // but Agent-A's request_changes is more blocking — selectMostBlockingReview
    // (unchanged by SPEC-02) must still pick it for the findings/score data.
    mockUsePrReviews.mockReturnValue(
      queryResult([
        {
          id: "rev-2",
          run_id: "run-2",
          agent_id: "agent-b",
          agent_name: "Agent B",
          verdict: "comment",
          summary: "Left a comment.",
          score: 80,
          findings: [],
          created_at: "2026-07-02T12:01:00Z",
        },
        {
          id: "rev-1",
          run_id: "run-1",
          agent_id: "agent-a",
          agent_name: "Agent A",
          verdict: "request_changes",
          summary: "Two blockers before merge.",
          score: 55,
          findings: [{ id: "f1" }, { id: "f2" }],
          created_at: "2026-07-02T12:00:00Z",
        },
      ]),
    );
    mockUsePrRuns.mockReturnValue(
      queryResult([
        { run_id: "run-1", blockers: 2, cost_usd: 0.011, tokens_in: 7000, tokens_out: 900 },
        { run_id: "run-2", blockers: 0, cost_usd: 0.005, tokens_in: 3000, tokens_out: 400 },
      ]) as unknown as ReturnType<typeof usePrRuns>,
    );
    mockUseBrief.mockReturnValue(
      queryResult({
        brief: {
          what: "Refactors the payment webhook.",
          why: "Prevents duplicate charge events.",
          risk_level: "medium",
          risks: [],
          review_focus: [],
        },
      }) as unknown as ReturnType<typeof useBrief>,
    );
    mockUseRecomputeBrief.mockReturnValue(mutationResult());

    renderCard();
    expect(screen.getByText("Medium risk")).toBeInTheDocument();
    // The pill/score come from Agent A's request_changes review (most blocking),
    // not Agent B's newer comment.
    expect(screen.getByText("55")).toBeInTheDocument();
    expect(screen.getByText(/2 findings/)).toBeInTheDocument();
    expect(screen.getByText(/2 blockers/)).toBeInTheDocument();
  });
});
