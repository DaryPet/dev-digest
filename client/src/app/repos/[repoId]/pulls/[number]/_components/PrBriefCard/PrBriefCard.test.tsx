import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import briefMessages from "../../../../../../../../messages/en/brief.json";
import prReviewMessages from "../../../../../../../../messages/en/prReview.json";
import { PrBriefCard } from "./PrBriefCard";

afterEach(cleanup);

// Mock the review hooks so the component is testable without a live API.
vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: vi.fn(),
  usePrRuns: vi.fn(),
}));

import { usePrReviews, usePrRuns } from "@/lib/hooks/reviews";

const mockUsePrReviews = vi.mocked(usePrReviews);
const mockUsePrRuns = vi.mocked(usePrRuns);

// Partial stubs double-cast through unknown (per client INSIGHTS on mocking
// TanStack Query hooks).
function queryResult(data: unknown, isLoading = false) {
  return { data, isLoading } as unknown as ReturnType<typeof usePrReviews>;
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
  it("shows the honest empty state when no review has run", () => {
    mockUsePrReviews.mockReturnValue(queryResult([]));
    mockUsePrRuns.mockReturnValue(queryResult([]) as unknown as ReturnType<typeof usePrRuns>);

    renderCard();
    expect(screen.getByText("Brief not available yet.")).toBeInTheDocument();
  });

  it("renders the latest review's verdict, summary, findings count and score", () => {
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

    renderCard();
    expect(screen.getByText("Request changes")).toBeInTheDocument();
    expect(screen.getByText("Two blockers before merge.")).toBeInTheDocument();
    expect(screen.getByText(/2 findings/)).toBeInTheDocument();
    expect(screen.getByText(/2 blockers/)).toBeInTheDocument();
    expect(screen.getByText("61")).toBeInTheDocument();
    expect(screen.getByText(/\$0\.014/)).toBeInTheDocument();
  });

  it("shows request_changes when it is more blocking than a newer comment from a different agent", () => {
    // Agent-B's comment review is newer (listed first = newest-first API order),
    // but Agent-A's request_changes is more blocking. The card must show the
    // most-blocking verdict, not the newest-review verdict.
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

    renderCard();
    // Must display the more-blocking verdict even though it's from the older review.
    expect(screen.getByText("Request changes")).toBeInTheDocument();
    expect(screen.getByText("Two blockers before merge.")).toBeInTheDocument();
  });

  it("deduplicates same-agent reviews and uses only the newest one", () => {
    // Agent-A submitted two reviews in the same run-pass; only the newest (first)
    // should count. Both have the same agent_id so second is deduplicated away.
    mockUsePrReviews.mockReturnValue(
      queryResult([
        {
          id: "rev-2",
          run_id: "run-2",
          agent_id: "agent-a",
          verdict: "comment",
          summary: "Latest pass: just a comment.",
          score: 78,
          findings: [],
          created_at: "2026-07-02T13:00:00Z",
        },
        {
          id: "rev-1",
          run_id: "run-1",
          agent_id: "agent-a",
          verdict: "request_changes",
          summary: "Old pass: changes needed.",
          score: 50,
          findings: [{ id: "f1" }],
          created_at: "2026-07-02T12:00:00Z",
        },
      ]),
    );
    mockUsePrRuns.mockReturnValue(
      queryResult([
        { run_id: "run-2", blockers: 0, cost_usd: 0.005, tokens_in: 3000, tokens_out: 400 },
      ]) as unknown as ReturnType<typeof usePrRuns>,
    );

    renderCard();
    // Same agent: newest pass (comment) wins — the old request_changes is stale.
    expect(screen.getByText("Comment")).toBeInTheDocument();
    expect(screen.getByText("Latest pass: just a comment.")).toBeInTheDocument();
  });
});
