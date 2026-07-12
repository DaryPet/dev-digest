import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../lib/toast";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

vi.mock("../../../../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const SKILLS: Skill[] = [
  {
    id: "sk1",
    name: "PR Quality Rubric",
    description: "Checks tests and docs.",
    type: "rubric",
    source: "manual",
    body: "# Rule",
    enabled: true,
    version: 1,
    evidence_files: null,
    project_context_paths: [],
  },
  {
    id: "sk2",
    name: "Secrets Guard",
    description: "Flags hardcoded secrets.",
    type: "security",
    source: "manual",
    body: "# Rule",
    enabled: false,
    version: 1,
    evidence_files: null,
    project_context_paths: [],
  },
];

const updateMutate = vi.fn();
const createMutate = vi.fn();
let skillsState: { data?: Skill[]; isLoading: boolean; isError: boolean } = {
  data: SKILLS,
  isLoading: false,
  isError: false,
};

vi.mock("../../../../lib/hooks/skills", () => ({
  useSkills: () => ({ ...skillsState, refetch: vi.fn() }),
  useCreateSkill: () => ({ mutate: createMutate, isPending: false }),
  useUpdateSkill: () => ({ mutate: updateMutate, isPending: false }),
}));

import { SkillsListView } from "./SkillsListView";

afterEach(() => {
  cleanup();
  push.mockClear();
  updateMutate.mockClear();
  createMutate.mockClear();
  skillsState = { data: SKILLS, isLoading: false, isError: false };
});

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <SkillsListView />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("SkillsListView (smoke)", () => {
  it("renders a SkillCard per skill", () => {
    renderView();
    expect(screen.getByText("PR Quality Rubric")).toBeInTheDocument();
    expect(screen.getByText("Secrets Guard")).toBeInTheDocument();
  });

  it("filters by name/description via the search input", () => {
    renderView();
    fireEvent.change(screen.getByPlaceholderText("Search skills…"), { target: { value: "secrets" } });
    expect(screen.queryByText("PR Quality Rubric")).not.toBeInTheDocument();
    expect(screen.getByText("Secrets Guard")).toBeInTheDocument();
  });

  it("navigates to /skills/:id when a card is clicked", () => {
    renderView();
    fireEvent.click(screen.getByText("PR Quality Rubric"));
    expect(push).toHaveBeenCalledWith("/skills/sk1");
  });

  it("shows a loading skeleton state", () => {
    skillsState = { data: undefined, isLoading: true, isError: false };
    renderView();
    expect(screen.queryByText("PR Quality Rubric")).not.toBeInTheDocument();
  });

  it("shows an error state with retry", () => {
    skillsState = { data: undefined, isLoading: false, isError: true };
    renderView();
    expect(screen.getByText("Could not load skills.")).toBeInTheDocument();
  });

  it("shows an empty state when there are no skills", () => {
    skillsState = { data: [], isLoading: false, isError: false };
    renderView();
    expect(screen.getByText("No skills yet")).toBeInTheDocument();
  });
});
