/** 外部コマンドの実行（シェルを経由せず、引数は配列で渡す）。 */
import { execFile } from 'node:child_process';

export function run(cmd, args, opts = {}) {
  return new Promise((resolvePromise) => {
    execFile(
      cmd,
      args,
      { cwd: opts.cwd, env: { ...process.env, ...opts.env }, maxBuffer: 32 * 1024 * 1024, timeout: opts.timeout ?? 10 * 60 * 1000 },
      (error, stdout, stderr) => {
        resolvePromise({
          ok: !error,
          code: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
          stdout: String(stdout ?? ''),
          stderr: String(stderr ?? '') || (error && !stderr ? String(error.message) : ''),
          command: [cmd, ...args].join(' '),
        });
      },
    );
  });
}

/** 失敗したら例外にする版 */
export async function runOk(cmd, args, opts = {}) {
  const r = await run(cmd, args, opts);
  if (!r.ok) {
    const err = new Error(`${r.command} が失敗しました（終了コード ${r.code}）\n${(r.stderr || r.stdout).trim().slice(-2000)}`);
    err.result = r;
    throw err;
  }
  return r;
}
