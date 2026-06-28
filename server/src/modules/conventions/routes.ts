import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { ValidationError } from '../../platform/errors.js';
import { ConventionsService } from './service.js';

/**
 * Conventions Extractor module (spec `specs/conventions-extractor.md`).
 *   POST /repos/:id/conventions/extract        → scan repo → verified candidates
 *   GET  /repos/:id/conventions                → list candidates (newest first) + meta
 *   PATCH /repos/:id/conventions/:cid          → accept/reject OR edit rule wording
 *   POST /repos/:id/conventions/skill-preview  → generate skill-body preview (no write)
 */

const CidParams = z.object({
  id: z.string().uuid(),
  cid: z.string().uuid(),
});

const PatchBody = z
  .object({
    status: z.enum(['accepted', 'rejected']).optional(),
    rule: z.string().min(1).optional(),
  })
  .refine((b) => b.status !== undefined || b.rule !== undefined, {
    message: 'Provide either status or rule',
  });

const SkillPreviewBody = z.object({
  candidateIds: z.array(z.string().uuid()).min(1),
  name: z.string().optional(),
});

export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ConventionsService(app.container);

  app.post('/repos/:id/conventions/extract', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.extract(workspaceId, req.params.id);
  });

  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId, req.params.id);
  });

  app.patch(
    '/repos/:id/conventions/:cid',
    { schema: { params: CidParams, body: PatchBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const { status, rule } = req.body;
      if (status !== undefined) return service.patchStatus(workspaceId, req.params.cid, status);
      if (rule !== undefined) return service.patchRule(workspaceId, req.params.cid, rule);
      throw new ValidationError('Provide either status or rule');
    },
  );

  app.post(
    '/repos/:id/conventions/skill-preview',
    { schema: { params: IdParams, body: SkillPreviewBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.skillPreview(
        workspaceId,
        req.params.id,
        req.body.candidateIds,
        req.body.name,
      );
    },
  );
}
