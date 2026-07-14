import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { BriefService } from './service.js';

/**
 * Brief module (spec `specs/SPEC-02-pr-why-risk-brief.md`).
 *
 *   POST /pulls/:id/brief
 *     params: IdParams
 *     body:   { recompute?: boolean }  (default false)
 *     200 -> { brief: Brief }
 *     404 -> NotFoundError('Pull request not found') when PR not in workspace
 *
 * No separate GET route — the cache-or-compute semantics live entirely in
 * this one endpoint (recompute:false reads-or-computes; recompute:true always
 * recomputes + persists).
 */
const BriefRequestBody = z.object({
  recompute: z.boolean().optional().default(false),
});

export default async function briefRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new BriefService(app.container);

  app.post(
    '/pulls/:id/brief',
    { schema: { params: IdParams, body: BriefRequestBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.getBrief(workspaceId, req.params.id, { recompute: req.body.recompute });
    },
  );
}
