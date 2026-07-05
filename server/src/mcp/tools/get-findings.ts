/**
 * get_findings tool registration. [presentation, imports SDK]
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { toolError, toolSuccess } from '../errors.js';
import { getFindingsInput } from '../schemas.js';
import type { McpService } from '../application/mcp-service.js';

export function registerGetFindings(server: McpServer, service: McpService): void {
  server.registerTool(
    'get_findings',
    {
      description: 'Fetch the verdict and findings of a completed run by runId.',
      inputSchema: getFindingsInput,
    },
    async (args: { runId: string }) => {
      const result = await service.getFindings(args.runId);
      if (result.kind === 'error') return toolError(result.message, result.next);
      return toolSuccess(result.data);
    },
  );
}
