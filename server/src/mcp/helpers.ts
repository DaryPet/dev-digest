import { z } from 'zod';
import type { AgentRow, FindingRow, ConventionRow } from '../db/rows.js';

// ---------------------------------------------------------------------------
// McpAgent — list_agents compact output (no system_prompt)
// ---------------------------------------------------------------------------

export const McpAgent = z.object({
  id: z.string(),
  name: z.string(),
  version: z.number().int(),
  provider: z.string(),
  model: z.string(),
  enabled: z.boolean(),
});
export type McpAgent = z.infer<typeof McpAgent>;

export function toMcpAgent(row: AgentRow): McpAgent {
  return {
    id: row.id,
    name: row.name,
    version: row.version,
    provider: row.provider,
    model: row.model,
    enabled: row.enabled,
  };
}

// ---------------------------------------------------------------------------
// McpFinding — P3 compact finding: essentials only.
// NO rationale / evidence / suggestion / confidence.
// ---------------------------------------------------------------------------

export const McpFinding = z.object({
  id: z.string(),
  severity: z.string(),       // CRITICAL | WARNING | SUGGESTION
  category: z.string(),
  title: z.string(),
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
});
export type McpFinding = z.infer<typeof McpFinding>;

export function toMcpFinding(row: FindingRow): McpFinding {
  return {
    id: row.id,
    severity: row.severity,
    category: row.category,
    title: row.title,
    file: row.file,
    start_line: row.startLine,
    end_line: row.endLine,
  };
}

// ---------------------------------------------------------------------------
// McpConvention — P3 compact convention: drop evidence_snippet. ALL statuses.
// ---------------------------------------------------------------------------

export const McpConvention = z.object({
  rule: z.string(),
  category: z.string().nullable(),
  evidence_path: z.string(),
  status: z.string(),         // pending | accepted | rejected
});
export type McpConvention = z.infer<typeof McpConvention>;

export function toMcpConvention(row: ConventionRow): McpConvention {
  return {
    rule: row.rule,
    category: row.category,
    evidence_path: row.evidencePath ?? '',
    status: row.status,
  };
}
