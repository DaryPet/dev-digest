/* diff-viewer — unified-diff viewer with optional inline GitHub comments.
   Public surface: the DiffViewer component + the DiffCommentApi contract,
   plus the patch-parsing primitives for callers that render their own
   diff lines (e.g. SmartDiffViewer's finding-line anchoring). */
export { DiffViewer } from "./DiffViewer";
export type { DiffCommentApi } from "./comments";
export { parsePatch } from "./helpers";
export type { Line } from "./helpers";
