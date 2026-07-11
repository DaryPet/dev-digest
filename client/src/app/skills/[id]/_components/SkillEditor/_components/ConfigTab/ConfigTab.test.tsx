import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/skillEditor.json";
import { ConfigTab } from "./ConfigTab";

afterEach(cleanup);

const SKILL: Skill = {
  id: "sk1",
  name: "PR Quality Rubric",
  description: "Checks tests, docs, and naming.",
  type: "rubric",
  source: "manual",
  body: "Describe the rule",
  enabled: true,
  version: 3,
  evidence_files: null,
  project_context_paths: [],
};

const mutate = vi.fn();
const toastSuccess = vi.fn();

vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useUpdateSkill: () => ({ mutate, isPending: false, isSuccess: false, data: undefined }),
}));

// ProjectContextSection (rendered inline by ConfigTab) pulls in these hooks —
// mock them here too, not just in the section's own test (2026-07-06 insight).
vi.mock("@/lib/hooks/core", () => ({
  useRepos: () => ({ data: [] }),
  useContextFiles: () => ({ data: undefined, isLoading: false }),
  useContextPreview: () => ({ data: undefined, isLoading: false }),
}));

vi.mock("../../../../../../../lib/toast", () => ({
  useToast: () => ({ success: toastSuccess, error: vi.fn(), info: vi.fn(), toast: vi.fn() }),
}));

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ skillEditor: messages }}>{ui}</NextIntlClientProvider>);
}

describe("ConfigTab", () => {
  it("renders fields seeded from the skill", () => {
    renderWithIntl(<ConfigTab skill={SKILL} />);
    expect(screen.getByDisplayValue("PR Quality Rubric")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Checks tests, docs, and naming.")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Describe the rule")).toBeInTheDocument();
  });

  it("saves the edited fields via useUpdateSkill", () => {
    renderWithIntl(<ConfigTab skill={SKILL} />);
    fireEvent.change(screen.getByDisplayValue("PR Quality Rubric"), { target: { value: "Renamed Rubric" } });
    fireEvent.click(screen.getByText("Save skill"));
    expect(mutate).toHaveBeenCalledWith(
      {
        id: "sk1",
        patch: {
          name: "Renamed Rubric",
          description: "Checks tests, docs, and naming.",
          type: "rubric",
          body: "Describe the rule",
          enabled: true,
        },
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("resets local state when the skill id changes", () => {
    const { rerender } = renderWithIntl(<ConfigTab skill={SKILL} />);
    fireEvent.change(screen.getByDisplayValue("PR Quality Rubric"), { target: { value: "Dirty edit" } });
    const other: Skill = { ...SKILL, id: "sk2", name: "Other Skill" };
    rerender(<NextIntlClientProvider locale="en" messages={{ skillEditor: messages }}><ConfigTab skill={other} /></NextIntlClientProvider>);
    expect(screen.getByDisplayValue("Other Skill")).toBeInTheDocument();
  });
});
