import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import briefMessages from "../../../../../../../../messages/en/brief.json";
import prReviewMessages from "../../../../../../../../messages/en/prReview.json";
import { OverviewTab } from "./OverviewTab";

afterEach(cleanup);

// Mock the hooks used by child cards so OverviewTab is testable without a live
// API. Each mock returns a minimal stub via the double-cast pattern (per
// client/INSIGHTS.md 2026-06-30 — TanStack Query hooks).
vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: vi.fn(),
  usePrRuns: vi.fn(),
}));

vi.mock("@/lib/hooks/intent", () => ({
  useIntent: vi.fn(),
  useComputeIntent: vi.fn(),
}));

vi.mock("@/lib/hooks/blast", () => ({
  useBlastRadius: vi.fn(),
}));

// PrBriefCard and ReviewFocusSection both gained useBrief/useRecomputeBrief —
// the composite test must mock them too (client/INSIGHTS.md 2026-07-06).
vi.mock("@/lib/hooks/brief", () => ({
  useBrief: vi.fn(),
  useRecomputeBrief: vi.fn(),
}));

import { usePrReviews, usePrRuns } from "@/lib/hooks/reviews";
import { useIntent, useComputeIntent } from "@/lib/hooks/intent";
import { useBlastRadius } from "@/lib/hooks/blast";
import { useBrief, useRecomputeBrief } from "@/lib/hooks/brief";

const mockUsePrReviews = vi.mocked(usePrReviews);
const mockUsePrRuns = vi.mocked(usePrRuns);
const mockUseIntent = vi.mocked(useIntent);
const mockUseComputeIntent = vi.mocked(useComputeIntent);
const mockUseBlastRadius = vi.mocked(useBlastRadius);
const mockUseBrief = vi.mocked(useBrief);
const mockUseRecomputeBrief = vi.mocked(useRecomputeBrief);

/** Build a minimal TanStack Query stub — casts through unknown per INSIGHTS. */
function q<T extends (...args: never[]) => unknown>(
  data: unknown,
  extra: Record<string, unknown> = {},
) {
  return { data, isLoading: false, isPending: false, ...extra } as unknown as ReturnType<T>;
}

function renderTab(prId: string | number = "pr-1") {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider
        locale="en"
        messages={{ brief: briefMessages, prReview: prReviewMessages }}
      >
        <OverviewTab prId={prId} repoFullName={null} headSha={null} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

/** Set all child-card hooks to their honest empty states. */
function setupEmptyState() {
  mockUsePrReviews.mockReturnValue(q<typeof usePrReviews>([]));
  mockUsePrRuns.mockReturnValue(q<typeof usePrRuns>([]));
  mockUseIntent.mockReturnValue(q<typeof useIntent>({ intent: null }));
  mockUseComputeIntent.mockReturnValue(
    q<typeof useComputeIntent>(undefined, { mutate: vi.fn(), isPending: false }),
  );
  mockUseBlastRadius.mockReturnValue(
    q<typeof useBlastRadius>(undefined, { isError: true }),
  );
  mockUseBrief.mockReturnValue(q<typeof useBrief>(undefined, { isError: true }));
  mockUseRecomputeBrief.mockReturnValue(
    q<typeof useRecomputeBrief>(undefined, { mutate: vi.fn(), isPending: false }),
  );
}

describe("OverviewTab", () => {
  it("renders the PR BRIEF section label", () => {
    setupEmptyState();
    renderTab();
    // SectionLabel forces textTransform:uppercase; the t("prBrief") value is
    // "PR brief" which renders as "PR BRIEF" via CSS — but the text node itself
    // is "PR brief", so we match the source string.
    expect(screen.getByText("PR brief")).toBeInTheDocument();
  });

  it("renders the Intent card title", () => {
    setupEmptyState();
    renderTab();
    expect(screen.getByText("Intent")).toBeInTheDocument();
  });

  it("renders the Blast radius card title", () => {
    setupEmptyState();
    renderTab();
    expect(screen.getByText("Blast radius")).toBeInTheDocument();
  });

  it("does NOT render a Description section", () => {
    setupEmptyState();
    renderTab();
    // The Description section was removed per the design mock (defect #1).
    expect(screen.queryByText("Description")).not.toBeInTheDocument();
  });

  it("does NOT render PR body text even when passed via hook data", () => {
    // The OverviewTab no longer accepts a prBody prop; this test ensures no
    // description-like content leaks into the rendered output.
    setupEmptyState();
    renderTab();
    // No element should contain markup resembling a description block.
    expect(screen.queryByText(/fix a bug in the auth module/i)).not.toBeInTheDocument();
  });
});
