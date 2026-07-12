import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent, AgentSkillLink, Skill } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agents.json";
import { SkillsTab } from "./SkillsTab";

afterEach(cleanup);

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets and injection",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
  project_context_paths: [],
};

const SKILLS: Skill[] = [
  {
    id: "sk1",
    name: "No console.log",
    description: "Disallow stray console.log",
    type: "convention",
    source: "manual",
    body: "Flag console.log calls.",
    enabled: true,
    version: 1,
    project_context_paths: [],
  },
  {
    id: "sk2",
    name: "SQL Injection",
    description: "Flag unsafe query building",
    type: "security",
    source: "manual",
    body: "Flag string-concatenated SQL.",
    enabled: false,
    version: 1,
    project_context_paths: [],
  },
  {
    id: "sk3",
    name: "Unlinked skill",
    description: "Not yet bound to this agent",
    type: "custom",
    source: "manual",
    body: "Some custom rule.",
    enabled: true,
    version: 1,
    project_context_paths: [],
  },
];

const LINKS: AgentSkillLink[] = [
  { agent_id: "ag1", skill_id: "sk1", order: 0 },
  { agent_id: "ag1", skill_id: "sk2", order: 1 },
];

function mockFetch() {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith("/agents/ag1/skills") && (!init || init.method === undefined || init.method === "GET")) {
      return new Response(JSON.stringify(LINKS), { status: 200 });
    }
    if (u.endsWith("/agents/ag1/skills") && init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      const ids: string[] = body.skill_ids;
      const next = ids.map((id, i) => ({ agent_id: "ag1", skill_id: id, order: i }));
      return new Response(JSON.stringify(next), { status: 200 });
    }
    if (u.endsWith("/skills") && (!init || init.method === undefined || init.method === "GET")) {
      return new Response(JSON.stringify(SKILLS), { status: 200 });
    }
    if (u.includes("/skills/") && init?.method === "PUT") {
      const id = u.split("/skills/")[1];
      const patch = JSON.parse(String(init.body));
      const skill = SKILLS.find((sk) => sk.id === id)!;
      return new Response(JSON.stringify({ ...skill, ...patch }), { status: 200 });
    }
    throw new Error(`Unhandled fetch in test: ${u}`);
  });
}

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("Agent editor SkillsTab", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch());
  });

  it("renders the whole skill catalog with type badges and the linked count", async () => {
    renderWithProviders(<SkillsTab agent={AGENT} />);
    // all skills shown (linked + unlinked), checkbox marks membership
    expect(await screen.findByText("No console.log")).toBeInTheDocument();
    expect(screen.getByText("SQL Injection")).toBeInTheDocument();
    expect(screen.getByText("Unlinked skill")).toBeInTheDocument();
    expect(screen.getByText("convention")).toBeInTheDocument();
    expect(screen.getByText("security")).toBeInTheDocument();
    expect(screen.getByText("custom")).toBeInTheDocument();
    // 2 linked (sk1, sk2) of 3 total
    expect(screen.getByText("2 of 3 enabled")).toBeInTheDocument();
  });

  it("checks the boxes for linked skills and leaves unlinked ones unchecked", async () => {
    renderWithProviders(<SkillsTab agent={AGENT} />);
    await screen.findByText("No console.log");
    // display order: linked first (sk1, sk2), then unlinked (sk3)
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes[0]).toHaveAttribute("aria-checked", "true");
    expect(boxes[1]).toHaveAttribute("aria-checked", "true");
    expect(boxes[2]).toHaveAttribute("aria-checked", "false");
  });

  it("checking an unlinked skill links it, appending it to the ordered skill_ids", async () => {
    const fetchMock = mockFetch();
    vi.stubGlobal("fetch", fetchMock);
    renderWithProviders(<SkillsTab agent={AGENT} />);
    await screen.findByText("No console.log");

    fireEvent.click(screen.getAllByRole("checkbox")[2]!); // sk3

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        (c) => String(c[0]).endsWith("/agents/ag1/skills") && c[1]?.method === "POST",
      );
      expect(postCall).toBeTruthy();
      const body = JSON.parse(String(postCall![1]!.body));
      expect(body.skill_ids).toEqual(["sk1", "sk2", "sk3"]);
    });
  });

  it("unchecking a linked skill unlinks it, persisting the filtered skill_ids", async () => {
    const fetchMock = mockFetch();
    vi.stubGlobal("fetch", fetchMock);
    renderWithProviders(<SkillsTab agent={AGENT} />);
    await screen.findByText("No console.log");

    fireEvent.click(screen.getAllByRole("checkbox")[0]!); // sk1

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        (c) => String(c[0]).endsWith("/agents/ag1/skills") && c[1]?.method === "POST",
      );
      expect(postCall).toBeTruthy();
      const body = JSON.parse(String(postCall![1]!.body));
      expect(body.skill_ids).toEqual(["sk2"]);
    });
  });

  it("filters the catalog by name", async () => {
    renderWithProviders(<SkillsTab agent={AGENT} />);
    await screen.findByText("No console.log");

    fireEvent.change(screen.getByPlaceholderText("Filter skills…"), { target: { value: "SQL" } });
    expect(screen.getByText("SQL Injection")).toBeInTheDocument();
    expect(screen.queryByText("No console.log")).not.toBeInTheDocument();
    expect(screen.queryByText("Unlinked skill")).not.toBeInTheDocument();
  });
});
