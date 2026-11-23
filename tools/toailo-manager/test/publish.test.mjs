import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Store } from '../lib/store.mjs';
import { publishBatch, stampArticle, STEPS } from '../lib/publish.mjs';
import { syncWithGitHub } from '../lib/sync.mjs';
import { run as realRun } from '../lib/exec.mjs';
import { article, makeRepo, tempDir } from './helpers.mjs';

/** git は本物、astro・リンク検証・gh は偽物（GitHub には接続しない） */
function fakeRun({ failPush = false, failCheck = false, prUrl = 'https://github.com/arukari-paint/toailo/pull/7', calls = [] } = {}) {
  const state = { failPush, failCheck };
  const fn = async (cmd, args, opts) => {
    calls.push([cmd.split('/').pop(), ...args].join(' '));
    const ok = (stdout = '') => ({ ok: true, code: 0, stdout, stderr: '', command: [cmd, ...args].join(' ') });
    const ng = (stderr) => ({ ok: false, code: 1, stdout: '', stderr, command: [cmd, ...args].join(' ') });
    if (cmd.endsWith('/astro')) return args[0] === 'check' && state.failCheck ? ng('error ts(2322): 型エラー') : ok('Result (1 file): 0 errors\nComplete!');
    if (args[0] === 'scripts/check-links.mjs') return ok('OK');
    if (cmd === 'gh') {
      if (args[0] === 'auth') return ok();
      if (args[0] === 'pr' && args[1] === 'view') return ng('no pull requests found');
      if (args[0] === 'pr' && args[1] === 'create') return ok(`${prUrl}\n`);
      return ng('unexpected gh call');
    }
    if (cmd === 'git' && args[0] === 'push' && state.failPush) return ng('fatal: unable to access remote (テスト用の失敗)');
    return realRun(cmd, args, opts);
  };
  fn.state = state;
  return fn;
}

function setup(status = 'approved') {
  const repo = makeRepo();
  const store = new Store(tempDir('toailo-data-'));
  const text = article({ slug: 'new-guide', title: '新しい記事', publishedAt: '2026-11-01', updatedAt: '2026-11-01', draft: 'true' });
  store.writeArticle('new-guide', text);
  store.state.articles['new-guide'] = { slug: 'new-guide', title: '新しい記事', status, history: [] };
  store.save();
  return { repo, store };
}
const revalidate = async () => ({ ok: true, errors: [] });

