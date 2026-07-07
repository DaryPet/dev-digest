import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import briefMessages from "../../../../../../../../messages/en/brief.json";
import { BlastRadiusCard } from "./BlastRadiusCard";
import { githubBlobUrl } from "@/lib/github-urls";

afterEach(cleanup);

// Mock useBlastRadius — cast via `as unknown as ReturnType<typeof ...>` so only
// the fields the component reads need to be supplied (INSIGHTS 2026-06-30).
vi.mock("@/lib/hooks/blast", () => ({
  useBlastRadius: vi.fn(),
}));

import { useBlastRadius } from "@/lib/hooks/blast";

const mockUseBlastRadius = vi.mocked(useBlastRadius);

/** Build a minimal TanStack Query stub. */
function blast(data: unknown, extra: Record<string, unknown> = {}) {
  return {
    data,
    isLoading: false,
    isError: false,
    ...extra,
  } as unknown as ReturnType<typeof useBlastRadius>;
}

const REPO = "owner/repo";
const SHA = "abc123def456";

function renderCard(
  prId: string | number = "pr-1",
  repoFullName: string | null = REPO,
  headSha: string | null = SHA,
) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief: briefMessages }}>
      <BlastRadiusCard prId={prId} repoFullName={repoFullName} headSha={headSha} />
    </NextIntlClientProvider>,
  );
}

// ---- Fixtures ----

/** One symbol (callable function), one caller, one endpoint. */
const SYMBOL_DATA = {
  blast: {
    changed_symbols: [{ name: "myFn", file: "src/utils.ts", kind: "function" }],
    downstream: [
      {
        symbol: "myFn",
        callers: [{ name: "caller", file: "src/api.ts", line: 42 }],
        endpoints_affected: ["GET /api/users"],
        crons_affected: [],
      },
    ],
    summary: "1 symbols · 1 callers · 1 endpoints · 0 cron",
  },
  index: { status: "full" as const, degraded: false, reason: null },
};

/** Two symbols: first with 1 caller, second with 1 caller. */
const TWO_SYMBOL_DATA = {
  blast: {
    changed_symbols: [
      { name: "myFn", file: "src/utils.ts", kind: "function" },
      { name: "otherFn", file: "src/other.ts", kind: "method" },
    ],
    downstream: [
      {
        symbol: "myFn",
        callers: [{ name: "c1", file: "src/api.ts", line: 42 }],
        endpoints_affected: [],
        crons_affected: [],
      },
      {
        symbol: "otherFn",
        callers: [{ name: "c2", file: "src/service.ts", line: 99 }],
        endpoints_affected: [],
        crons_affected: [],
      },
    ],
    summary: "2 symbols · 2 callers · 0 endpoints · 0 cron",
  },
  index: { status: "full" as const, degraded: false, reason: null },
};

/** No symbols, no callers (honest empty). */
const EMPTY_BLAST_DATA = {
  blast: {
    changed_symbols: [],
    downstream: [],
    summary: "0 symbols · 0 callers · 0 endpoints · 0 cron",
  },
  index: { status: "full" as const, degraded: false, reason: null },
};

