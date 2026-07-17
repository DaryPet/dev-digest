import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalCase, EvalRunRecord } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/eval.json";
import { EvalCaseEditorModal } from "./EvalCaseEditorModal";

afterEach(cleanup);

const createMutate = vi.fn();
const updateMutate = vi.fn();
const runMutate = vi.fn();
let existingCaseData: EvalCase | undefined = undefined;

vi.mock("@/lib/hooks/eval", () => ({
  useEvalCase: () => ({ data: existingCaseData, isLoading: false }),
  useCreateEvalCase: () => ({ mutate: createMutate, isPending: false }),
  useUpdateEvalCase: () => ({ mutate: updateMutate, isPending: false }),
  useRunEvalCase: () => ({ mutate: runMutate, isPending: false }),
}));

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ eval: messages }}>{ui}</NextIntlClientProvider>);
}

const EXISTING_CASE: EvalCase = {
  id: "case1",
  owner_kind: "agent",
  owner_id: "ag1",
  name: "stripe-key-leak",
  input_diff: "--- a/x\n+++ b/x",
  input_files: null,
  input_meta: { title: "Add Stripe", body: "wire it up", file: "src/x.ts", start_line: 1, end_line: 2 },
  expected_output: [{ file: "src/x.ts", start_line: 1, end_line: 2 }],
  notes: null,
};

const LAST_RUN: EvalRunRecord = {
  id: "run1",
  case_id: "case1",
  case_name: "stripe-key-leak",
  ran_at: "2026-07-10T00:00:00Z",
  actual_output: { findings: [{ file: "src/x.ts" }] },
  pass: true,
  recall: 1,
  precision: 1,
  citation_accuracy: 1,
  duration_ms: 1500,
  cost_usd: 0.02,
};

describe("EvalCaseEditorModal", () => {
  afterEach(() => {
    existingCaseData = undefined;
    createMutate.mockClear();
    updateMutate.mockClear();
    runMutate.mockClear();
  });

  it("renders the Name field and Input tabs for a new case", () => {
    renderWithIntl(<EvalCaseEditorModal agentId="ag1" caseId={null} onClose={() => {}} />);
    expect(screen.getByText("New eval case")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("stripe-key-leak")).toBeInTheDocument();
    expect(screen.getByText("Diff")).toBeInTheDocument();
    expect(screen.getByText("Files")).toBeInTheDocument();
    expect(screen.getByText("PR meta")).toBeInTheDocument();
  });

  it("switches the Input section between Diff/Files/PR-meta tabs", () => {
    renderWithIntl(<EvalCaseEditorModal agentId="ag1" caseId={null} onClose={() => {}} />);
    expect(screen.queryByPlaceholderText("Add Stripe integration")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("PR meta"));
    expect(screen.getByPlaceholderText("Add Stripe integration")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Files"));
    expect(screen.getByPlaceholderText(/"path": "src\/config.ts"/)).toBeInTheDocument();
  });

  it("blocks Save and shows an error when Expected output is invalid JSON", () => {
    renderWithIntl(<EvalCaseEditorModal agentId="ag1" caseId={null} onClose={() => {}} />);
    const textarea = screen.getAllByRole("textbox").find((el) => (el as HTMLTextAreaElement).value === "[]")!;
    fireEvent.change(textarea, { target: { value: "{not valid json" } });
    expect(screen.getByText("invalid JSON")).toBeInTheDocument();
    expect(screen.getByText(/Expected output must be valid JSON/)).toBeInTheDocument();
    expect(screen.getByText("Save").closest("button")).toBeDisabled();
    fireEvent.click(screen.getByText("Save"));
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("blocks Save when the JSON is well-formed but an item is missing required fields", () => {
    renderWithIntl(<EvalCaseEditorModal agentId="ag1" caseId={null} onClose={() => {}} />);
    const textarea = screen.getAllByRole("textbox").find((el) => (el as HTMLTextAreaElement).value === "[]")!;
    fireEvent.change(textarea, { target: { value: '[{"file": "x.ts"}]' } });
    expect(screen.getByText(/Expected output must be valid JSON/)).toBeInTheDocument();
    expect(screen.getByText("Save").closest("button")).toBeDisabled();
    fireEvent.click(screen.getByText("Save"));
    expect(createMutate).not.toHaveBeenCalled();
  });

  it('"Finding skeleton" inserts a template object into the Expected-output JSON', () => {
    renderWithIntl(<EvalCaseEditorModal agentId="ag1" caseId={null} onClose={() => {}} />);
    const textarea = screen.getAllByRole("textbox").find((el) => (el as HTMLTextAreaElement).value === "[]")! as HTMLTextAreaElement;
    fireEvent.click(screen.getByText("Finding skeleton"));
    const parsed = JSON.parse(textarea.value);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ file: "", start_line: 1, end_line: 1 });
  });

  it("allows Save once the Expected-output JSON is valid, and calls create", () => {
    renderWithIntl(<EvalCaseEditorModal agentId="ag1" caseId={null} onClose={() => {}} />);
    fireEvent.click(screen.getByText("Save"));
    expect(createMutate).toHaveBeenCalledTimes(1);
    expect(updateMutate).not.toHaveBeenCalled();
  });

  it("calls update (not create) when editing an existing case", () => {
    existingCaseData = EXISTING_CASE;
    renderWithIntl(<EvalCaseEditorModal agentId="ag1" caseId="case1" onClose={() => {}} />);
    fireEvent.click(screen.getByText("Save"));
    expect(updateMutate).toHaveBeenCalledTimes(1);
    expect(createMutate).not.toHaveBeenCalled();
  });

  it('"Run on save" triggers a run after a successful create', () => {
    createMutate.mockImplementation((_payload, opts) => {
      opts?.onSuccess?.({ ...EXISTING_CASE, id: "new-case-id" });
    });
    renderWithIntl(<EvalCaseEditorModal agentId="ag1" caseId={null} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByText("Save"));
    expect(createMutate).toHaveBeenCalledTimes(1);
    expect(runMutate).toHaveBeenCalledTimes(1);
  });

  it('"Run on save" triggers a run after a successful update', () => {
    existingCaseData = EXISTING_CASE;
    updateMutate.mockImplementation((_payload, opts) => {
      opts?.onSuccess?.();
    });
    renderWithIntl(<EvalCaseEditorModal agentId="ag1" caseId="case1" onClose={() => {}} />);
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByText("Save"));
    expect(updateMutate).toHaveBeenCalledTimes(1);
    expect(runMutate).toHaveBeenCalledTimes(1);
  });

  it("shows a last-run summary line when a persisted run exists", () => {
    existingCaseData = EXISTING_CASE;
    renderWithIntl(<EvalCaseEditorModal agentId="ag1" caseId="case1" lastRun={LAST_RUN} onClose={() => {}} />);
    const summary = screen.getByText(/Last run passed/);
    expect(summary).toHaveTextContent("Last run passed");
    expect(summary).toHaveTextContent(/expected 1 finding, got 1/);
    expect(summary).toHaveTextContent(/1\.5s/);
    expect(summary).toHaveTextContent(/\$0\.020/);
  });

  it("omits the last-run summary line when there is no persisted run", () => {
    renderWithIntl(<EvalCaseEditorModal agentId="ag1" caseId={null} lastRun={null} onClose={() => {}} />);
    expect(screen.queryByText(/Last run passed/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Last run failed/)).not.toBeInTheDocument();
  });
});
