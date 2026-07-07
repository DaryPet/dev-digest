/**
 * Blast module barrel — re-export the public service and schema types so
 * downstream consumers (MCP tool, CLI) can import from one place.
 */
export { BlastService } from './service.js';
export type { BlastResponse, BlastIndexInfo } from './schemas.js';
export { BlastResponse as BlastResponseSchema, BlastIndexInfo as BlastIndexInfoSchema } from './schemas.js';
export { default as blastRoutes } from './routes.js';
