import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/conventions.json";
import { ConventionCard } from "./ConventionCard";

afterEach(cleanup);

const CANDIDATE: ConventionCandidate = {
  id: "c1",
  category: "style",
  rule: "Always use async/await instead of .then() chains",
  evidence_path: "src/api/users.ts:23-31",
  evidence_snippet: "const user = await db.users.find(id);",
  confidence: 0.91,
  status: "pending",
  created_at: "2026-06-28T00:00:00.000Z",
};

function renderCard(props: Partial<React.ComponentProps<typeof ConventionCard>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ConventionCard
        candidate={CANDIDATE}
        repoFullName="acme/payments-api"
        repoRef="main"
        pending={false}
        onAccept={vi.fn()}
        onReject={vi.fn()}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

describe("ConventionCard", () => {
  it("renders rule, category and code snippet", () => {
    renderCard();
    expect(screen.getByText(CANDIDATE.rule)).toBeInTheDocument();
    expect(screen.getByText("style")).toBeInTheDocument();
    expect(screen.getByText("const user = await db.users.find(id);")).toBeInTheDocument();
  });

  it("links the evidence to the exact GitHub blob line range (acceptance criterion)", () => {
    renderCard();
    const link = screen.getByText("src/api/users.ts:23-31").closest("a")!;
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/acme/payments-api/blob/main/src/api/users.ts#L23-L31",
    );
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("fires onAccept / onReject when the buttons are clicked", () => {
    const onAccept = vi.fn();
    const onReject = vi.fn();
    renderCard({ onAccept, onReject });
    fireEvent.click(screen.getByText("Accept as Skill"));
    fireEvent.click(screen.getByText("Reject"));
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it("shows the active 'Accepted' label once the candidate is accepted", () => {
    renderCard({ candidate: { ...CANDIDATE, status: "accepted" } });
    expect(screen.getByText("Accepted")).toBeInTheDocument();
  });
});
