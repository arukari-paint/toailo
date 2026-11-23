/**
 * 「公開」＝ 承認済み記事を専用ブランチにコミットし、Pull Request を作るまで。
 * main へ直接 push はしない。PR を人がマージした時点で、既存の GitHub Actions（deploy.yml）が公開する。
 *
 * 手順（各ステップの結果をバッチに記録し、失敗したら途中から再試行できる）
 *   preflight → branch → write → check → build → links → commit → push → pr
 * 失敗時：コミット前なら書き出した記事ファイルとブランチを片付けて元のブランチに戻る。
 *         コミット後（push / PR で失敗）ならブランチを残し、再試行で push から続ける。
 */
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { run as defaultRun } from './exec.mjs';
import { GUIDES_DIR_REL, REMOTE, DEFAULT_BRANCH, GITHUB_REPO, articleUrl, today } from './config.mjs';

export const STEPS = [
  { name: 'preflight', label: 'Git の作業ツリーと GitHub の確認' },
  { name: 'branch', label: '専用ブランチの作成' },
  { name: 'write', label: '記事ファイルの追加' },
  { name: 'check', label: 'Astro の型チェック' },
  { name: 'build', label: 'サイトのビルド' },
  { name: 'links', label: '内部リンクの検証' },
  { name: 'commit', label: '記事ファイルだけをコミット' },
  { name: 'push', label: 'GitHub へ push' },
  { name: 'pr', label: 'Pull Request の作成' },
];
const COMMITTED_FROM = STEPS.findIndex((s) => s.name === 'push');

/** frontmatter の公開日・更新日を公開日に、draft を false にする（本文は変えない） */
export function stampArticle(text, date) {
  const m = text.match(/^(---\n)([\s\S]*?)(\n---)/);
  if (!m) return text;
  let fm = m[2];
  const setKey = (key, value) => {
    const re = new RegExp(`^${key}:.*$`, 'm');
    fm = re.test(fm) ? fm.replace(re, `${key}: ${value}`) : `${fm}\n${key}: ${value}`;
  };
  setKey('publishedAt', date);
  setKey('updatedAt', date);
  setKey('draft', 'false');
  return m[1] + fm + m[3] + text.slice(m[0].length);
}

function prBody(articles, date) {
  return [
    'TOAILO Manager から作成した記事追加の Pull Request です。',
    '',
    '## 追加する記事',
    ...articles.map((a) => `- **${a.title}**\n  - ファイル：\`${GUIDES_DIR_REL}/${a.slug}.md\`\n  - 公開後のURL：${articleUrl(a.slug)}`),
    '',
    '## 確認したこと（TOAILO Manager）',
    '- 記事のメタデータ（src/content.config.ts のスキーマ）・重複・危険なHTML・内部リンクの検証',
    '- 管理画面での人による承認',
    '- `astro check`・`astro build`・`scripts/check-links.mjs`',
    `- 公開日（publishedAt / updatedAt）：${date}`,
    '',
    '## マージ前に',
    '- [ ] 本文の事実関係（アプリの機能・料金・外部情報の出典）を確認した',
    '- [ ] サンプルデータが架空であることが明記されている',
    '',
    'マージすると GitHub Actions（deploy.yml）でサイトに公開されます。',
  ].join('\n');
}

/**
 * @param {object} p
 * @param {import('./store.mjs').Store} p.store
 * @param {string} p.siteRoot
 * @param {string[]} p.slugs 公開する記事（承認済み）
 * @param {string} [p.batchId] 再試行するバッチ
 * @param {(slugs:string[], texts:Record<string,string>) => Promise<{ok:boolean, errors:string[]}>} p.revalidate 公開直前の再検証
 * @param {Function} [p.run] コマンド実行（テストで差し替え）
 * @param {(event:object) => void} [p.onProgress]
 */
