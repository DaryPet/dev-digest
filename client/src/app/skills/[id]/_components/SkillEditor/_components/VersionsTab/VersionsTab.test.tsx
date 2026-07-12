import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/skillEditor.json";
import { VersionsTab } from "./VersionsTab";

afterEach(cleanup);

const SKILL: Skill = {
  id: "sk1",
  name: "PR Quality Rubric",
  description: "Checks tests, docs, and naming.",
  type: "rubric",
  source: "manual",
  body: "current body",
  enabled: true,
  version: 3,
  evidence_files: null,
  project_context_paths: [],
};

const VERSIONS = [
  { skill_id: "sk1", version: 1, body: "first body", created_at: "2026-01-01T00:00:00.000Z" },
  { skill_id: "sk1", version: 2, body: "second body", created_at: "2026-02-01T00:00:00.000Z" },
  { skill_id: "sk1", version: 3, body: "third body", created_at: "2026-03-01T00:00:00.000Z" },
];

const mutate = vi.fn((_input, opts?: { onSuccess?: (d: { version: number }) => void; onSettled?: () => void }) => {
  opts?.onSuccess?.({ version: 4 });
  opts?.onSettled?.();
});
const toastSuccess = vi.fn();

vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useSkillVersions: () => ({ data: VERSIONS, isLoading: false, isError: false, refetch: vi.fn() }),
  useUpdateSkill: () => ({ mutate, isPending: false }),
}));

vi.mock("../../../../../../../lib/toast", () => ({
  useToast: () => ({ success: toastSuccess, error: vi.fn(), info: vi.fn(), toast: vi.fn() }),
}));

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ skillEditor: messages }}>{ui}</NextIntlClientProvider>);
}

describe("VersionsTab", () => {
  it("renders versions newest-first with a Current badge on the highest version", () => {
    renderWithIntl(<VersionsTab skill={SKILL} />);
    const rows = screen.getAllByText(/^v\d$/);
    expect(rows[0]).toHaveTextContent("v3");
    expect(screen.getByText("Current")).toBeInTheDocument();
  });

  it("shows a Restore button for non-current versions only", () => {
    renderWithIntl(<VersionsTab skill={SKILL} />);
    const restoreButtons = screen.getAllByText("Restore");
    expect(restoreButtons).toHaveLength(2); // v1 and v2, not v3 (current)
  });

  it("calls useUpdateSkill with the snapshot body on restore", () => {
    renderWithIntl(<VersionsTab skill={SKILL} />);
    fireEvent.click(screen.getAllByText("Restore")[0]!);
    expect(mutate).toHaveBeenCalledWith(
      { id: "sk1", patch: { body: "second body" } },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });
});
