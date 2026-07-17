import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { FindingCard } from "./FindingCard";

const { evalCaseState, mutateEvalCase, toastError } = vi.hoisted(() => ({
  evalCaseState: { pending: false },
  mutateEvalCase: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock("@/lib/hooks/eval", () => ({
  useCreateEvalCaseFromFinding: () => ({ mutate: mutateEvalCase, isPending: evalCaseState.pending }),
}));
vi.mock("@/lib/toast", () => ({
  notify: { error: toastError, success: vi.fn(), info: vi.fn(), toast: vi.fn() },
}));

afterEach(() => {
  cleanup();
  evalCaseState.pending = false;
  mutateEvalCase.mockClear();
  toastError.mockClear();
});

const FINDING: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded Stripe secret key",
  file: "src/config.ts",
  start_line: 11,
  end_line: 11,
  rationale: "A **live** Stripe key is committed in source.",
  suggestion: "Move the key to an environment variable.",
  confidence: 0.95,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingCard (smoke, both themes)", () => {
  (["dark", "light"] as const).forEach((theme) => {
    it(`renders severity + file:line + rationale in ${theme}`, () => {
      renderWithIntl(
        <div data-theme={theme}>
          <FindingCard f={FINDING} defaultExpanded onAction={() => {}} />
        </div>,
      );
      expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
      expect(screen.getByText("src/config.ts:11")).toBeInTheDocument();
      // category label is shown alongside the severity badge
      expect(screen.getByText("security")).toBeInTheDocument();
    });
  });

  it("fires accept/dismiss actions", () => {
    const onAction = vi.fn();
    renderWithIntl(<FindingCard f={FINDING} defaultExpanded onAction={onAction} />);
    fireEvent.click(screen.getByText("Accept"));
    expect(onAction).toHaveBeenCalledWith("accept");
    fireEvent.click(screen.getByText("Dismiss"));
    expect(onAction).toHaveBeenCalledWith("dismiss");
  });
});

describe("FindingCard — Turn into eval case", () => {
  it("does not render on a finding that is neither accepted nor dismissed", () => {
    renderWithIntl(<FindingCard f={FINDING} defaultExpanded onAction={() => {}} />);
    expect(screen.queryByText("Turn into eval case")).not.toBeInTheDocument();
  });

  it("renders for an accepted finding and creates a new case on every click (AC-6)", () => {
    const accepted: FindingRecord = { ...FINDING, accepted_at: "2026-07-01T00:00:00Z" };
    renderWithIntl(<FindingCard f={accepted} defaultExpanded onAction={() => {}} />);
    const btn = screen.getByText("Turn into eval case");
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(mutateEvalCase).toHaveBeenCalledTimes(2);
    expect(mutateEvalCase).toHaveBeenNthCalledWith(1, "f1", expect.anything());
    expect(mutateEvalCase).toHaveBeenNthCalledWith(2, "f1", expect.anything());
  });

  it("renders for a dismissed finding too", () => {
    const dismissed: FindingRecord = { ...FINDING, dismissed_at: "2026-07-01T00:00:00Z" };
    renderWithIntl(<FindingCard f={dismissed} defaultExpanded onAction={() => {}} />);
    expect(screen.getByText("Turn into eval case")).toBeInTheDocument();
  });

  it("disables the button while the mutation is pending", () => {
    evalCaseState.pending = true;
    const accepted: FindingRecord = { ...FINDING, accepted_at: "2026-07-01T00:00:00Z" };
    renderWithIntl(<FindingCard f={accepted} defaultExpanded onAction={() => {}} />);
    expect(screen.getByText("Turn into eval case").closest("button")).toBeDisabled();
  });

  it("surfaces a mutation failure via notify.error instead of failing silently", () => {
    mutateEvalCase.mockImplementationOnce((_id, opts) => {
      opts?.onError?.(new Error("review has no agent to attach the case to"));
    });
    const dismissed: FindingRecord = { ...FINDING, dismissed_at: "2026-07-01T00:00:00Z" };
    renderWithIntl(<FindingCard f={dismissed} defaultExpanded onAction={() => {}} />);
    fireEvent.click(screen.getByText("Turn into eval case"));
    expect(toastError).toHaveBeenCalledWith("review has no agent to attach the case to");
  });
});
