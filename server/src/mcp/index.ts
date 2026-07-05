/**
 * MCP stdio entrypoint. [presentation/composition, imports SDK]
 *
 * Process wiring ONLY — all business logic lives in server.ts, tools/,
 * application/, and infrastructure/.
 *
 * Security: stdout is RESERVED for JSON-RPC. ALL diagnostic logging goes to
 * stderr (console.error). A stray console.log to stdout would break the
 * MCP protocol handshake.
 */
import 'dotenv/config';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from '../platform/config.js';
import { createDb } from '../db/client.js';
import { Container } from '../platform/container.js';
import { parseMcpEnv } from './infrastructure/env.js';
import { buildMcpServer } from './server.js';

async function main(): Promise<void> {
  // Parse MCP-specific env (workspace, repo, timeout).
  let ctx;
  try {
    ctx = parseMcpEnv(process.env);
  } catch (e) {
    console.error('[mcp] Invalid env config:', e);
    process.exit(1);
  }

  // Boot the DI container (same as the HTTP server, minus Fastify).
  const config = loadConfig(process.env);
  const { db } = createDb(config.databaseUrl);
  const container = new Container(config, db);

  // Build the MCP server and connect to stdio transport.
  const mcpServer = buildMcpServer(container, ctx);
  const transport = new StdioServerTransport();

  console.error('[mcp] DevDigest MCP server starting on stdio…');
  if (ctx.repo) {
    console.error(`[mcp] repo context: ${ctx.repo}`);
  }

  await mcpServer.connect(transport);
  console.error('[mcp] Ready — awaiting client connection');
}

main().catch((err) => {
  console.error('[mcp] Fatal error:', err);
  process.exit(1);
});
