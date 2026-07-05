/**
 * P4 — error shaping: errors lead forward.
 *
 * SDK-isolation: uses a type-only import for CallToolResult.
 * This file is otherwise SDK-free (no runtime SDK values).
 */
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * Build a forward-leading error result. Every failure returns actionable
 * guidance via the `next` field so the calling agent knows what to do.
 *
 * Frozen format:
 *   { error: string, next?: string }
 */
export function toolError(message: string, next?: string): CallToolResult {
  const payload = next ? { error: message, next } : { error: message };
  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    isError: true,
  };
}

/** Build a success result (compact JSON payload). */
export function toolSuccess(output: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(output) }],
  };
}
