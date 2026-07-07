/**
 * Blast module routes (spec `specs/blast-radius.md` §5.2).
 *
 *   GET /pulls/:id/blast
 *     params: IdParams
 *     auth/scoping: getContext(container, req) -> workspaceId
 *     200 -> BlastResponse
 *     404 -> NotFoundError('Pull request not found') when PR not in workspace
 *
 * Zero LLM calls: no container.llm usage anywhere on this path.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { BlastService } from './service.js';

export default async function blastRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new BlastService(app.container);

  /**
   * Return the blast radius for a pull request: changed symbols, downstream
   * callers (capped per symbol), impacted endpoints/crons, and index state.
   */
  app.get(
    '/pulls/:id/blast',
    { schema: { params: IdParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.getBlast(workspaceId, req.params.id);
    },
  );
}
