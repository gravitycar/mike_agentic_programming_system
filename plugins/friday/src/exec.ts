import { spawn, spawnSync } from 'child_process';

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

/**
 * Runs a program with arguments and no shell, so text inside an argument can
 * never run as a command.
 */
export function run(
  cmd: string,
  args: string[],
  opts: { cwd?: string; input?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number } = {}
): ExecResult {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd,
    input: opts.input,
    env: opts.env ?? process.env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: opts.timeoutMs,
  });
  return {
    code: r.status ?? (r.signal ? 124 : 1),
    stdout: r.stdout ?? '',
    stderr: (r.stderr ?? '') + (r.error ? String(r.error) : ''),
    timedOut: r.error !== undefined && (r.error as NodeJS.ErrnoException).code === 'ETIMEDOUT',
  };
}

/** Like run, but throws on a non-zero exit. */
export function runOk(cmd: string, args: string[], opts: Parameters<typeof run>[2] = {}): string {
  const r = run(cmd, args, opts);
  if (r.code !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} exited ${r.code}: ${r.stderr.trim() || r.stdout.trim()}`);
  }
  return r.stdout;
}

/**
 * Runs a program in its own process group, so a timeout ends its children too.
 * Resolves with its output; never rejects.
 */
export function runGroup(
  cmd: string,
  args: string[],
  opts: { cwd?: string; input?: string; env?: NodeJS.ProcessEnv; timeoutMs: number }
): Promise<ExecResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      detached: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-child.pid!, 'SIGTERM');
        setTimeout(() => {
          try {
            process.kill(-child.pid!, 'SIGKILL');
          } catch {
            /* already gone */
          }
        }, 5000);
      } catch {
        /* already gone */
      }
    }, opts.timeoutMs);
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ code: 127, stdout, stderr: stderr + String(e), timedOut });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 124, stdout, stderr, timedOut });
    });
    if (opts.input !== undefined) child.stdin.end(opts.input);
    else child.stdin.end();
  });
}
