/**
 * CLI entry point — `devdigest review`.
 *
 * Thin composition root: dotenv, arg parsing, container boot, then delegates
 * to review-command.ts. All business logic lives in the command module.
 *
 * Invocation:
 *   pnpm devdigest review --mode working [--agent "<name>"] [--path <dir>]
 *   ./node_modules/.bin/tsx src/cli/index.ts review --mode working
 *
 * Note: dotenv loads .env from cwd. When run outside server/, set
 * DOTENV_CONFIG_PATH=<abs>/server/.env (same as .mcp.json pattern).
 */
import 'dotenv/config';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { loadConfig } from '../platform/config.js';
import { createDb } from '../db/client.js';
import { Container } from '../platform/container.js';
import { ConfigError } from '../platform/errors.js';
import { getGitDiff } from './git-diff.js';
import { runReviewCommand } from './review-command.js';

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

const ModeSchema = z.enum(['working', 'staged', 'branch']);

function usage(): void {
  process.stderr.write(
    'Usage: devdigest review --mode <working|staged|branch> [--agent "<name>"] [--path <dir>]\n',
  );
}

async function main(): Promise<void> {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: process.argv.slice(2),
      options: {
        mode: { type: 'string' as const },
        agent: { type: 'string' as const },
        path: { type: 'string' as const },
      },
      allowPositionals: true,
    });
  } catch (e: unknown) {
    process.stderr.write(`Error: ${(e as Error).message}\n`);
    usage();
    process.exit(2);
  }

  const { values, positionals } = parsed;

  // Subcommand check
  const subcommand = positionals[0];
  if (subcommand !== 'review') {
    process.stderr.write(
      `Error: unknown subcommand "${subcommand ?? ''}". Expected: review\n`,
    );
    usage();
    process.exit(2);
  }

  // Mode validation (Zod)
  const modeResult = ModeSchema.safeParse(values.mode);
  if (!modeResult.success) {
    process.stderr.write(
      `Error: --mode is required and must be one of: working, staged, branch\n`,
    );
    process.exit(2);
  }
  const mode = modeResult.data;

  // Unimplemented modes
  if (mode === 'staged' || mode === 'branch') {
    process.stderr.write(`mode "${mode}" is not implemented yet\n`);
    process.exit(2);
  }

  const agentName: string = typeof values.agent === 'string' ? values.agent : 'General Reviewer';
  const targetDir: string =
    typeof values.path === 'string'
      ? values.path
      : (process.env.INIT_CWD ?? process.cwd());

  // Boot container
  let config;
  try {
    config = loadConfig(process.env);
  } catch (e: unknown) {
    if (e instanceof ConfigError) {
      process.stderr.write(`Error: ${e.message}\n`);
      process.exit(2);
    }
    throw e;
  }

  const { db } = createDb(config.databaseUrl);
  const container = new Container(config, db);

  const exitCode = await runReviewCommand(
    { mode, agentName, targetDir },
    {
      getGitDiff,
      listAgents: (wsId) => container.agentsRepo.list(wsId),
      getCurrentWorkspace: () => container.auth.currentWorkspace(null),
      getLlm: (provider) =>
        container.llm(provider as 'openai' | 'anthropic' | 'openrouter'),
      stderr: (msg) => process.stderr.write(msg + '\n'),
      stdout: (msg) => process.stdout.write(msg + '\n'),
    },
  );

  process.exit(exitCode);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Fatal: ${msg}\n`);
  process.exit(2);
});
