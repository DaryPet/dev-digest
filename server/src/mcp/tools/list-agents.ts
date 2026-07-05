/**
 * list_agents tool registration. [presentation, imports SDK]
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { toolError, toolSuccess } from '../errors.js';
import type { McpService } from '../application/mcp-service.js';

export function registerListAgents(server: McpServer, service: McpService): void {
  server.registerTool(
    'list_agents',
    {
      description: 'List the configured review agents and their ids.',
      inputSchema: undefined,
    },
    async () => {
      const result = await service.listAgents();
      if (result.kind === 'error') return toolError(result.message, result.next);
      return toolSuccess(result.data);
    },
  );
}