export async function publishBatch({ store, siteRoot, slugs, batchId, revalidate, run = defaultRun, onProgress = () => {}, date = today() }) {
  const st = store.state;
  let batch = batchId ? st.batches[batchId] : null;
  if (batchId && !batch) throw new Error('再試行するバッチが見つかりません');
  if (batch && batch.stage !== 'failed') throw new Error('このバッチは再試行できる状態ではありません');
  const targetSlugs = batch ? batch.slugs : slugs;
  if (!targetSlugs?.length) throw new Error('公開する記事を選んでください');
  for (const s of targetSlugs) {
    const a = st.articles[s];
    if (!a) throw new Error(`記事「${s}」が見つかりません`);
    if (a.status !== 'approved') throw new Error(`「${a.title}」は承認されていません（人による承認が必要です）`);
    if (a.batchId && a.batchId !== batch?.id && st.batches[a.batchId]?.stage !== 'failed' && st.batches[a.batchId]?.stage !== 'closed') {
      throw new Error(`「${a.title}」はすでに Pull Request を作成済みです`);
    }
  }

  if (!batch) {
    const id = `${date}-${Math.random().toString(36).slice(2, 7)}`;
    batch = {
      id,
      slugs: targetSlugs,
      branch: `articles/${id}`,
      createdAt: new Date().toISOString(),
      publishDate: date,
      stage: 'running',
      steps: STEPS.map((s) => ({ name: s.name, label: s.label, status: 'pending' })),
    };
    st.batches[id] = batch;
  }
  batch.stage = 'running';
  batch.error = null;
  for (const s of targetSlugs) st.articles[s].batchId = batch.id;
  store.save();

  const git = (args) => run('git', args, { cwd: siteRoot });
  const files = targetSlugs.map((s) => `${GUIDES_DIR_REL}/${s}.md`);
  const startIndex = batch.failedStep != null && batch.failedStep >= COMMITTED_FROM ? batch.failedStep : 0;
  let originalBranch = null;
  let current = null;
  const written = [];

  const mark = (name, status, detail) => {
    const step = batch.steps.find((s) => s.name === name);
    Object.assign(step, { status, at: new Date().toISOString(), detail: detail ? String(detail).slice(-4000) : undefined });
    store.save();
    onProgress({ batchId: batch.id, step: name, status, detail });
  };
  const must = async (r, what) => {
    if (!r.ok) throw Object.assign(new Error(`${what}に失敗しました`), { detail: `${r.command}\n${(r.stderr || r.stdout).trim()}` });
    return r;
  };

  try {
    for (let i = startIndex; i < STEPS.length; i++) {
      current = STEPS[i].name;
      mark(current, 'running');
      let detail = '';
      switch (current) {
        case 'preflight': {
          await must(await git(['rev-parse', '--is-inside-work-tree']), 'Git リポジトリの確認');
          originalBranch = (await must(await git(['branch', '--show-current']), '現在のブランチの確認')).stdout.trim();
          const status = await must(await git(['status', '--porcelain']), '作業ツリーの確認');
          if (status.stdout.trim()) {
            throw Object.assign(new Error('サイトのフォルダに未コミットの変更があります。コミットするか元に戻してから公開してください'), { detail: status.stdout });
          }
          await must(await run('gh', ['auth', 'status'], { cwd: siteRoot }), 'GitHub CLI（gh）のログイン確認');
          await must(await git(['fetch', REMOTE, DEFAULT_BRANCH]), 'GitHub からの取得（git fetch）');
          detail = `現在のブランチ：${originalBranch || '(detached)'}`;
          break;
        }
        case 'branch': {
          const exists = (await git(['rev-parse', '--verify', '--quiet', `refs/heads/${batch.branch}`])).ok;
          await must(await git(exists ? ['switch', batch.branch] : ['switch', '-c', batch.branch, `${REMOTE}/${DEFAULT_BRANCH}`]), 'ブランチの作成');
          detail = batch.branch;
          break;
        }
        case 'write': {
          const texts = {};
          for (const s of targetSlugs) texts[s] = stampArticle(store.readArticle(s), batch.publishDate);
          const v = await revalidate(targetSlugs, texts);
          if (!v.ok) throw Object.assign(new Error('公開直前の検証でエラーがありました'), { detail: v.errors.join('\n') });
          for (const s of targetSlugs) {
            const p = join(siteRoot, GUIDES_DIR_REL, `${s}.md`);
            if (existsSync(p) && readFileSync(p, 'utf8') !== texts[s]) {
              throw new Error(`サイトに同じファイル（${s}.md）がすでにあります。上書きはしません`);
            }
            writeFileSync(p, texts[s]);
            written.push(p);
          }
          detail = files.join('\n');
          break;
        }
        case 'check':
          detail = (await must(await run(join(siteRoot, 'node_modules/.bin/astro'), ['check'], { cwd: siteRoot }), 'Astro の型チェック')).stdout.split('\n').filter((l) => /Result|error|warning/.test(l)).join('\n');
          break;
        case 'build':
          detail = (await must(await run(join(siteRoot, 'node_modules/.bin/astro'), ['build'], { cwd: siteRoot }), 'サイトのビルド')).stdout.split('\n').filter((l) => /page\(s\) built|Complete/.test(l)).join('\n');
          break;
        case 'links':
          detail = (await must(await run(process.execPath, ['scripts/check-links.mjs'], { cwd: siteRoot }), '内部リンクの検証')).stdout.trim();
          break;
        case 'commit': {
          await must(await git(['add', '--', ...files]), '記事ファイルのステージ');
          const staged = (await must(await git(['diff', '--cached', '--name-only']), 'ステージ内容の確認')).stdout.split('\n').filter(Boolean);
          const unexpected = staged.filter((f) => !files.includes(f));
          if (unexpected.length) throw Object.assign(new Error('記事以外のファイルがステージされています'), { detail: unexpected.join('\n') });
          if (staged.length === 0) throw new Error('コミットする記事ファイルがありません');
          const titles = targetSlugs.map((s) => st.articles[s].title);
          await must(await git(['commit', '-m', `Add ${targetSlugs.length} guide article(s)\n\n${titles.map((t) => `- ${t}`).join('\n')}`, '--', ...files]), 'コミット');
          batch.commit = (await git(['rev-parse', 'HEAD'])).stdout.trim();
          detail = batch.commit;
          break;
        }
        case 'push':
          if (!originalBranch) originalBranch = (await git(['branch', '--show-current'])).stdout.trim();
          await must(await git(['push', '-u', REMOTE, `${batch.branch}:${batch.branch}`]), 'GitHub への push');
          detail = `${REMOTE}/${batch.branch}`;
          break;
        case 'pr': {
          const existing = await run('gh', ['pr', 'view', batch.branch, '--repo', GITHUB_REPO, '--json', 'url,number,state'], { cwd: siteRoot });
          let url;
          if (existing.ok && JSON.parse(existing.stdout).state === 'OPEN') {
            url = JSON.parse(existing.stdout).url;
          } else {
            const arts = targetSlugs.map((s) => st.articles[s]);
            const title = arts.length === 1 ? `記事追加：${arts[0].title}` : `記事追加：${arts.length}本（${batch.publishDate}）`;
            const r = await must(
              await run('gh', ['pr', 'create', '--repo', GITHUB_REPO, '--base', DEFAULT_BRANCH, '--head', batch.branch, '--title', title, '--body', prBody(arts, batch.publishDate)], { cwd: siteRoot }),
              'Pull Request の作成',
            );
            url = r.stdout.trim().split('\n').pop();
          }
          batch.prUrl = url;
          batch.prNumber = Number(url.match(/\/pull\/(\d+)/)?.[1]) || null;
          detail = url;
          break;
        }
      }
      mark(current, 'done', detail);
    }
    batch.stage = 'pr_open';
    batch.failedStep = null;
    batch.prState = 'OPEN';
    store.save();
    return batch;
  } catch (e) {
    const idx = STEPS.findIndex((s) => s.name === current);
    batch.stage = 'failed';
    batch.failedStep = idx;
    batch.error = e.message;
    mark(current, 'failed', e.detail ?? e.message);
    // コミット前の失敗：書き出したファイルとブランチを片付ける（再試行は最初から）
    if (idx < COMMITTED_FROM) {
      if (written.length) await git(['reset', '-q', '--', ...files]);
      for (const p of written) if (existsSync(p)) unlinkSync(p);
      batch.failedStep = 0;
      batch.commit = null;
    }
    throw e;
  } finally {
    // 元のブランチに戻る（記事ファイルはブランチ側のコミットにだけ残る）
    if (originalBranch) {
      const now = (await git(['branch', '--show-current'])).stdout.trim();
      if (now !== originalBranch) {
        const back = await git(['switch', originalBranch]);
        if (!back.ok) {
          batch.cleanupError = `元のブランチ（${originalBranch}）に戻れませんでした：${back.stderr.trim()}`;
        }
      }
      if (batch.stage === 'failed' && batch.failedStep === 0) {
        await git(['branch', '-D', batch.branch]);
      }
      store.save();
    }
  }
}
