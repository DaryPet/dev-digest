import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { ProjectContextDocument } from "@devdigest/shared";
import { ContextDocumentAttachList } from "./ContextDocumentAttachList";

afterEach(cleanup);

const DOCS: ProjectContextDocument[] = [
  { path: "specs/api.md", category: "specs" },
  { path: "docs/onboarding.md", category: "docs" },
  { path: "insights/decisions.md", category: "insights" },
];

const CATEGORY_LABELS = { specs: "specs", docs: "docs", insights: "insights" };

describe("ContextDocumentAttachList", () => {
  it("renders every document with its filename, path, and category badge", () => {
    render(
      <ContextDocumentAttachList
        documents={DOCS}
        attachable={false}
        onPreview={vi.fn()}
        filterPlaceholder="Filter documents…"
        previewLabel="Preview"
        categoryLabels={CATEGORY_LABELS}
        emptyTitle="No documents"
      />,
    );
    expect(screen.getByText("api.md")).toBeInTheDocument();
    expect(screen.getByText("specs/api.md")).toBeInTheDocument();
    expect(screen.getByText("onboarding.md")).toBeInTheDocument();
    expect(screen.getByText("decisions.md")).toBeInTheDocument();
    expect(screen.getAllByText("specs")).toHaveLength(1);
    expect(screen.getByText("docs")).toBeInTheDocument();
    expect(screen.getByText("insights")).toBeInTheDocument();
    // read-only mode: no attach checkboxes
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("shows an explicit empty state when there are zero discovered documents", () => {
    render(
      <ContextDocumentAttachList
        documents={[]}
        attachable={false}
        onPreview={vi.fn()}
        filterPlaceholder="Filter documents…"
        previewLabel="Preview"
        categoryLabels={CATEGORY_LABELS}
        emptyTitle="No spec files yet"
        emptyBody="Drop your specs under specs/, docs/, or insights/."
      />,
    );
    expect(screen.getByText("No spec files yet")).toBeInTheDocument();
    expect(screen.getByText("Drop your specs under specs/, docs/, or insights/.")).toBeInTheDocument();
  });

  it("calls onPreview with the document's path when the Preview action is clicked", () => {
    const onPreview = vi.fn();
    render(
      <ContextDocumentAttachList
        documents={DOCS}
        attachable={false}
        onPreview={onPreview}
        filterPlaceholder="Filter documents…"
        previewLabel="Preview"
        categoryLabels={CATEGORY_LABELS}
        emptyTitle="No documents"
      />,
    );
    fireEvent.click(screen.getByLabelText("Preview api.md"));
    expect(onPreview).toHaveBeenCalledWith("specs/api.md");
  });

  it("attachable mode checks the boxes for attached paths and leaves the rest unchecked", () => {
    render(
      <ContextDocumentAttachList
        documents={DOCS}
        attachable
        attachedPaths={["docs/onboarding.md"]}
        onAttachedChange={vi.fn()}
        onPreview={vi.fn()}
        filterPlaceholder="Filter documents…"
        previewLabel="Preview"
        categoryLabels={CATEGORY_LABELS}
        emptyTitle="No documents"
      />,
    );
    // display order: attached first (onboarding.md), then the rest catalog order
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(3);
    expect(boxes[0]).toHaveAttribute("aria-checked", "true");
    expect(boxes[1]).toHaveAttribute("aria-checked", "false");
    expect(boxes[2]).toHaveAttribute("aria-checked", "false");
  });

  it("checking an unattached document appends its path to the persisted list", () => {
    const onAttachedChange = vi.fn();
    render(
      <ContextDocumentAttachList
        documents={DOCS}
        attachable
        attachedPaths={["docs/onboarding.md"]}
        onAttachedChange={onAttachedChange}
        onPreview={vi.fn()}
        filterPlaceholder="Filter documents…"
        previewLabel="Preview"
        categoryLabels={CATEGORY_LABELS}
        emptyTitle="No documents"
      />,
    );
    const boxes = screen.getAllByRole("checkbox");
    fireEvent.click(boxes[1]!); // second display row: specs/api.md (first unattached)
    expect(onAttachedChange).toHaveBeenCalledWith(["docs/onboarding.md", "specs/api.md"]);
  });

  it("unchecking an attached document removes its path from the persisted list", () => {
    const onAttachedChange = vi.fn();
    render(
      <ContextDocumentAttachList
        documents={DOCS}
        attachable
        attachedPaths={["docs/onboarding.md", "specs/api.md"]}
        onAttachedChange={onAttachedChange}
        onPreview={vi.fn()}
        filterPlaceholder="Filter documents…"
        previewLabel="Preview"
        categoryLabels={CATEGORY_LABELS}
        emptyTitle="No documents"
      />,
    );
    fireEvent.click(screen.getAllByRole("checkbox")[0]!); // onboarding.md
    expect(onAttachedChange).toHaveBeenCalledWith(["specs/api.md"]);
  });

  it("filters the catalog by filename or path, case-insensitively", () => {
    render(
      <ContextDocumentAttachList
        documents={DOCS}
        attachable={false}
        onPreview={vi.fn()}
        filterPlaceholder="Filter documents…"
        previewLabel="Preview"
        categoryLabels={CATEGORY_LABELS}
        emptyTitle="No documents"
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("Filter documents…"), { target: { value: "ONBOARD" } });
    expect(screen.getByText("onboarding.md")).toBeInTheDocument();
    expect(screen.queryByText("api.md")).not.toBeInTheDocument();
    expect(screen.queryByText("decisions.md")).not.toBeInTheDocument();
  });

  it("renders a per-document approx token badge when tokensByPath is provided", () => {
    render(
      <ContextDocumentAttachList
        documents={DOCS}
        attachable
        attachedPaths={["specs/api.md"]}
        onAttachedChange={vi.fn()}
        onPreview={vi.fn()}
        tokensByPath={{ "specs/api.md": 420 }}
        filterPlaceholder="Filter documents…"
        previewLabel="Preview"
        categoryLabels={CATEGORY_LABELS}
        emptyTitle="No documents"
      />,
    );
    expect(screen.getByText("≈420")).toBeInTheDocument();
  });
});
