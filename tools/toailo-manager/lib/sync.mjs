/**
 * GitHub との同期：PR の状態 → マージ → デプロイ（GitHub Actions）の結果を確認し、
 * デプロイが成功して記事が main に入ったことを確認できた記事だけを published にする。
 * PR 作成（pr_open）とサイト公開（deployed）は別の段階として記録する。
 */
import { run as defaultRun } from './exec.mjs';
import { GITHUB_REPO, REMOTE, DEFAULT_BRANCH, DEPLOY_WORKFLOW, articleUrl } from './config.mjs';
import { readRemoteGuides } from './site.mjs';

export async function syncWithGitHub({ store, siteRoot, run = defaultRun, fetchUrl = defaultFetchStatus }) {
  const st = store.state;
  const notes = [];
  const at = new Date().toISOString();
  try {
    const f = await run('git', ['fetch', REMOTE, DEFAULT_BRANCH], { cwd: siteRoot });
    if (!f.ok) throw new Error(`git fetch に失敗しました：${(f.stderr || '').trim().split('\n').pop()}`);

    const remoteGuides = (await readRemoteGuides(siteRoot)) ?? [];
    const onMain = new Set(remoteGuides.filter((g) => g.data.draft !== true).map((g) => g.slug));

    let runs = null;
    const loadRuns = async () => {
      if (runs) return runs;
      const r = await run('gh', ['run', 'list', '--repo', GITHUB_REPO, '--workflow', DEPLOY_WORKFLOW, '--branch', DEFAULT_BRANCH, '--event', 'push', '--limit', '30', '--json', 'databaseId,headSha,status,conclusion,url,createdAt'], { cwd: siteRoot });
      if (!r.ok) throw new Error(`GitHub Actions の結果を取得できませんでした：${(r.stderr || '').trim().split('\n').pop()}`);
      runs = JSON.parse(r.stdout);
      return runs;
    };

    for (const batch of Object.values(st.batches)) {
      if (!batch.prUrl || ['deployed', 'closed'].includes(batch.stage)) continue;
      const pr = await run('gh', ['pr', 'view', String(batch.prNumber ?? batch.prUrl), '--repo', GITHUB_REPO, '--json', 'state,mergedAt,mergeCommit,url'], { cwd: siteRoot });
      if (!pr.ok) { notes.push(`PR #${batch.prNumber} の状態を取得できませんでした`); continue; }
      const info = JSON.parse(pr.stdout);
      batch.prState = info.state;
      if (info.state === 'CLOSED') {
        batch.stage = 'closed';
        for (const s of batch.slugs) if (st.articles[s]?.batchId === batch.id) delete st.articles[s].batchId;
        notes.push(`PR #${batch.prNumber} はマージされずにクローズされました（記事は承認済みのまま）`);
        continue;
      }
      if (info.state !== 'MERGED') continue;
      batch.stage = batch.stage === 'pr_open' ? 'merged' : batch.stage;
      batch.mergedAt = info.mergedAt;
      batch.mergeCommit = info.mergeCommit?.oid ?? null;

      // マージコミットを含む main へのデプロイを探す
      const list = await loadRuns();
      let found = null;
      for (const r of list) {
        const contains = r.headSha === batch.mergeCommit || (batch.mergeCommit && (await run('git', ['merge-base', '--is-ancestor', batch.mergeCommit, r.headSha], { cwd: siteRoot })).ok);
        if (!contains) continue;
        if (r.status === 'completed' && r.conclusion === 'success') { found = r; break; }
        if (!found) found = r; // 進行中・失敗（成功が見つからなければ最新のものを表示）
      }
      batch.deploy = found ? { status: found.status, conclusion: found.conclusion, url: found.url, checkedAt: at } : { status: 'not_found', checkedAt: at };
      if (found?.status === 'completed' && found.conclusion === 'success') {
        const missing = batch.slugs.filter((s) => !onMain.has(s));
        if (missing.length) { notes.push(`デプロイは成功しましたが main に記事が見つかりません：${missing.join(', ')}`); continue; }
        batch.stage = 'deployed';
        batch.pages = {};
        for (const s of batch.slugs) {
          batch.pages[s] = await fetchUrl(articleUrl(s));
          const a = st.articles[s];
          if (a && a.status !== 'published') {
            a.history = [...(a.history ?? []), { from: a.status, to: 'published', at, by: 'sync' }];
            a.status = 'published';
            a.publishedAt = batch.publishDate;
            a.updatedAt = at;
          }
        }
        notes.push(`PR #${batch.prNumber} の記事を公開済みにしました`);
      } else if (found?.conclusion === 'failure') {
        notes.push(`PR #${batch.prNumber} のデプロイが失敗しています`);
      }
    }
    st.lastSync = { at, ok: true, message: notes.join('／') || '変更はありません' };
  } catch (e) {
    st.lastSync = { at, ok: false, message: e.message };
  }
  store.save();
  return st.lastSync;
}

async function defaultFetchStatus(url) {
  try {
    const r = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    return r.status;
  } catch {
    return null;
  }
}