test('公開日を差し替え、draft を false にする', () => {
  const out = stampArticle(article({ draft: 'true', publishedAt: '2026-01-01', updatedAt: '2026-01-02' }), '2026-12-05');
  assert.match(out, /^publishedAt: 2026-12-05$/m);
  assert.match(out, /^updatedAt: 2026-12-05$/m);
  assert.match(out, /^draft: false$/m);
  assert.match(out, /## 一つ目の見出し/);
});

test('成功：専用ブランチに記事だけをコミットして push・PR 作成。main は変わらない', async () => {
  const { repo, store } = setup();
  const calls = [];
  try {
    const b = await publishBatch({ store, siteRoot: repo.work, slugs: ['new-guide'], revalidate, run: fakeRun({ calls }), date: '2026-12-05' });
    assert.equal(b.stage, 'pr_open');
    assert.equal(b.prUrl, 'https://github.com/arukari-paint/toailo/pull/7');
    assert.equal(b.prNumber, 7);
    assert.ok(b.steps.every((s) => s.status === 'done'));
    // 元のブランチに戻っていて、作業ツリーはきれい・記事は main にない
    assert.equal(repo.git(['branch', '--show-current']), 'main');
    assert.equal(repo.git(['status', '--porcelain']), '');
    assert.equal(existsSync(join(repo.work, 'src/content/guides/new-guide.md')), false);
    // リモートのブランチには記事ファイルだけが追加されている
    const files = repo.git(['diff', '--name-only', 'origin/main', `origin/${b.branch}`]);
    assert.equal(files, 'src/content/guides/new-guide.md');
    const content = repo.git(['show', `origin/${b.branch}:src/content/guides/new-guide.md`]);
    assert.match(content, /^publishedAt: 2026-12-05$/m);
    assert.match(content, /^draft: false$/m);
    // main へは push していない
    assert.equal(repo.git(['rev-parse', 'origin/main']), repo.git(['rev-parse', 'main']));
    assert.ok(!calls.some((c) => /push .*\bmain\b/.test(c) && !c.includes('articles/')));
    assert.ok(calls.some((c) => c.startsWith('gh pr create --repo arukari-paint/toailo --base main --head articles/')));
  } finally { repo.cleanup(); }
});

test('未承認の記事は公開できない', async () => {
  const { repo, store } = setup('review');
  try {
    await assert.rejects(publishBatch({ store, siteRoot: repo.work, slugs: ['new-guide'], revalidate, run: fakeRun() }), /承認されていません/);
    assert.equal(repo.git(['branch', '--list', 'articles/*']), '');
  } finally { repo.cleanup(); }
});

test('作業ツリーに未コミットの変更があると中止する', async () => {
  const { repo, store } = setup();
  try {
    writeFileSync(join(repo.work, 'README.md'), 'changed\n');
    await assert.rejects(publishBatch({ store, siteRoot: repo.work, slugs: ['new-guide'], revalidate, run: fakeRun() }), /未コミットの変更/);
    const b = Object.values(store.state.batches)[0];
    assert.equal(b.stage, 'failed');
    assert.equal(b.steps[0].status, 'failed');
    assert.equal(repo.git(['branch', '--list', 'articles/*']), '');
  } finally { repo.cleanup(); }
});

test('型チェックの失敗：記事ファイルとブランチを片付けて main に戻る。再試行は最初から', async () => {
  const { repo, store } = setup();
  try {
    await assert.rejects(publishBatch({ store, siteRoot: repo.work, slugs: ['new-guide'], revalidate, run: fakeRun({ failCheck: true }) }), /型チェック/);
    const b = Object.values(store.state.batches)[0];
    assert.equal(b.stage, 'failed');
    assert.equal(b.failedStep, 0);
    assert.match(b.steps.find((s) => s.name === 'check').detail, /型エラー/);
    assert.equal(repo.git(['branch', '--show-current']), 'main');
    assert.equal(repo.git(['status', '--porcelain']), '');
    assert.equal(repo.git(['branch', '--list', 'articles/*']), '');
    const again = await publishBatch({ store, siteRoot: repo.work, batchId: b.id, revalidate, run: fakeRun() });
    assert.equal(again.stage, 'pr_open');
  } finally { repo.cleanup(); }
});

test('push の失敗：途中状態を記録し、再試行で push から続ける', async () => {
  const { repo, store } = setup();
  try {
    const run = fakeRun({ failPush: true });
    await assert.rejects(publishBatch({ store, siteRoot: repo.work, slugs: ['new-guide'], revalidate, run }), /pushに失敗/);
    const b = Object.values(store.state.batches)[0];
    assert.equal(b.stage, 'failed');
    assert.equal(STEPS[b.failedStep].name, 'push');
    assert.ok(b.commit, 'コミットは残っている');
    assert.equal(repo.git(['branch', '--show-current']), 'main');
    assert.match(repo.git(['branch', '--list', b.branch]), /articles\//);
    // 状態ファイルから読み直しても復元できる（異常終了の想定）
    const reloaded = new Store(store.dir);
    assert.equal(reloaded.state.batches[b.id].stage, 'failed');
    run.state.failPush = false;
    const calls = [];
    const again = await publishBatch({ store: reloaded, siteRoot: repo.work, batchId: b.id, revalidate, run: fakeRun({ calls }) });
    assert.equal(again.stage, 'pr_open');
    assert.ok(!calls.some((c) => c.startsWith('astro')), 'push から再開（ビルドはやり直さない）');
    assert.equal(repo.git(['rev-parse', `origin/${b.branch}`]), b.commit);
  } finally { repo.cleanup(); }
});

test('同期：マージとデプロイ成功を確認してから published にする', async () => {
  const { repo, store } = setup();
  try {
    const b = await publishBatch({ store, siteRoot: repo.work, slugs: ['new-guide'], revalidate, run: fakeRun(), date: '2026-12-05' });
    const ghState = { pr: 'OPEN', run: null };
    const syncRun = async (cmd, args, opts) => {
      if (cmd === 'gh' && args[1] === 'view') return { ok: true, stdout: JSON.stringify({ state: ghState.pr, mergedAt: ghState.pr === 'MERGED' ? '2026-12-05T01:00:00Z' : null, mergeCommit: ghState.pr === 'MERGED' ? { oid: ghState.merge } : null, url: b.prUrl }) };
      if (cmd === 'gh' && args[0] === 'run') return { ok: true, stdout: JSON.stringify(ghState.run ? [ghState.run] : []) };
      return realRun(cmd, args, opts);
    };
    // PR 作成直後：公開済みにはならない
    await syncWithGitHub({ store, siteRoot: repo.work, run: syncRun, fetchUrl: async () => 200 });
    assert.equal(store.state.articles['new-guide'].status, 'approved');
    assert.equal(store.state.batches[b.id].stage, 'pr_open');
    // マージ（リモートの main に取り込む）→ デプロイ実行中
    repo.git(['push', '-q', 'origin', `origin/${b.branch}:refs/heads/main`]);
    ghState.pr = 'MERGED';
    ghState.merge = repo.git(['rev-parse', `origin/${b.branch}`]);
    ghState.run = { headSha: ghState.merge, status: 'in_progress', conclusion: '', url: 'https://github.com/x/actions/runs/1' };
    await syncWithGitHub({ store, siteRoot: repo.work, run: syncRun, fetchUrl: async () => 200 });
    assert.equal(store.state.batches[b.id].stage, 'merged');
    assert.equal(store.state.articles['new-guide'].status, 'approved');
    // デプロイ成功 → published
    ghState.run = { ...ghState.run, status: 'completed', conclusion: 'success' };
    const r = await syncWithGitHub({ store, siteRoot: repo.work, run: syncRun, fetchUrl: async () => 200 });
    assert.equal(r.ok, true);
    assert.equal(store.state.batches[b.id].stage, 'deployed');
    assert.equal(store.state.articles['new-guide'].status, 'published');
    assert.equal(store.state.batches[b.id].pages['new-guide'], 200);
  } finally { repo.cleanup(); }
});

test('同期：PR がマージされずにクローズされたら承認済みに戻して再公開できる', async () => {
  const { repo, store } = setup();
  try {
    const b = await publishBatch({ store, siteRoot: repo.work, slugs: ['new-guide'], revalidate, run: fakeRun() });
    const syncRun = async (cmd, args, opts) =>
      cmd === 'gh' ? { ok: true, stdout: JSON.stringify({ state: 'CLOSED', mergedAt: null, mergeCommit: null }) } : realRun(cmd, args, opts);
    await syncWithGitHub({ store, siteRoot: repo.work, run: syncRun });
    assert.equal(store.state.batches[b.id].stage, 'closed');
    assert.equal(store.state.articles['new-guide'].status, 'approved');
    assert.equal(store.state.articles['new-guide'].batchId, undefined);
  } finally { repo.cleanup(); }
});

test('同期：GitHub に接続できないときは失敗を記録する', async () => {
  const { repo, store } = setup();
  try {
    const r = await syncWithGitHub({ store, siteRoot: repo.work, run: async () => ({ ok: false, stderr: 'Could not resolve host' }) });
    assert.equal(r.ok, false);
    assert.match(store.state.lastSync.message, /git fetch に失敗/);
  } finally { repo.cleanup(); }
});
