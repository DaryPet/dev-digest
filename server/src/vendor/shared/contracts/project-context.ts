import { z } from 'zod';

export const ProjectContextCategory = z.enum(['specs', 'docs', 'insights']);
export type ProjectContextCategory = z.infer<typeof ProjectContextCategory>;

export const ProjectContextDocument = z.object({
  path: z.string(),
  category: ProjectContextCategory,
});
export type ProjectContextDocument = z.infer<typeof ProjectContextDocument>;

export const ProjectContextEffectiveDocument = ProjectContextDocument.extend({
  approx_tokens: z.number().int(),
});
export type ProjectContextEffectiveDocument = z.infer<typeof ProjectContextEffectiveDocument>;

/** Present only when the catalog request specified agent_id or skill_id. */
export const ProjectContextAttachment = z.object({
  attached_paths: z.array(z.string()),
  /** Post-dedup effective set (agent: direct + inherited skills; skill: its own list only). */
  effective: z.array(ProjectContextEffectiveDocument),
  total_approx_tokens: z.number().int(),
});
export type ProjectContextAttachment = z.infer<typeof ProjectContextAttachment>;

export const ProjectContextCatalog = z.object({
  root_path: z.string(),
  documents: z.array(ProjectContextDocument),
  attachment: ProjectContextAttachment.nullish(),
});
export type ProjectContextCatalog = z.infer<typeof ProjectContextCatalog>;

export const ProjectContextPreview = z.object({
  path: z.string(),
  category: ProjectContextCategory,
  content: z.string(),
  used_by_count: z.number().int(),
});
export type ProjectContextPreview = z.infer<typeof ProjectContextPreview>;
