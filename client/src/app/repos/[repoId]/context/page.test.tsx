import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ProjectContextCatalog, ProjectContextPreview } from "@devdigest/shared";
import contextMessages from "../../../../../messages/en/context.json";

vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "repo1" }),
}));

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { id: "repo1", full_name: "acme/widgets" } }),
  useRepoNotFound: () => false,
}));

const CATALOG: ProjectContextCatalog = {
  root_path: "/clones/acme-widgets",
  documents: [
    { path: "specs/api.md", category: "specs" },
    { path: "docs/onboarding.md", category: "docs" },
  ],
};

const PREVIEW: ProjectContextPreview = {
  path: "specs/api.md",
  category: "specs",
  content: "# API spec\n\nSome rules.",
  used_by_count: 3,
};

let contextFilesState: { data?: ProjectContextCatalog; isLoading: boolean; isError: boolean } = {
  data: CATALOG,
  isLoading: false,
  isError: false,
};

const mutationStub = () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null });

vi.mock("@/lib/hooks/core", () => ({
  useContextFiles: () => ({ ...contextFilesState, error: undefined, refetch: vi.fn() }),
  useContextPreview: () => ({ data: PREVIEW, isLoading: false, isError: false, error: undefined }),
  useCreateContextFile: () => mutationStub(),
  useCreateContextFolder: () => mutationStub(),
  useUpdateContextFile: () => mutationStub(),
}));

import ContextPage from "./page";

afterEach(() => {
  cleanup();
  contextFilesState = { data: CATALOG, isLoading: false, isError: false };
});

function renderPage() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ context: contextMessages }}>
      <ContextPage />
    </NextIntlClientProvider>,
  );
}

describe("Project Context page (smoke)", () => {
  it("shows the context roots, toolbar, and every discovered document", () => {
    renderPage();
    expect(screen.getByTitle("/clones/acme-widgets")).toBeInTheDocument();
    expect(screen.getByLabelText("New document")).toBeInTheDocument();
    expect(screen.getByLabelText("New folder")).toBeInTheDocument();
    expect(screen.getByLabelText("Upload markdown file")).toBeInTheDocument();
    expect(screen.getByLabelText("Refresh")).toBeInTheDocument();
    expect(screen.getByLabelText("Preview api.md")).toBeInTheDocument();
    expect(screen.getByLabelText("Preview onboarding.md")).toBeInTheDocument();
  });

  it("shows the preview panel with rendered content and used-by count on selection", () => {
    renderPage();
    fireEvent.click(screen.getByLabelText(/Preview api\.md/i));
    expect(screen.getByText("API spec")).toBeInTheDocument();
    expect(screen.getByText("Used by 3 agents")).toBeInTheDocument();
  });

  it("renders an explicit empty state when zero documents are discovered", () => {
    contextFilesState = { data: { root_path: "/clones/acme-widgets", documents: [] }, isLoading: false, isError: false };
    renderPage();
    expect(screen.getByText("No spec files yet")).toBeInTheDocument();
  });
});
