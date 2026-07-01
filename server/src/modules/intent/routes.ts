import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { IntentService } from './service.js';

/**
 * Intent classifier module (spec `specs/intent-layer.md` §7 T-A).
 *
 *   POST /pulls/:id/intent/compute  → always recomputes + persists → { intent: Intent }
 *   GET  /pulls/:id/intent          → reads stored intent → { intent: Intent | null }
 *
 * Both routes are workspace-scoped via `getContext`.
 */
export default async function intentRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new IntentService(app.container);

  /**
   * Recompute and persist the intent for a pull request.
   * Always overwrites the existing value (upsert).
   * Returns { intent: Intent }.
   */
  app.post(
    '/pulls/:id/intent/compute',
    { schema: { params: IdParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.computeIntent(workspaceId, req.params.id, req.log);
    },
  );

  /**
   * Read the stored intent for a pull request.
   * Returns { intent: Intent | null } — never 404 on "not yet computed".
   */
  app.get(
    '/pulls/:id/intent',
    { schema: { params: IdParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.getIntent(workspaceId, req.params.id);
    },
  );
}
