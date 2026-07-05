/**
 * waitForRun — promisify RunBus.onDone with a safety timeout. SDK-FREE.
 *
 * RunBus guarantees onDone fires on every terminal path (done/failed/cancelled/
 * pre-work-fail), so this will not hang in production. The timeout is an extra
 * safety net for the MCP context where an indefinitely blocking call would stall
 * the client's tool-call queue.
 *
 * On timeout we return the runId so the caller can instruct the AI agent to
 * call get_findings later (P4 forward-leading error).
 */
import type { RunBus } from '../../platform/sse.js';

export type WaitResult =
  | { timedOut: false }
  | { timedOut: true; runId: string; elapsedMs: number };

/**
 * Wait for a run to complete (via RunBus.onDone), bounded by timeoutMs.
 *
 * If the run is already complete when called, onDone fires immediately via
 * queueMicrotask — the returned promise resolves in the next microtask tick.
 */
export function waitForRun(
  runBus: RunBus,
  runId: string,
  timeoutMs: number,
): Promise<WaitResult> {
  return new Promise<WaitResult>((resolve) => {
    const startedAt = Date.now();
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      unsubscribe();
      resolve({ timedOut: true, runId, elapsedMs: Date.now() - startedAt });
    }, timeoutMs);

    const unsubscribe = runBus.onDone(runId, () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ timedOut: false });
    });
  });
}
