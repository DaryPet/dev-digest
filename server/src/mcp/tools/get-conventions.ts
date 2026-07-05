/**
 * get_conventions tool registration. [presentation, imports SDK]
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { toolError, toolSuccess } from '../errors.js';
import type { McpService } from '../application/mcp-service.js';

export function registerGetConventions(server: McpServer, service: McpService): void {
  server.registerTool(
    'get_conventions',
    {
      description: 'List the repository conventions for the configured repo.',
      inputSchema: undefined,
    },
    async () => {
      const result = await service.getConventions();
      if (result.kind === 'error') return toolError(result.message, result.next);
      return toolSuccess(result.data);
    },
  );
}
