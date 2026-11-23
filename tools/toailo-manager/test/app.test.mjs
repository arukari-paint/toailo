import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { createApp } from '../lib/app.mjs';
import { article, tempDir } from './helpers.mjs';

let server, port;
const noNetworkRun = async (cmd, args, opts) => {
  // 公開系の操作が実際に GitHub へ行かないように、push と gh は失敗させる
  if (cmd === 'gh' || (cmd === 'git' && ['push', 'fetch'].includes(args[0]))) return { ok: false, code: 1, stdout: '', stderr: 'テストでは外部に接続しません', command: cmd };
  const { run } = await import('../lib/exec.mjs');
  return run(cmd, args, opts);
};
before(async () => {
  const { listener } = await createApp({ dataDir: tempDir('toailo-app-'), run: noNetworkRun });
  server = createServer(listener).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  port = server.address().port;
});
after(() => server.close());

function call(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = request({ host: '127.0.0.1', port, method, path, headers: { ...(data ? { 'content-type': 'application/json', 'x-toailo-manager': '1' } : {}), ...headers } }, (res) => {
      let s = '';
      res.on('data', (c) => (s += c));
      res.on('end', () => resolve({ status: res.statusCode, body: s.startsWith('{') ? JSON.parse(s) : s, headers: res.headers }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

test('管理画面が開ける（127.0.0.1）', async () => {
  const r = await call('GET', '/');
  assert.equal(r.status, 200);
  assert.match(r.body, /TOAILO <b>Manager<\/b>/);
  assert.match(r.headers['content-security-policy'], /frame-ancestors 'none'/);
});

test('127.0.0.1 / localhost 以外の Host は拒否', async () => {
  assert.equal((await call('GET', '/api/dashboard', null, { host: 'evil.example.com' })).status, 403);
});

test('変更系は専用ヘッダーと JSON が必須', async () => {
  const r = await call('POST', '/api/import', null, { 'content-type': 'application/json' });
  assert.equal(r.status, 403);
});

test('ダッシュボード', async () => {
  const r = await call('GET', '/api/dashboard');
  assert.equal(r.status, 200);
  assert.ok(r.body.counts.published >= 3);
  assert.equal(typeof r.body.counts.publishedThisMonth, 'number');
});

test('指示文の生成', async () => {
  const r = await call('POST', '/api/prompt', { count: 2 });
  assert.equal(r.status, 200);
  assert.match(r.body.prompt, /\*\*2本\*\*/);
  assert.ok((await call('GET', '/api/dashboard')).body.lastPromptAt);
});

test('取り込み → 重複拒否 → プレビュー → 状態変更（承認には確認が必要）→ 公開の前提チェック', async () => {
  const text = article({ slug: 'app-test-article', title: 'アプリのテスト記事' });
  let r = await call('POST', '/api/import', { text });
  assert.equal(r.body.results[0].saved, true, JSON.stringify(r.body));
  r = await call('POST', '/api/import', { text });
  assert.equal(r.body.results[0].saved, false);
  assert.match(r.body.results[0].errors.join(), /すでに取り込み済み/);
  r = await call('POST', '/api/import', { text: article({ slug: 'Bad Slug' }) });
  assert.equal(r.body.results[0].saved, false);

  r = await call('GET', '/api/articles/app-test-article/preview');
  assert.equal(r.status, 200);
  assert.match(r.body.html, /アプリのテスト記事/);

  // 下書き → 承認は不可（確認待ちを経由）
  r = await call('POST', '/api/articles/app-test-article/status', { to: 'approved', confirm: true });
  assert.equal(r.status, 400);
  r = await call('POST', '/api/articles/app-test-article/status', { to: 'review' });
  assert.equal(r.status, 200);
  r = await call('POST', '/api/articles/app-test-article/status', { to: 'approved' });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /明示的な確認/);
  r = await call('POST', '/api/articles/app-test-article/status', { to: 'published' });
  assert.equal(r.status, 400);
  r = await call('POST', '/api/articles/app-test-article/status', { to: 'approved', confirm: true });
  assert.equal(r.status, 200);
  assert.equal(r.body.article.status, 'approved');

  // 公開：gh も push も使えない環境では preflight で止まり、記録が残る
  r = await call('POST', '/api/publish', { slugs: ['app-test-article'] });
  assert.equal(r.status, 200);
  let batches;
  for (let i = 0; i < 50; i++) {
    batches = (await call('GET', '/api/batches')).body;
    if (!batches.publishing) break;
    await new Promise((res) => setTimeout(res, 100));
  }
  const b = batches.batches[0];
  assert.equal(b.stage, 'failed');
  assert.equal(b.steps[0].status, 'failed');
});

test('未承認の記事の公開は拒否', async () => {
  await call('POST', '/api/import', { text: article({ slug: 'not-approved-one', title: '未承認の記事' }) });
  const r = await call('POST', '/api/publish', { slugs: ['not-approved-one'] });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /承認されていません/);
});
