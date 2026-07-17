import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { EvalCaseInput, EvalOwnerKind } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { EvalService } from './service.js';

/**
 * Eval module (spec `specs/eval-pipeline.md`, plan `plans/eval-pipeline.md`
 * §6.1 — 13 routes, T-A). Case CRUD + status, from-finding creation, run
 * execution (single/batch), the multi-version-group dashboard, and Promote.
 * Every route resolves `workspaceId` via `getContext` first.
 */

const CaseParams = z.object({
  id: z.string().uuid(),
  caseId: z.string().uuid(),
});

const RunVersionParams = z.object({
  id: z.string().uuid(),
  version: z.coerce.number().int(),
});

const DashboardQuery = z.object({
  owner_kind: EvalOwnerKind.optional(),
  owner_id: z.string().optional(),
});

const PromoteBody = z.object({
  version: z.number().int(),
});

export default async function evalRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new EvalService(app.container);

  // ---- case CRUD + status (routes 1-5) -------------------------------------

  app.get('/agents/:id/eval-cases', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.listCases(workspaceId, req.params.id);
  });

  app.post(
    '/agents/:id/eval-cases',
    { schema: { params: IdParams, body: EvalCaseInput } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const created = await service.createCase(workspaceId, req.params.id, req.body);
      reply.status(201);
      return created;
    },
  );

  app.get('/agents/:id/eval-cases/status', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.listCaseStatuses(workspaceId, req.params.id);
  });

  app.get(
    '/agents/:id/eval-cases/:caseId',
    { schema: { params: CaseParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.getCase(workspaceId, req.params.id, req.params.caseId);
    },
  );

  app.patch(
    '/agents/:id/eval-cases/:caseId',
    { schema: { params: CaseParams, body: EvalCaseInput } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.updateCase(workspaceId, req.params.id, req.params.caseId, req.body);
    },
  );

  app.delete(
    '/agents/:id/eval-cases/:caseId',
    { schema: { params: CaseParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      await service.deleteCase(workspaceId, req.params.id, req.params.caseId);
      return { ok: true };
    },
  );

  // ---- from-finding creation (route 6) -------------------------------------

  app.post(
    '/findings/:id/eval-case',
    { schema: { params: IdParams } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const created = await service.createCaseFromFinding(workspaceId, req.params.id);
      reply.status(201);
      return created;
    },
  );

  // ---- run execution (routes 7-10) -----------------------------------------

  app.post(
    '/agents/:id/eval-cases/:caseId/run',
    { schema: { params: CaseParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.runCase(workspaceId, req.params.id, req.params.caseId);
    },
  );

  app.post('/agents/:id/eval-runs', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.runAll(workspaceId, req.params.id);
  });

  app.get('/agents/:id/eval-runs', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.listRuns(workspaceId, req.params.id);
  });

  app.get(
    '/agents/:id/eval-runs/:version/snapshot',
    { schema: { params: RunVersionParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.getRunSnapshot(workspaceId, req.params.id, req.params.version);
    },
  );

  // ---- dashboard (routes 11-12) --------------------------------------------

  app.get('/eval/dashboard', { schema: { querystring: DashboardQuery } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.dashboard(workspaceId, req.query.owner_kind, req.query.owner_id);
  });

  app.get('/eval/dashboard/agents', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.dashboardAgents(workspaceId);
  });

  // ---- promote (route 13) --------------------------------------------------

  app.post(
    '/agents/:id/promote-config',
    { schema: { params: IdParams, body: PromoteBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.promoteConfig(workspaceId, req.params.id, req.body.version);
    },
  );
}
