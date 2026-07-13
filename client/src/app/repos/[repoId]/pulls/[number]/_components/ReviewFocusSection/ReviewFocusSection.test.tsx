import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import briefMessages from "../../../../../../../../messages/en/brief.json";
import { ReviewFocusSection } from "./ReviewFocusSection";

afterEach(cleanup);

vi.mock("@/lib/hooks/brief", () => ({
  useBrief: vi.fn(),
}));

import { useBrief } from "@/lib/hooks/brief";

const mockUseBrief = vi.mocked(useBrief);

// Partial stub double-cast through unknown (per client INSIGHTS on mocking
// TanStack Query hooks).
function queryResult(data: unknown, extra: Record<string, unknown> = {}) {
  return { data, isLoading: false, isError: false, ...extra } as unknown as ReturnType<
    typeof useBrief
  >;
}

function renderSection(props: { repoFullName: string | null; headSha: string | null }) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief: briefMessages }}>
      <ReviewFocusSection prId="pr-1" {...props} />
    </NextIntlClientProvider>,
  );
}

describe("ReviewFocusSection", () => {
  it("shows the loading copy while the Brief request is in flight", () => {
    mockUseBrief.mockReturnValue(queryResult(undefined, { isLoading: true }));
    renderSection({ repoFullName: null, headSha: null });
    expect(screen.getByText("Computing review focus…")).toBeInTheDocument();
  });

  it("shows an honest empty state when review_focus is empty", () => {
    mockUseBrief.mockReturnValue(
      queryResult({
        brief: {
          what: "x",
          why: "y",
          risk_level: "low",
          risks: [],
          review_focus: [],
        },
      }),
    );
    renderSection({ repoFullName: null, headSha: null });
    expect(
      screen.getByText("No specific files flagged for focused review."),
    ).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("shows the same honest empty state on a Brief error, without a duplicate error UI", () => {
    mockUseBrief.mockReturnValue(queryResult(undefined, { isError: true }));
    renderSection({ repoFullName: null, headSha: null });
    expect(
      screen.getByText("No specific files flagged for focused review."),
    ).toBeInTheDocument();
  });

  it("renders a count badge and working githubBlobUrl deep links pinned to head sha, opening in a new tab", () => {
    mockUseBrief.mockReturnValue(
      queryResult({
        brief: {
          what: "x",
          why: "y",
          risk_level: "high",
          risks: [],
          review_focus: [
            { file: "src/auth/session.ts", line: 42, reason: "New token verification path" },
            { file: "src/auth/jwt.ts", line: 10, reason: "Signature check" },
          ],
        },
      }),
    );
    renderSection({ repoFullName: "acme/widgets", headSha: "abc123" });

    expect(screen.getByText("2")).toBeInTheDocument();
    const link = screen.getByRole("link", {
      name: "src/auth/session.ts:42 — New token verification path",
    });
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/acme/widgets/blob/abc123/src/auth/session.ts#L42",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
  });

  it("renders plain text (no link) when repoFullName/headSha is null", () => {
    mockUseBrief.mockReturnValue(
      queryResult({
        brief: {
          what: "x",
          why: "y",
          risk_level: "low",
          risks: [],
          review_focus: [{ file: "src/foo.ts", line: 3, reason: "Check bounds" }],
        },
      }),
    );
    renderSection({ repoFullName: null, headSha: null });

    const item = screen.getByTestId("review-focus-item");
    expect(item.textContent).toBe("src/foo.ts:3 — Check bounds");
    expect(item.tagName).not.toBe("A");
  });
});
