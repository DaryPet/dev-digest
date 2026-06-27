import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SkillTypeBadge, SKILL_TYPE_META } from "./SkillTypeBadge";

afterEach(cleanup);

describe("SKILL_TYPE_META", () => {
  it("covers every SkillType with a distinct label", () => {
    const types = ["rubric", "convention", "security", "custom"] as const;
    for (const t of types) {
      expect(SKILL_TYPE_META[t].label).toBe(t);
    }
  });
});

describe("SkillTypeBadge", () => {
  it("renders the type label", () => {
    render(<SkillTypeBadge type="security" />);
    expect(screen.getByText("security")).toBeInTheDocument();
  });

  it("renders a different label per type (no shared hardcoded text)", () => {
    render(<SkillTypeBadge type="rubric" />);
    expect(screen.getByText("rubric")).toBeInTheDocument();
  });
});
