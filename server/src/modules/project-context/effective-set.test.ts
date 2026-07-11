import { describe, it, expect } from 'vitest';
import { computeEffectiveAttachedPaths, isSafeRelativePath } from './effective-set.js';

describe('computeEffectiveAttachedPaths', () => {
  it('lists direct paths first, in their persisted order', () => {
    expect(computeEffectiveAttachedPaths(['b.md', 'a.md'], [])).toEqual(['b.md', 'a.md']);
  });

  it("appends each linked skill's paths after the direct ones, in skill-link order (AC-17)", () => {
    const result = computeEffectiveAttachedPaths(['a.md'], [['b.md', 'c.md'], ['d.md']]);
    expect(result).toEqual(['a.md', 'b.md', 'c.md', 'd.md']);
  });

  it('dedups by path across direct + skills; first occurrence wins position (AC-17)', () => {
    const result = computeEffectiveAttachedPaths(['a.md', 'b.md'], [['b.md', 'c.md']]);
    expect(result).toEqual(['a.md', 'b.md', 'c.md']);
  });

  it('dedups across multiple skills too', () => {
    const result = computeEffectiveAttachedPaths([], [['a.md'], ['a.md', 'b.md']]);
    expect(result).toEqual(['a.md', 'b.md']);
  });

  it('returns [] for no direct paths and no skills', () => {
    expect(computeEffectiveAttachedPaths([], [])).toEqual([]);
  });
});

describe('isSafeRelativePath', () => {
  it('accepts a plain repo-relative path', () => {
    expect(isSafeRelativePath('specs/foo.md')).toBe(true);
    expect(isSafeRelativePath('foo.md')).toBe(true);
  });

  it('rejects a leading slash', () => {
    expect(isSafeRelativePath('/etc/passwd')).toBe(false);
  });

  it('rejects any .. segment, anywhere in the path', () => {
    expect(isSafeRelativePath('..')).toBe(false);
    expect(isSafeRelativePath('../secrets.md')).toBe(false);
    expect(isSafeRelativePath('specs/../../etc/passwd')).toBe(false);
    expect(isSafeRelativePath('specs/..')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isSafeRelativePath('')).toBe(false);
  });
});
