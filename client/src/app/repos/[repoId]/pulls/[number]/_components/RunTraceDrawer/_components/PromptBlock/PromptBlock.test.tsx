import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../../messages/en/runs.json";
import { PromptBlock } from "./PromptBlock";

afterEach(cleanup);

Object.assign(navigator, { clipboard: { writeText: vi.fn() } });

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ runs: messages }}>{ui}</NextIntlClientProvider>);
}

describe("PromptBlock", () => {
  it("renders the label and reveals the text on expand", () => {
    renderWithIntl(<PromptBlock label="System" text="You are a reviewer." color="var(--text-muted)" />);
    expect(screen.getByText("System")).toBeInTheDocument();
    expect(screen.queryByText("You are a reviewer.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("System"));
    expect(screen.getByText("You are a reviewer.")).toBeInTheDocument();
  });

  it("shows the AC-25 verbatim label and approx token size for the specs block", () => {
    renderWithIntl(
      <PromptBlock
        label="Project context — attached specs (untrusted)"
        text={'## Project context\n<untrusted source="spec-0">...</untrusted>'}
        color="var(--text-secondary)"
        approxTokens={512}
      />,
    );
    expect(screen.getByText("Project context — attached specs (untrusted)")).toBeInTheDocument();
    expect(screen.getByText("≈512 tokens")).toBeInTheDocument();
  });

  it("omits the token size note when approxTokens is not provided", () => {
    renderWithIntl(<PromptBlock label="Skills (dynamic)" text="### skill" color="var(--accent)" />);
    expect(screen.queryByText(/tokens/)).not.toBeInTheDocument();
  });
});
