import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { ProjectContextService } from './service.js';

/**
 * project-context module (spec `specs/SPEC-01-project-context-folder.md`).
 *   GET /repos/:id/context          → ProjectContextCatalog
 *       query: agent_id? | skill_id? (mutually exclusive; governs `.attachment`)
 *   GET /repos/:id/context/preview  → ProjectContextPreview
 *       query: path (repo-relative; validated against a fresh discovery pass)
 *   POST /repos/:id/context/files   → ProjectContextDocument (create; toolbar +/upload)
 *   PUT  /repos/:id/context/files   → ProjectContextDocument (edit-mode save)
 *   POST /repos/:id/context/folders → { path } (toolbar new-folder)
 *
 * Attach/detach/reorder is NOT a route here — it reuses the existing
 * `PUT /agents/:id` / `PUT /skills/:id` update paths (see those modules).
 */

const CatalogQuery = z.object({
  agent_id: z.string().uuid().optional(),
  skill_id: z.string().uuid().optional(),
});

const PreviewQuery = z.object({
  path: z.string().min(1),
});

/** Content cap mirrors MAX_PREVIEW_READ_BYTES (400 KB) — larger writes are rejected. */
const FileBody = z.object({
  path: z.string().min(1).max(500),
  content: z.string().max(400 * 1024),
});

const FolderBody = z.object({
  path: z.string().min(1).max(500),
});

export default async function projectContextRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ProjectContextService(app.container);

  app.get(
    '/repos/:id/context',
    { schema: { params: IdParams, querystring: CatalogQuery } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const { agent_id, skill_id } = req.query;
      return service.getCatalog(workspaceId, req.params.id, {
        ...(agent_id !== undefined ? { agentId: agent_id } : {}),
        ...(skill_id !== undefined ? { skillId: skill_id } : {}),
      });
    },
  );

  app.get(
    '/repos/:id/context/preview',
    { schema: { params: IdParams, querystring: PreviewQuery } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const preview = await service.getPreview(workspaceId, req.params.id, req.query.path);
      if (!preview) throw new NotFoundError('Document not found');
      return preview;
    },
  );

  app.post(
    '/repos/:id/context/files',
    { schema: { params: IdParams, body: FileBody } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const doc = await service.createDocument(workspaceId, req.params.id, req.body.path, req.body.content);
      return reply.code(201).send(doc);
    },
  );

  app.put(
    '/repos/:id/context/files',
    { schema: { params: IdParams, body: FileBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.updateDocument(workspaceId, req.params.id, req.body.path, req.body.content);
    },
  );

  app.post(
    '/repos/:id/context/folders',
    { schema: { params: IdParams, body: FolderBody } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const created = await service.createFolder(workspaceId, req.params.id, req.body.path);
      return reply.code(201).send(created);
    },
  );
}
