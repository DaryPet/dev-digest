/**
 * buildMcpServer — create the McpServer and register all 5 tools.
 * [presentation, imports SDK]
 *
 * This file is the single place that wires the SDK McpServer to the
 * application-layer McpService + tool registrations. The only non-SDK
 * concern here is constructing McpService with the container + context.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Container } from '../platform/container.js';
import type { McpContext } from './infrastructure/env.js';
import { McpService } from './application/mcp-service.js';
import { registerListAgents } from './tools/list-agents.js';
import { registerRunAgentOnPr } from './tools/run-agent-on-pr.js';
import { registerGetFindings } from './tools/get-findings.js';
import { registerGetConventions } from './tools/get-conventions.js';
import { registerGetBlastRadius } from './tools/get-blast-radius.js';

export function buildMcpServer(container: Container, ctx: McpContext): McpServer {
  const server = new McpServer(
    { name: 'devdigest', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  const service = new McpService(container, ctx);

  registerListAgents(server, service);
  registerRunAgentOnPr(server, service);
  registerGetFindings(server, service);
  registerGetConventions(server, service);
  registerGetBlastRadius(server);

  return server;
}
