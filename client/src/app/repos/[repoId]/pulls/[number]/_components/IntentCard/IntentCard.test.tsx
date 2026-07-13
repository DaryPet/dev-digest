import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import messages from "../../../../../../../../messages/en/brief.json";
import { IntentCard } from "./IntentCard";

afterEach(cleanup);

const mutate = vi.fn();

// Mock the intent hooks so the component is testable without a live API.
vi.mock("@/lib/hooks/intent", () => ({
  useIntent: vi.fn(),
  useComputeIntent: vi.fn(),
}));

// IntentCard also reads the Brief's risks[] (SPEC-02) via the hook shared
// with PrBriefCard/ReviewFocusSection — mock it too, per the composite-test
// rule (client/INSIGHTS.md 2026-07-06).
vi.mock("@/lib/hooks/brief", () => ({
  useBrief: vi.fn(),
}));

import { useIntent, useComputeIntent } from "@/lib/hooks/intent";
import { useBrief } from "@/lib/hooks/brief";

const mockUseIntent = vi.mocked(useIntent);
const mockUseComputeIntent = vi.mocked(useComputeIntent);
const mockUseBrief = vi.mocked(useBrief);

// Helpers to build partial mock return values without satisfying the full
// TanStack Query return types (double-cast through unknown).
function intentResult(data: Parameters<typeof useIntent>[0] extends infer _ ? unknown : never, isLoading: boolean) {
  return { data, isLoading } as unknown as ReturnType<typeof useIntent>;
}
function computeResult(isPending: boolean) {
  return { mutate, isPending } as unknown as ReturnType<typeof useComputeIntent>;
}
function briefResult(risks: unknown[] = []) {
  return { data: { brief: { risks } } } as unknown as ReturnType<typeof useBrief>;
}

interface RenderOptions {
  computePending?: boolean;
  risks?: unknown[];
}

function renderCard(
  prId: string | number = "pr-1",
  { computePending = false, risks = [] }: RenderOptions = {},
) {
  mockUseComputeIntent.mockReturnValue(computeResult(computePending));
  mockUseBrief.mockReturnValue(briefResult(risks));

  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
        <IntentCard prId={prId} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("IntentCard", () => {
  it("shows skeleton loading state while the query is in flight", () => {
    mockUseIntent.mockReturnValue(intentResult(undefined, true));

    renderCard();
    // Skeletons render as divs with class "skeleton"
    const skeletons = document.querySelectorAll(".skeleton");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("shows the empty state when intent has never been computed", () => {
    mockUseIntent.mockReturnValue(intentResult({ intent: null }, false));

    renderCard();
    expect(screen.getByText("Brief not available yet.")).toBeInTheDocument();
    expect(screen.getByText("Run a review or open the PR to compute it.")).toBeInTheDocument();
  });

  it("renders intent summary, in-scope and out-of-scope items", () => {
    mockUseIntent.mockReturnValue(
      intentResult(
        {
          intent: {
            intent: "Refactor the auth module to use JWT.",
            in_scope: ["Auth module", "Token validation"],
            out_of_scope: ["UI changes", "Database schema"],
          },
        },
        false,
      ),
    );

    renderCard();
    expect(screen.getByText("Refactor the auth module to use JWT.")).toBeInTheDocument();
    expect(screen.getByText("Auth module")).toBeInTheDocument();
    expect(screen.getByText("Token validation")).toBeInTheDocument();
    expect(screen.getByText("UI changes")).toBeInTheDocument();
    expect(screen.getByText("Database schema")).toBeInTheDocument();
  });

  it("renders in-scope / out-of-scope section labels", () => {
    mockUseIntent.mockReturnValue(
      intentResult(
        {
          intent: {
            intent: "Add dark mode.",
            in_scope: ["Theme toggle"],
            out_of_scope: [],
          },
        },
        false,
      ),
    );

    renderCard();
    expect(screen.getByText("In scope")).toBeInTheDocument();
    expect(screen.getByText("Out of scope")).toBeInTheDocument();
  });

  it("renders the card title from the brief namespace", () => {
    mockUseIntent.mockReturnValue(intentResult({ intent: null }, false));

    renderCard();
    expect(screen.getByText("Intent")).toBeInTheDocument();
  });

  it("renders a Recompute button and calls mutate when clicked", () => {
    mockUseIntent.mockReturnValue(intentResult({ intent: null }, false));

    renderCard();
    const btn = screen.getByRole("button", { name: /recompute/i });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("disables the Recompute button while mutation is pending", () => {
    mockUseIntent.mockReturnValue(intentResult({ intent: null }, false));

    renderCard("pr-1", { computePending: true });
    const btn = screen.getByRole("button", { name: /recompute/i });
    expect(btn).toBeDisabled();
  });

  it("shows dash placeholder when in_scope list is empty", () => {
    mockUseIntent.mockReturnValue(
      intentResult({ intent: { intent: "Minor fix.", in_scope: [], out_of_scope: [] } }, false),
    );

    renderCard();
    // Both in_scope and out_of_scope are empty — renders "—" placeholders
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBe(2);
  });

  it("shows an honest empty state when the Brief has no risks", () => {
    mockUseIntent.mockReturnValue(
      intentResult({ intent: { intent: "Minor fix.", in_scope: [], out_of_scope: [] } }, false),
    );

    renderCard("pr-1", { risks: [] });
    expect(screen.getByText("No notable risks flagged.")).toBeInTheDocument();
  });

  it("renders the Brief's grounded risks[] with title and file refs", () => {
    mockUseIntent.mockReturnValue(
      intentResult({ intent: { intent: "Minor fix.", in_scope: [], out_of_scope: [] } }, false),
    );

    renderCard("pr-1", {
      risks: [
        {
          title: "Auth surface touched",
          explanation: "The rate limiter wraps the login route.",
          file_refs: ["src/middleware/ratelimit.ts:12-18"],
        },
      ],
    });

    expect(screen.getByText("Auth surface touched")).toBeInTheDocument();
    expect(screen.getByText("src/middleware/ratelimit.ts:12-18")).toBeInTheDocument();
    expect(
      screen.queryByText("The rate limiter wraps the login route."),
    ).not.toBeInTheDocument();
  });

  it("expands a risk item to show its explanation on click", () => {
    mockUseIntent.mockReturnValue(
      intentResult({ intent: { intent: "Minor fix.", in_scope: [], out_of_scope: [] } }, false),
    );

    renderCard("pr-1", {
      risks: [
        {
          title: "New dependency: ioredis",
          explanation: "Adds a Redis client dependency.",
          file_refs: ["package.json:34"],
        },
      ],
    });

    fireEvent.click(screen.getByRole("button", { name: /New dependency: ioredis/ }));
    expect(screen.getByText("Adds a Redis client dependency.")).toBeInTheDocument();
  });
});
