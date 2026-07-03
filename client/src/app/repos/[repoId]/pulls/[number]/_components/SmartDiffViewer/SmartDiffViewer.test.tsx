/* SmartDiffViewer.test.tsx
   Spec: specs/smart-diff.md §8 T2 tests (+ §13 design-parity amendment).
   Pattern mirrors IntentCard.test.tsx: vi.mock the hook, wrap in
   NextIntlClientProvider + QueryClientProvider, double-cast stubs.
*/
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import smartDiffMessages from "../../../../../../../../messages/en/smartDiff.json";
import { SmartDiffViewer, type SmartDiffOrder } from "./SmartDiffViewer";
import type { SmartDiff, PrFile } from "@devdigest/shared";

afterEach(cleanup);

// ----- Mock the hook -----
vi.mock("@/lib/hooks/smart-diff", () => ({
  useSmartDiff: vi.fn(),
}));

import { useSmartDiff } from "@/lib/hooks/smart-diff";

const mockUseSmartDiff = vi.mocked(useSmartDiff);

function stubQuery(data: SmartDiff | undefined, isLoading = false) {
  return { data, isLoading } as unknown as ReturnType<typeof useSmartDiff>;
}

// ----- Fixtures -----

/** Patch for "src/service.ts": 4 context lines, then an add at newNo=5. */
const SERVICE_PATCH = [
  "@@ -1,5 +1,10 @@",
  " ctx1",
  " ctx2",
  " ctx3",
  " ctx4",
  "+finding line",
].join("\n");

const SMART_DIFF_STUB: SmartDiff = {
  groups: [
    {
      role: "core",
      files: [
        {
          path: "src/service.ts",
          pseudocode_summary: null,
          additions: 10,
          deletions: 2,
          // 5 distinct start_lines -> badge reads "5 findings"; [0] (=5) is the
          // scroll target and matches the added line in SERVICE_PATCH below.
          finding_lines: [5, 8, 12, 20, 33],
        },
      ],
    },
    {
      role: "wiring",
      files: [
        {
          path: "tsconfig.json",
          pseudocode_summary: null,
          additions: 1,
          deletions: 0,
          finding_lines: [],
        },
      ],
    },
    {
      role: "boilerplate",
      files: [
        {
          path: "pnpm-lock.yaml",
          pseudocode_summary: null,
          additions: 100,
          deletions: 50,
          finding_lines: [],
        },
      ],
    },
  ],
  split_suggestion: { too_big: false, total_lines: 163, proposed_splits: [] },
};

const PR_FILES_STUB: PrFile[] = [
  {
    path: "src/service.ts",
    additions: 10,
    deletions: 2,
    patch: SERVICE_PATCH,
  },
  {
    path: "tsconfig.json",
    additions: 1,
    deletions: 0,
    patch: "@@ -1,1 +1,2 @@\n {\n+  \"strict\": true\n }",
  },
  {
    path: "pnpm-lock.yaml",
    additions: 100,
    deletions: 50,
    patch: null,
  },
];

// ----- Helpers -----

function renderViewer(
  prId: string | null = "pr-1",
  files: PrFile[] = PR_FILES_STUB,
  mode: SmartDiffOrder = "smart",
  onModeChange: (m: SmartDiffOrder) => void = vi.fn(),
) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ smartDiff: smartDiffMessages }}>
        <SmartDiffViewer
          prId={prId}
          files={files}
          mode={mode}
          onModeChange={onModeChange}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

// ----- Tests -----

