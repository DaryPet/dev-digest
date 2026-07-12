import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/skillEditor.json";
import { StatsTab } from "./StatsTab";

afterEach(cleanup);

const SKILL: Skill = {
  id: "sk1",
  name: "PR Quality Rubric",
  description: "Checks tests, docs, and naming.",
  type: "rubric",
  source: "manual",
  body: "body",
  enabled: true,
  version: 1,
  evidence_files: null,
  project_context_paths: [],
};

let mockAgents: Array<{ id: string; name: string; enabled: boolean }> = [];

vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useSkillAgents: () => ({ data: mockAgents, isLoading: false, isError: false, refetch: vi.fn() }),
}));

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ skillEditor: messages }}>{ui}</NextIntlClientProvider>);
}

describe("StatsTab", () => {
  it("renders the used-by count and agent list with links", () => {
    mockAgents = [
      { id: "a1", name: "Security Reviewer", enabled: true },
      { id: "a2", name: "Style Bot", enabled: false },
    ];
    renderWithIntl(<StatsTab skill={SKILL} />);
    expect(screen.getByText("Used by 2 agents")).toBeInTheDocument();
    const link = screen.getByText("Security Reviewer").closest("a");
    expect(link).toHaveAttribute("href", "/agents/a1?tab=config");
    expect(screen.getByText("Style Bot")).toBeInTheDocument();
    expect(screen.getByText("disabled")).toBeInTheDocument();
  });

  it("shows an empty message when no agents use the skill", () => {
    mockAgents = [];
    renderWithIntl(<StatsTab skill={SKILL} />);
    expect(screen.getByText("Used by 0 agents")).toBeInTheDocument();
    expect(screen.getByText("Not used by any agent yet.")).toBeInTheDocument();
  });
});
