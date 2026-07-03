import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { SmartDiffService } from './service.js';

/**
 * Smart Diff module (spec `specs/smart-diff.md` §7 T1).
 *
 *   GET /pulls/:id/smart-diff
 *     params: IdParams
 *     auth/scoping: getContext(container, req) -> workspaceId
 *     200 -> SmartDiffResponse (= SmartDiff from @devdigest/shared)
 *     404 -> NotFoundError('Pull request not found') when PR not in workspace
 *
 * Token-free: zero LLM calls on this path (no container.llm usage).
 */
export default async function smartDiffRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new SmartDiffService(app.container);

  /**
   * Return the risk-ordered smart diff for a pull request.
   * Works immediately after PR import; `finding_lines` are empty when no
   * review has run yet.
   */
  app.get(
    '/pulls/:id/smart-diff',
    { schema: { params: IdParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.getSmartDiff(workspaceId, req.params.id);
    },
  );
}
