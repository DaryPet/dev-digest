import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../lib/toast";
import type { SkillImportResult } from "../../../../lib/hooks/skills";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

const previewMutate = vi.fn();
const createMutate = vi.fn();

vi.mock("../../../../lib/hooks/skills", () => ({
  useImportSkillPreview: () => ({ mutate: previewMutate, isPending: false }),
  useCreateSkill: () => ({ mutate: createMutate, isPending: false }),
}));

import { ImportSkillDialog } from "./ImportSkillDialog";

const DRAFT_RESULT: SkillImportResult = {
  draft: {
    name: "PR Quality Rubric",
    description: "Checks tests and docs.",
    type: "rubric",
    source: "extracted",
    body: "# Rule\nDescribe the rule.",
    evidence_files: ["rubric.md"],
  },
  ignored_files: ["setup.sh"],
  warnings: ["Body exceeds recommended length."],
};

afterEach(() => {
  cleanup();
  push.mockClear();
  previewMutate.mockClear();
  createMutate.mockClear();
});

function renderDialog(onClose = vi.fn()) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <ImportSkillDialog onClose={onClose} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

function selectFile(content = "# Rule") {
  const input = screen.getByLabelText("File") as HTMLInputElement;
  const file = new File([content], "rubric.md", { type: "text/markdown" });
  fireEvent.change(input, { target: { files: [file] } });
  return input;
}

describe("ImportSkillDialog", () => {
  it("calls the preview mutation with filename + base64 content on file select", async () => {
    renderDialog();
    selectFile();
    await waitFor(() => expect(previewMutate).toHaveBeenCalledTimes(1));
    const [input] = previewMutate.mock.calls[0]!;
    expect(input.filename).toBe("rubric.md");
    expect(typeof input.content_base64).toBe("string");
    expect(input.content_base64.length).toBeGreaterThan(0);
  });

  it("renders the trust notice and ignored_files/warnings once a draft preview arrives", async () => {
    previewMutate.mockImplementation((_input, opts) => opts.onSuccess(DRAFT_RESULT));
    renderDialog();
    selectFile();

    await waitFor(() => expect(screen.getByText(/Review before you trust it/)).toBeInTheDocument());
    expect(
      screen.getByText(/An imported skill is someone else's instructions injected/),
    ).toBeInTheDocument();
    expect(screen.getByText("setup.sh")).toBeInTheDocument();
    expect(screen.getByText("Body exceeds recommended length.")).toBeInTheDocument();
    // Draft fields pre-filled from the preview.
    expect(screen.getByDisplayValue("PR Quality Rubric")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Checks tests and docs.")).toBeInTheDocument();
  });

  it("confirm persists via useCreateSkill with source: extracted and navigates to the new skill", async () => {
    previewMutate.mockImplementation((_input, opts) => opts.onSuccess(DRAFT_RESULT));
    createMutate.mockImplementation((_input, opts) => opts.onSuccess({ id: "sk9", name: "PR Quality Rubric" }));
    const onClose = vi.fn();
    renderDialog(onClose);
    selectFile();

    await waitFor(() => expect(screen.getByText("Save skill")).toBeEnabled());
    fireEvent.click(screen.getByText("Save skill"));

    expect(createMutate).toHaveBeenCalledTimes(1);
    const [input] = createMutate.mock.calls[0]!;
    expect(input.source).toBe("extracted");
    expect(input.name).toBe("PR Quality Rubric");
    expect(input.evidence_files).toEqual(["rubric.md"]);
    expect(onClose).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/skills/sk9");
  });

  it("disables Save before a draft preview exists", () => {
    renderDialog();
    expect(screen.getByText("Save skill")).toBeDisabled();
  });
});
