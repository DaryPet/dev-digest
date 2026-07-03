import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import briefMessages from "../../../../../../../../messages/en/brief.json";
import { BlastRadiusCard } from "./BlastRadiusCard";

afterEach(cleanup);

function renderCard() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief: briefMessages }}>
      <BlastRadiusCard />
    </NextIntlClientProvider>,
  );
}

describe("BlastRadiusCard", () => {
  it("renders the blast radius title with an honest not-computed state", () => {
    renderCard();
    expect(screen.getByText("Blast radius")).toBeInTheDocument();
    expect(
      screen.getByText("Blast radius has not been computed for this PR yet."),
    ).toBeInTheDocument();
  });

  it("toggles the prior-PRs bar to reveal the empty history copy", () => {
    renderCard();
    const bar = screen.getByRole("button", { name: /prior prs touching these files/i });
    expect(screen.queryByText("No prior PRs overlap these files.")).not.toBeInTheDocument();
    fireEvent.click(bar);
    expect(screen.getByText("No prior PRs overlap these files.")).toBeInTheDocument();
  });
});
