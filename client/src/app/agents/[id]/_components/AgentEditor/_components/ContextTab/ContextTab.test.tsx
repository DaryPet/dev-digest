import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, ProjectContextCatalog, Repo } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agents.json";
import { ContextTab } from "./ContextTab";

afterEach(cleanup);

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets and injection",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
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
    effective: [{ path: "specs/api.md", category: "specs", approx_tokens: 120 }],
    total_approx_tokens: 120,
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

let reposState: Repo[] = REPOS;
const updateMutate = vi.fn();

vi.mock("@/lib/hooks/core", () => ({
  useRepos: () => ({ data: reposState }),
  useContextFiles: () => ({ data: CATALOG, isLoading: false }),
  useContextPreview: () => ({ data: undefined, isLoading: false }),
}));

vi.mock("@/lib/hooks/agents", () => ({
  useUpdateAgent: () => ({ mutate: updateMutate, isPending: false }),
}));

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ agents: messages }}>{ui}</NextIntlClientProvider>);
}

describe("Agent editor ContextTab", () => {
  afterEach(() => {
    reposState = REPOS;
    updateMutate.mockClear();
  });

  it("shows the AC-12 header count and the discovered documents", () => {
    renderWithIntl(<ContextTab agent={AGENT} />);
    expect(screen.getByText("Project context — 1 of 2 attached")).toBeInTheDocument();
    expect(screen.getByText("api.md")).toBeInTheDocument();
    expect(screen.getByText("onboarding.md")).toBeInTheDocument();
  });

  it("hides the repo picker in the single-repo case", () => {
    renderWithIntl(<ContextTab agent={AGENT} />);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("shows the repo picker when the workspace has multiple repos", () => {
    reposState = [
      ...REPOS,
      { ...REPOS[0]!, id: "repo2", full_name: "acme/other", name: "other" },
    ];
    renderWithIntl(<ContextTab agent={AGENT} />);
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("persists a toggle via useUpdateAgent with the agent's project_context_paths", () => {
    renderWithIntl(<ContextTab agent={AGENT} />);
    const boxes = screen.getAllByRole("checkbox");
    fireEvent.click(boxes[1]!); // second display row: docs/onboarding.md (unattached)
    expect(updateMutate).toHaveBeenCalledWith({
      id: "ag1",
      patch: { project_context_paths: ["specs/api.md", "docs/onboarding.md"] },
    });
  });

  it("shows the AC-13 footer token total and untrusted-injection note", () => {
    renderWithIntl(<ContextTab agent={AGENT} />);
    expect(screen.getByText("≈120 tokens across the attached documents")).toBeInTheDocument();
    expect(screen.getByText('Injected as an untrusted "## Project context" block on every run.')).toBeInTheDocument();
  });
});