describe("BlastRadiusCard", () => {
  // ---- State 1: loading ----

  it("shows loading text while the query is in flight", () => {
    mockUseBlastRadius.mockReturnValue(blast(undefined, { isLoading: true }));
    renderCard();
    expect(screen.getByText("Computing blast radius…")).toBeInTheDocument();
  });

  it("does not render content while loading", () => {
    mockUseBlastRadius.mockReturnValue(blast(undefined, { isLoading: true }));
    renderCard();
    expect(
      screen.queryByText("Blast radius has not been computed for this PR yet."),
    ).not.toBeInTheDocument();
  });

  // ---- State 2: empty (no symbols / no callers) ----

  it("shows noBlast copy when blast has no symbols and no callers", () => {
    mockUseBlastRadius.mockReturnValue(blast(EMPTY_BLAST_DATA));
    renderCard();
    expect(
      screen.getByText("Blast radius has not been computed for this PR yet."),
    ).toBeInTheDocument();
  });

  it("shows noBlast copy on query error", () => {
    mockUseBlastRadius.mockReturnValue(blast(undefined, { isError: true }));
    renderCard();
    expect(
      screen.getByText("Blast radius has not been computed for this PR yet."),
    ).toBeInTheDocument();
  });

  // ---- State 3: data — counts header ----

  /**
   * Count row renders the number and label as two sibling <span>s (bold
   * number + muted label, per the design mock) rather than one text node —
   * match by an element's combined textContent instead of exact text.
   */
  function getByCountText(text: string) {
    return screen.getByText((_, element) => {
      if (!element || element.tagName.toLowerCase() !== "span") return false;
      return element.textContent?.replace(/\s+/g, " ").trim() === text;
    });
  }

  it("renders count row with symbol count", () => {
    mockUseBlastRadius.mockReturnValue(blast(SYMBOL_DATA));
    renderCard();
    // "1 symbols" appears only in the count row; symbol band rows do not show symbol count
    expect(getByCountText("1 symbols")).toBeInTheDocument();
    expect(getByCountText("1 endpoints")).toBeInTheDocument();
    expect(getByCountText("0 cron")).toBeInTheDocument();
    // "1 callers" appears in both the count row and the symbol band row
    expect(screen.getAllByText("1 callers").length).toBeGreaterThan(0);
  });

  // ---- State 3: data — symbol tree (callable `()` suffix, first expanded) ----

  it("renders callable symbol name with () suffix in the tree", () => {
    mockUseBlastRadius.mockReturnValue(blast(SYMBOL_DATA));
    renderCard();
    expect(screen.getByText("myFn()")).toBeInTheDocument();
  });

  it("first symbol is expanded by default — its callers are visible", () => {
    mockUseBlastRadius.mockReturnValue(blast(SYMBOL_DATA));
    renderCard();
    // The caller link is only rendered when the symbol is expanded
    const link = screen.getByRole("link", { name: /src\/api\.ts:42/i });
    const expected = githubBlobUrl(REPO, SHA, "src/api.ts", 42);
    expect(link).toHaveAttribute("href", expected);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
  });

  it("second symbol is collapsed by default — its callers are hidden", () => {
    mockUseBlastRadius.mockReturnValue(blast(TWO_SYMBOL_DATA));
    renderCard();
    // First symbol (myFn) callers ARE visible
    expect(screen.getByText("src/api.ts:42")).toBeInTheDocument();
    // Second symbol (otherFn) callers are NOT visible (collapsed)
    expect(screen.queryByText("src/service.ts:99")).not.toBeInTheDocument();
  });

  it("clicking a symbol band collapses the expanded symbol", () => {
    mockUseBlastRadius.mockReturnValue(blast(SYMBOL_DATA));
    renderCard();
    expect(screen.getByText("src/api.ts:42")).toBeInTheDocument();
    // The symbol band row is the button for that symbol
    const band = screen.getByRole("button", { name: /myFn/i });
    fireEvent.click(band);
    expect(screen.queryByText("src/api.ts:42")).not.toBeInTheDocument();
  });

  it("clicking a collapsed symbol band expands it", () => {
    mockUseBlastRadius.mockReturnValue(blast(TWO_SYMBOL_DATA));
    renderCard();
    // Second symbol (otherFn) starts collapsed
    expect(screen.queryByText("src/service.ts:99")).not.toBeInTheDocument();
    const band = screen.getByRole("button", { name: /otherFn/i });
    fireEvent.click(band);
    expect(screen.getByText("src/service.ts:99")).toBeInTheDocument();
  });

  // ---- State 3: data — plain text fallback when no deep-link ----

  it("renders caller as plain text when repoFullName is null", () => {
    mockUseBlastRadius.mockReturnValue(blast(SYMBOL_DATA));
    renderCard("pr-1", null, null);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("src/api.ts:42")).toBeInTheDocument();
  });

  it("renders caller as plain text when headSha is null", () => {
    mockUseBlastRadius.mockReturnValue(blast(SYMBOL_DATA));
    renderCard("pr-1", REPO, null);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  // ---- Tree / Graph segmented toggle ----

  it("shows Tree and Graph toggle buttons in data state", () => {
    mockUseBlastRadius.mockReturnValue(blast(SYMBOL_DATA));
    renderCard();
    expect(screen.getByRole("button", { name: /^tree$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^graph$/i })).toBeInTheDocument();
  });

  it("clicking Graph shows SVG graph and hides tree symbol rows", () => {
    mockUseBlastRadius.mockReturnValue(blast(SYMBOL_DATA));
    renderCard();
    // Tree view: symbol band visible
    expect(screen.getByRole("button", { name: /myFn/i })).toBeInTheDocument();
    // Switch to graph
    fireEvent.click(screen.getByRole("button", { name: /^graph$/i }));
    // SVG graph is present
    expect(screen.getByTestId("blast-graph")).toBeInTheDocument();
    // Symbol band rows are gone
    expect(screen.queryByRole("button", { name: /myFn/i })).not.toBeInTheDocument();
  });

  it("clicking Tree after Graph switches back to tree view", () => {
    mockUseBlastRadius.mockReturnValue(blast(SYMBOL_DATA));
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: /^graph$/i }));
    expect(screen.getByTestId("blast-graph")).toBeInTheDocument();
    // Switch back to tree
    fireEvent.click(screen.getByRole("button", { name: /^tree$/i }));
    expect(screen.queryByTestId("blast-graph")).not.toBeInTheDocument();
    expect(screen.getByText("myFn()")).toBeInTheDocument();
  });

  // ---- State 4: degraded badge alongside data / empty state ----

  it("shows degraded badge alongside data when index.status is partial", () => {
    mockUseBlastRadius.mockReturnValue(
      blast({
        ...SYMBOL_DATA,
        index: { status: "partial" as const, degraded: false, reason: null },
      }),
    );
    renderCard();
    expect(screen.getByText("myFn()")).toBeInTheDocument();
    expect(screen.getByText("Partial index")).toBeInTheDocument();
    expect(
      screen.getByText(
        "The code index is incomplete — callers and endpoints may be missing.",
      ),
    ).toBeInTheDocument();
  });

  it("shows degraded badge alongside data when index.degraded is true", () => {
    mockUseBlastRadius.mockReturnValue(
      blast({
        ...SYMBOL_DATA,
        index: { status: "full" as const, degraded: true, reason: null },
      }),
    );
    renderCard();
    expect(screen.getByText("myFn()")).toBeInTheDocument();
    expect(screen.getByText("Partial index")).toBeInTheDocument();
  });

  it("shows degraded badge alongside empty state when index is degraded", () => {
    mockUseBlastRadius.mockReturnValue(
      blast({
        ...EMPTY_BLAST_DATA,
        index: { status: "full" as const, degraded: true, reason: null },
      }),
    );
    renderCard();
    expect(
      screen.getByText("Blast radius has not been computed for this PR yet."),
    ).toBeInTheDocument();
    expect(screen.getByText("Partial index")).toBeInTheDocument();
  });

  it("shows degraded badge alongside empty state when index.status is failed", () => {
    mockUseBlastRadius.mockReturnValue(
      blast({
        ...EMPTY_BLAST_DATA,
        index: { status: "failed" as const, degraded: false, reason: null },
      }),
    );
    renderCard();
    expect(
      screen.getByText("Blast radius has not been computed for this PR yet."),
    ).toBeInTheDocument();
    expect(screen.getByText("Partial index")).toBeInTheDocument();
  });

  it("does NOT show degraded badge on a clean full index", () => {
    mockUseBlastRadius.mockReturnValue(blast(SYMBOL_DATA));
    renderCard();
    expect(screen.queryByText("Partial index")).not.toBeInTheDocument();
  });

  // ---- Card frame preserved ----

  it("renders the blast radius card title", () => {
    mockUseBlastRadius.mockReturnValue(blast(undefined, { isError: true }));
    renderCard();
    expect(screen.getByText("Blast radius")).toBeInTheDocument();
  });

  it("preserves the Prior-PRs bar toggle button", () => {
    mockUseBlastRadius.mockReturnValue(blast(undefined, { isError: true }));
    renderCard();
    expect(
      screen.getByRole("button", { name: /prior prs touching these files/i }),
    ).toBeInTheDocument();
  });

  it("toggles the prior-PRs bar to reveal the empty history copy", () => {
    mockUseBlastRadius.mockReturnValue(blast(undefined, { isError: true }));
    renderCard();
    const bar = screen.getByRole("button", { name: /prior prs touching these files/i });
    expect(screen.queryByText("No prior PRs overlap these files.")).not.toBeInTheDocument();
    fireEvent.click(bar);
    expect(screen.getByText("No prior PRs overlap these files.")).toBeInTheDocument();
  });
});
