import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/conventions.json";
import { CreateSkillFromConventionsModal } from "./CreateSkillFromConventionsModal";

afterEach(cleanup);

const PREVIEW = {
  name: "payments-api-conventions",
  body: "# payments-api-conventions\n\n## async-await\nAlways use async/await.",
  evidence_files: ["src/api/users.ts"],
};

const createMutate = vi.fn((_input: unknown, opts?: { onSuccess?: (d: unknown) => void }) =>
  opts?.onSuccess?.({ id: "sk1" }),
);

// Preview resolves synchronously so the form seeds on open.
vi.mock("@/lib/hooks/conventions", () => ({
  useConventionSkillPreview: () => ({
    mutate: (_v: unknown, opts?: { onSuccess?: (d: unknown) => void }) => opts?.onSuccess?.(PREVIEW),
    data: PREVIEW,
    isPending: false,
  }),
}));
vi.mock("@/lib/hooks/skills", () => ({
  useCreateSkill: () => ({ mutate: createMutate, isPending: false }),
}));
vi.mock("@/lib/toast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), toast: vi.fn() }),
}));

function renderModal(onClose = vi.fn()) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <CreateSkillFromConventionsModal
        repoId="repo-1"
        repoFullName="acme/payments-api"
        repoName="payments-api"
        acceptedIds={["c1", "c2"]}
        onClose={onClose}
      />
    </NextIntlClientProvider>,
  );
}

describe("CreateSkillFromConventionsModal", () => {
  it("seeds the form from the server preview and shows the accepted-count banner", async () => {
    renderModal();
    expect(await screen.findByDisplayValue("payments-api-conventions")).toBeInTheDocument();
    expect(
      screen.getByText(/Merged from 2 accepted conventions in acme\/payments-api/),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue(/Always use async\/await/)).toBeInTheDocument();
  });

  it("creates an extracted skill carrying the candidates' evidence files", async () => {
    const onClose = vi.fn();
    renderModal(onClose);
    await screen.findByDisplayValue("payments-api-conventions");

    fireEvent.click(screen.getByText("Create skill"));
    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "payments-api-conventions",
        type: "convention",
        source: "extracted",
        enabled: true,
        evidence_files: ["src/api/users.ts"],
      }),
      expect.anything(),
    );
    expect(onClose).toHaveBeenCalled();
  });
});
