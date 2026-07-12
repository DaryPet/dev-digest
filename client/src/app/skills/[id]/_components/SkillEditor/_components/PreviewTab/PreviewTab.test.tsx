import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/skillEditor.json";
import { PreviewTab } from "./PreviewTab";

afterEach(cleanup);

const SKILL: Skill = {
  id: "sk1",
  name: "PR Quality Rubric",
  description: "Checks tests, docs, and naming.",
  type: "rubric",
  source: "manual",
  body: "# Heading\n\nSome **bold** rule text.",
  enabled: true,
  version: 1,
  evidence_files: null,
  project_context_paths: [],
};

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ skillEditor: messages }}>{ui}</NextIntlClientProvider>);
}

describe("PreviewTab", () => {
  it("renders the skill body as markdown", () => {
    renderWithIntl(<PreviewTab skill={SKILL} />);
    expect(screen.getByText("Heading")).toBeInTheDocument();
    expect(screen.getByText("bold")).toBeInTheDocument();
  });

  it("shows the subtitle copy", () => {
    renderWithIntl(<PreviewTab skill={SKILL} />);
    expect(screen.getByText("Rendered as it appears in the review agent's prompt.")).toBeInTheDocument();
  });

  it("shows an empty-body message when body is blank", () => {
    renderWithIntl(<PreviewTab skill={{ ...SKILL, body: "" }} />);
    expect(screen.getByText("This skill has no body yet.")).toBeInTheDocument();
  });
});