describe("SmartDiffViewer", () => {
  beforeEach(() => {
    // JSDOM doesn't implement scrollIntoView — mock it so badge-click tests work.
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("renders nothing when prId is null", () => {
    mockUseSmartDiff.mockReturnValue(stubQuery(undefined));
    const { container } = renderViewer(null);
    expect(container.firstChild).toBeNull();
  });

  it("shows loading skeletons while the query is in flight", () => {
    mockUseSmartDiff.mockReturnValue(stubQuery(undefined, true));
    renderViewer();
    // Skeleton renders as divs with class "skeleton".
    const skeletons = document.querySelectorAll(".skeleton");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("renders nothing when data is undefined and not loading", () => {
    mockUseSmartDiff.mockReturnValue(stubQuery(undefined, false));
    renderViewer();
    // Outer wrapper div may exist but no groups should be rendered.
    expect(screen.queryByText("Core logic")).not.toBeInTheDocument();
  });

  describe("with data", () => {
    beforeEach(() => {
      mockUseSmartDiff.mockReturnValue(stubQuery(SMART_DIFF_STUB));
    });

    // ---- Header ----
    it("renders the section label and the files/± summary", () => {
      renderViewer();
      expect(screen.getByText("Reviewer-ordered diff")).toBeInTheDocument();
      expect(screen.getByText("3 files")).toBeInTheDocument();
      expect(screen.getByText("+111")).toBeInTheDocument();
      expect(screen.getByText("−52")).toBeInTheDocument();
    });

    // ---- Order toggle ----
    it("renders the Smart/Original order toggle with smart active", () => {
      renderViewer();
      const smartBtn = screen.getByRole("button", { name: "Smart order" });
      const originalBtn = screen.getByRole("button", { name: "Original order" });
      expect(smartBtn).toHaveAttribute("aria-pressed", "true");
      expect(originalBtn).toHaveAttribute("aria-pressed", "false");
    });

    it("clicking Original order calls onModeChange", () => {
      const onModeChange = vi.fn();
      renderViewer("pr-1", PR_FILES_STUB, "smart", onModeChange);
      fireEvent.click(screen.getByRole("button", { name: "Original order" }));
      expect(onModeChange).toHaveBeenCalledWith("original");
    });

    it("in original mode renders header + toggle but no groups", () => {
      renderViewer("pr-1", PR_FILES_STUB, "original");
      expect(screen.getByText("Reviewer-ordered diff")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Smart order" }),
      ).toHaveAttribute("aria-pressed", "false");
      expect(screen.queryByText("Core logic")).not.toBeInTheDocument();
      expect(screen.queryByText("src/service.ts")).not.toBeInTheDocument();
    });

    // ---- Group order + labels ----
    it("renders groups in canonical order: Core logic → Wiring → Boilerplate", () => {
      const { container } = renderViewer();
      const roles = Array.from(container.querySelectorAll("[data-role]")).map(
        (el) => el.getAttribute("data-role"),
      );
      expect(roles).toEqual(["core", "wiring", "boilerplate"]);
      expect(screen.getByText("Core logic")).toBeInTheDocument();
      expect(screen.getByText("Wiring")).toBeInTheDocument();
      expect(screen.getByText("Boilerplate")).toBeInTheDocument();
    });

    it("shows each group's description and file count", () => {
      renderViewer();
      expect(
        screen.getByText("The substance of the change — review closely"),
      ).toBeInTheDocument();
      expect(screen.getByText("Hooks the core into the app")).toBeInTheDocument();
      expect(screen.getByText("Generated / mechanical — skim")).toBeInTheDocument();
      expect(screen.getAllByText("1 file")).toHaveLength(3);
    });

    it("renders all three group labels even when a role has no files", () => {
      // Server omits empty groups (§5.3) — the client must still show them.
      const noBoilerplate: SmartDiff = {
        ...SMART_DIFF_STUB,
        groups: SMART_DIFF_STUB.groups.filter((g) => g.role !== "boilerplate"),
      };
      mockUseSmartDiff.mockReturnValue(stubQuery(noBoilerplate));
      const { container } = renderViewer();
      const roles = Array.from(container.querySelectorAll("[data-role]")).map(
        (el) => el.getAttribute("data-role"),
      );
      expect(roles).toEqual(["core", "wiring", "boilerplate"]);
      expect(screen.getByText("Boilerplate")).toBeInTheDocument();
      expect(screen.getByText("0 files")).toBeInTheDocument();
      expect(screen.getByText("No files in this category")).toBeInTheDocument();
    });

    // ---- Default expansion: findings auto-expand, everything else collapsed ----
    it("auto-expands files with findings (diff content visible)", () => {
      renderViewer();
      expect(screen.getByText("finding line")).toBeInTheDocument();
    });

    it("files without findings start collapsed (row visible, diff hidden)", () => {
      renderViewer();
      expect(screen.getByText("tsconfig.json")).toBeInTheDocument();
      expect(screen.queryByText('"strict": true')).not.toBeInTheDocument();
    });

    it("lock file is listed under boilerplate and collapsed by default", () => {
      renderViewer();
      // The row itself is always visible…
      expect(screen.getByText("pnpm-lock.yaml")).toBeInTheDocument();
      // …but its diff content is not (patch is null → would show the
      // "No diff available" placeholder if expanded).
      expect(screen.queryByText("No diff available")).not.toBeInTheDocument();
    });

    // ---- Findings badge + dot ----
    it("shows findings badge only for files with non-empty finding_lines", () => {
      renderViewer();
      // core file has 5 finding_lines → badge visible
      expect(screen.getByText("5 findings")).toBeInTheDocument();
      // tsconfig.json and pnpm-lock.yaml have finding_lines: [] → no badge
      // (only one badge in the whole viewer)
      const badges = screen.getAllByText(/findings/);
      expect(badges).toHaveLength(1);
    });

    it("badge carries accessible label with the findings count", () => {
      renderViewer();
      const badge = screen.getByRole("button", { name: "5 findings" });
      expect(badge).toBeInTheDocument();
    });

    // ---- Badge click → scroll reveal ----
    it("badge click on the auto-opened file scrolls to the finding line immediately", () => {
      renderViewer();
      // File with findings is open by default — diff already in the DOM.
      expect(screen.getByText("finding line")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "5 findings" }));
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    });

    it("badge click re-expands a manually collapsed file and scrolls after render", async () => {
      renderViewer();
      // Collapse the auto-opened file first.
      fireEvent.click(screen.getByText("src/service.ts"));
      expect(screen.queryByText("finding line")).not.toBeInTheDocument();

      // Badge click reopens it; the effect fires the scroll after render.
      fireEvent.click(screen.getByRole("button", { name: "5 findings" }));
      await waitFor(() => {
        expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
      });
      expect(screen.getByText("finding line")).toBeInTheDocument();
    });

    // ---- File expand/collapse ----
    it("clicking a collapsed file header expands its diff", () => {
      renderViewer();
      fireEvent.click(screen.getByText("tsconfig.json"));
      expect(screen.getByText('"strict": true')).toBeInTheDocument();
    });

    it("clicking an expanded file header collapses it", () => {
      renderViewer();
      // src/service.ts is auto-open (has findings) — click collapses it.
      fireEvent.click(screen.getByText("src/service.ts"));
      expect(screen.queryByText("finding line")).not.toBeInTheDocument();
      // Click again re-expands.
      fireEvent.click(screen.getByText("src/service.ts"));
      expect(screen.getByText("finding line")).toBeInTheDocument();
    });
  });

  // ---- Split suggestion banner ----
  it("shows the split suggestion banner when too_big is true", () => {
    const tooBig: SmartDiff = {
      ...SMART_DIFF_STUB,
      split_suggestion: {
        too_big: true,
        total_lines: 600,
        proposed_splits: [],
      },
    };
    mockUseSmartDiff.mockReturnValue(stubQuery(tooBig));
    renderViewer();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/too large/i)).toBeInTheDocument();
  });

  it("does not show the split suggestion banner when too_big is false", () => {
    mockUseSmartDiff.mockReturnValue(stubQuery(SMART_DIFF_STUB));
    renderViewer();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
