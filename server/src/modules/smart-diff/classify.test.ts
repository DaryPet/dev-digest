import { describe, it, expect } from 'vitest';
import { classify } from './classify.js';

/**
 * Pure unit tests for classify() (spec `specs/smart-diff.md` §8 T1).
 * No DB, no I/O, no LLM -- purely exercises the pattern-matching logic.
 */

// ---- boilerplate -----------------------------------------------------------

describe('classify -- boilerplate', () => {
  it('classifies package-lock.json as boilerplate', () => {
    expect(classify('package-lock.json')).toBe('boilerplate');
  });

  it('classifies pnpm-lock.yaml as boilerplate', () => {
    expect(classify('pnpm-lock.yaml')).toBe('boilerplate');
  });

  it('classifies yarn.lock as boilerplate', () => {
    expect(classify('yarn.lock')).toBe('boilerplate');
  });

  it('classifies bun.lockb as boilerplate', () => {
    expect(classify('bun.lockb')).toBe('boilerplate');
  });

  it('classifies go.sum as boilerplate', () => {
    expect(classify('go.sum')).toBe('boilerplate');
  });

  it('classifies a nested package-lock.json as boilerplate', () => {
    expect(classify('packages/api/package-lock.json')).toBe('boilerplate');
  });

  it('classifies a file inside dist/ as boilerplate', () => {
    expect(classify('dist/index.js')).toBe('boilerplate');
  });

  it('classifies a file inside .next/ as boilerplate', () => {
    expect(classify('.next/server/app/page.js')).toBe('boilerplate');
  });

  it('classifies a __snapshots__ file as boilerplate', () => {
    expect(classify('src/__snapshots__/Button.test.snap')).toBe('boilerplate');
  });

  it('classifies a .snap file as boilerplate', () => {
    expect(classify('tests/inline.snap')).toBe('boilerplate');
  });

  it('classifies a .min.js file as boilerplate', () => {
    expect(classify('vendor/jquery.min.js')).toBe('boilerplate');
  });

  it('classifies a .min.css file as boilerplate', () => {
    expect(classify('public/styles.min.css')).toBe('boilerplate');
  });
});

// ---- wiring ----------------------------------------------------------------

describe('classify -- wiring', () => {
  it('classifies a root index.ts barrel as wiring', () => {
    expect(classify('index.ts')).toBe('wiring');
  });

  it('classifies a nested index.ts barrel as wiring', () => {
    expect(classify('src/modules/index.ts')).toBe('wiring');
  });

  it('classifies an index.tsx barrel as wiring', () => {
    expect(classify('src/components/index.tsx')).toBe('wiring');
  });

  it('classifies a *.config.ts file as wiring', () => {
    expect(classify('vitest.config.ts')).toBe('wiring');
  });

  it('classifies a *.config.js file as wiring', () => {
    expect(classify('webpack.config.js')).toBe('wiring');
  });

  it('classifies tsconfig.json as wiring', () => {
    expect(classify('tsconfig.json')).toBe('wiring');
  });

  it('classifies tsconfig.build.json as wiring', () => {
    expect(classify('tsconfig.build.json')).toBe('wiring');
  });

  it('classifies package.json as wiring', () => {
    expect(classify('package.json')).toBe('wiring');
  });

  it('classifies a .yml CI file as wiring', () => {
    expect(classify('.github/workflows/ci.yml')).toBe('wiring');
  });

  it('classifies a .yaml compose file as wiring', () => {
    expect(classify('docker-compose.yaml')).toBe('wiring');
  });

  it('classifies a Dockerfile as wiring', () => {
    expect(classify('Dockerfile')).toBe('wiring');
  });

  it('classifies a nested Dockerfile as wiring', () => {
    expect(classify('apps/api/Dockerfile')).toBe('wiring');
  });

  it('classifies a .env file as wiring', () => {
    expect(classify('.env')).toBe('wiring');
  });

  it('classifies a .env.local file as wiring', () => {
    expect(classify('.env.local')).toBe('wiring');
  });

  it('classifies a .d.ts ambient type file as wiring', () => {
    expect(classify('src/types/api.d.ts')).toBe('wiring');
  });
});

// ---- core ------------------------------------------------------------------

describe('classify -- core', () => {
  it('classifies src/modules/x/service.ts as core', () => {
    expect(classify('src/modules/x/service.ts')).toBe('core');
  });

  it('classifies a generic utility file as core', () => {
    expect(classify('src/lib/utils.ts')).toBe('core');
  });

  it('classifies a React component as core', () => {
    expect(classify('src/components/Button.tsx')).toBe('core');
  });

  it('classifies a test file as core (not a known wiring/boilerplate pattern)', () => {
    expect(classify('src/service.test.ts')).toBe('core');
  });

  it('classifies a Python source file as core', () => {
    expect(classify('src/main.py')).toBe('core');
  });
});

// ---- precedence ------------------------------------------------------------

describe('classify -- precedence (boilerplate wins over wiring)', () => {
  it('pnpm-lock.yaml resolves as boilerplate not wiring (yaml pattern also matches)', () => {
    // pnpm-lock.yaml ends in .yaml so WIRING_PATTERNS /\.(ya?ml)$/ would match,
    // but BOILERPLATE_PATTERNS is checked first and wins.
    expect(classify('pnpm-lock.yaml')).toBe('boilerplate');
  });

  it('yarn.lock resolves as boilerplate not wiring', () => {
    expect(classify('yarn.lock')).toBe('boilerplate');
  });

  it('a file in dist/ with a .ts extension resolves as boilerplate not core', () => {
    // Edge case: a generated .ts in dist/ -- boilerplate wins over core default.
    expect(classify('dist/generated/types.ts')).toBe('boilerplate');
  });
});
