/**
 * git-diff — execFile wrapper for `git diff HEAD`.
 *
 * Security: NEVER uses shell interpolation. Uses execFile with a fixed
 * argument array so no user-supplied value can become a shell command.
 *
 * maxBuffer: 32 MiB (handles large diffs without truncation).
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const MAX_BUFFER = 32 * 1024 * 1024; // 32 MiB

/**
 * Sentinel error thrown when the target directory is not a git repository.
 * The CLI catches this and exits with code 2.
 */
export class NotAGitRepoError extends Error {
  constructor(cwd: string) {
    super(`Not a git repository: ${cwd}`);
    this.name = 'NotAGitRepoError';
  }
}

/**
 * Run `git diff HEAD` in `cwd` and return the raw unified diff text.
 *
 * @throws {NotAGitRepoError} if the directory is not a git repository.
 * @throws re-throws any other execFile error unchanged.
 */
export async function getGitDiff(cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['diff', 'HEAD'], {
      cwd,
      maxBuffer: MAX_BUFFER,
    });
    return stdout;
  } catch (e: unknown) {
    const err = e as { code?: number; stderr?: string; message?: string };
    // git exits 128 and writes "not a git repository" to stderr when cwd is not a repo
    if (
      err.code === 128 ||
      err.stderr?.includes('not a git repository') ||
      err.message?.includes('not a git repository')
    ) {
      throw new NotAGitRepoError(cwd);
    }
    throw e;
  }
}
