import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { waitForRun } from './wait-for-run.js';
import { RunBus } from '../../platform/sse.js';

/**
 * Unit tests for waitForRun (SDK-free).
 *
 * Uses a real RunBus instance (no DB, no network). Exercises:
 *   - Resolves immediately when the run is already complete.
 *   - Resolves after the run completes (async).
 *   - Times out and returns timedOut:true with the runId.
 */

describe('waitForRun', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves immediately (timedOut: false) when run is already complete', async () => {
    const bus = new RunBus();
    bus.complete('run-1');

    // Already completed — onDone fires via queueMicrotask, so we need to flush
    const result = await waitForRun(bus, 'run-1', 30_000);
    expect(result.timedOut).toBe(false);
  });

  it('resolves (timedOut: false) when run completes before timeout', async () => {
    const bus = new RunBus();

    const waitPromise = waitForRun(bus, 'run-async', 30_000);

    // Simulate run completing
    bus.complete('run-async');

    const result = await waitPromise;
    expect(result.timedOut).toBe(false);
  });

  it('returns timedOut: true with runId and elapsedMs when timeout fires', async () => {
    const bus = new RunBus();

    const waitPromise = waitForRun(bus, 'run-slow', 5_000);

    // Advance fake clock past the timeout
    vi.advanceTimersByTime(6_000);

    const result = await waitPromise;
    expect(result.timedOut).toBe(true);
    if (result.timedOut) {
      expect(result.runId).toBe('run-slow');
      expect(result.elapsedMs).toBeGreaterThanOrEqual(5_000);
    }
  });

  it('does not fire timeout when run completes just before deadline', async () => {
    const bus = new RunBus();

    const waitPromise = waitForRun(bus, 'run-near', 5_000);

    // Complete the run before timeout
    vi.advanceTimersByTime(4_999);
    bus.complete('run-near');

    const result = await waitPromise;
    expect(result.timedOut).toBe(false);
  });

  it('does not resolve twice when run completes and then timeout fires', async () => {
    const bus = new RunBus();

    let resolveCount = 0;
    const original = waitForRun;

    // Wrap to count resolutions
    const waitPromise = waitForRun(bus, 'run-double', 5_000);
    waitPromise.then(() => resolveCount++);

    bus.complete('run-double');
    vi.advanceTimersByTime(6_000);

    await waitPromise;
    // Give microtasks a chance to settle
    await Promise.resolve();

    expect(resolveCount).toBe(1);
  });
});
