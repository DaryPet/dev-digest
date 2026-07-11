import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill, ProjectContextCatalog, Repo } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/skillEditor.json";
import { ProjectContextSection } from "./ProjectContextSection";

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
  project_context_paths: ["specs/api.md"],
};

const CATALOG: ProjectContextCatalog = {
  root_path: "/clones/acme-widgets",
  documents: [
    { path: "specs/api.md", category: "specs" },
    { path: "docs/onboarding.md", category: "docs" },
  ],
  attachment: {
    attached_paths: ["specs/api.md"],
    effective: [{ path: "specs/api.md", category: "specs", approx_tokens: 80 }],
    total_approx_tokens: 80,
  },
};

const REPOS: Repo[] = [
  {
    id: "repo1",
    workspace_id: "ws1",
    owner: "acme",
    name: "widgets",
    full_name: "acme/widgets",
    default_branch: "main",
    clone_path: "/clones/acme-widgets",
    last_polled_at: null,
    created_by: null,
  },
];

const updateMutate = vi.fn();

vi.mock("@/lib/hooks/core", () => ({
  useRepos: () => ({ data: REPOS }),
  useContextFiles: () => ({ data: CATALOG, isLoading: false }),
  useContextPreview: () => ({ data: undefined, isLoading: false }),
}));

vi.mock("@/lib/hooks/skills", () => ({
  useUpdateSkill: () => ({ mutate: updateMutate, isPending: false }),
}));

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skillEditor: messages }}>{ui}</NextIntlClientProvider>,
  );
}

describe("SkillEditor ProjectContextSection", () => {
  afterEach(() => updateMutate.mockClear());

  it("shows the AC-14 section header and the discovered documents", () => {
    renderWithIntl(<ProjectContextSection skill={SKILL} />);
    expect(screen.getByText("Project context to use — 1 attached")).toBeInTheDocument();
    expect(screen.getByText("Any agent using this skill inherits these documents.")).toBeInTheDocument();
    expect(screen.getByText("api.md")).toBeInTheDocument();
    expect(screen.getByText("onboarding.md")).toBeInTheDocument();
  });

  it("shows the AC-16 'serializes as' preview listing the persisted attach order", () => {
    renderWithIntl(<ProjectContextSection skill={SKILL} />);
    expect(screen.getByText("Serializes as")).toBeInTheDocument();
    const expected = JSON.stringify(["specs/api.md"], null, 2);
    expect(screen.getByText((_, el) => el?.tagName.toLowerCase() === "pre" && el.textContent === expected)).toBeInTheDocument();
  });

  it("persists a toggle via useUpdateSkill with the skill's project_context_paths", () => {
    renderWithIntl(<ProjectContextSection skill={SKILL} />);
    const boxes = screen.getAllByRole("checkbox");
    fireEvent.click(boxes[1]!); // second display row: docs/onboarding.md (unattached)
    expect(updateMutate).toHaveBeenCalledWith({
      id: "sk1",
      patch: { project_context_paths: ["specs/api.md", "docs/onboarding.md"] },
    });
  });
});
