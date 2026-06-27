import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { Skill } from "@devdigest/shared";
import { SkillCard } from "./SkillCard";

afterEach(cleanup);

const SKILL: Skill = {
  id: "sk1",
  name: "PR Quality Rubric",
  description: "Checks tests, docs and naming conventions.",
  type: "rubric",
  source: "manual",
  body: "# Rule\nDescribe the rule.",
  enabled: true,
  version: 1,
  evidence_files: null,
};

describe("SkillCard (smoke)", () => {
  it("renders the skill name, type badge and description", () => {
    render(<SkillCard skill={SKILL} />);
    expect(screen.getByText("PR Quality Rubric")).toBeInTheDocument();
    expect(screen.getByText("rubric")).toBeInTheDocument();
    expect(screen.getByText("Checks tests, docs and naming conventions.")).toBeInTheDocument();
  });

  it("does not render a runs/accept-rate stats strip (no aggregate data source)", () => {
    render(<SkillCard skill={SKILL} />);
    expect(screen.queryByText(/run/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/accept/i)).not.toBeInTheDocument();
  });

  it("calls onClick when the card is clicked", () => {
    const onClick = vi.fn();
    render(<SkillCard skill={SKILL} onClick={onClick} />);
    fireEvent.click(screen.getByText("PR Quality Rubric"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("toggling enabled calls onToggle and does not bubble to onClick", () => {
    const onClick = vi.fn();
    const onToggle = vi.fn();
    render(<SkillCard skill={SKILL} onClick={onClick} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("switch"));
    expect(onToggle).toHaveBeenCalledWith(false);
    expect(onClick).not.toHaveBeenCalled();
  });
});
