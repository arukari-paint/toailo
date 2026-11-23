/**
 * TOAILO Manager の API と静的ファイル配信。127.0.0.1 でだけ待ち受ける（server.mjs）。
 *
 * 安全対策
 * - Host ヘッダーが 127.0.0.1 / localhost 以外のリクエストは拒否（DNS リバインディング対策）
 * - 変更系（POST/PUT/DELETE）は独自ヘッダー X-TOAILO-Manager と JSON を必須にする（他サイトからの送信を防ぐ）
 */
import { readFileSync, existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { Store, STATUSES } from './store.mjs';
import { loadSiteModules } from './site-loader.mjs';
import { readPublishedGuides, readSitePages } from './site.mjs';
import { splitArticles, validateArticle } from './validate.mjs';
import { buildPrompt, loadTemplate, CUSTOM_TEMPLATE_PATH } from './prompt.mjs';
import { renderPreview } from './preview.mjs';
import { publishBatch, STEPS } from './publish.mjs';
import { syncWithGitHub } from './sync.mjs';
import { run as defaultRun } from './exec.mjs';
import { MANAGER_ROOT, SITE_ROOT, SITE_URL, BASE_PATH, PUBLIC_BASE, GITHUB_REPO, today, thisMonth, articleUrl } from './config.mjs';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export async function createApp({ siteRoot = SITE_ROOT, dataDir, run = defaultRun, fetchUrl } = {}) {
  const store = new Store(dataDir);
  const siteModules = await loadSiteModules(siteRoot);
  const publicDir = join(MANAGER_ROOT, 'public');
  let publishing = null;

  // 起動時：実行中のまま止まったバッチ（異常終了）を「失敗」に戻し、再試行できるようにする
  for (const b of Object.values(store.state.batches)) {
    if (b.stage === 'running') {
      b.stage = 'failed';
      b.error = '前回の処理が途中で終了しました。再試行してください';
      const running = b.steps.findIndex((s) => s.status === 'running');
      b.failedStep = running >= 0 && running >= STEPS.findIndex((s) => s.name === 'push') ? running : 0;
    }
  }
  store.save();

  async function context(extra = {}) {
    const site = await readPublishedGuides(siteRoot);
    const managed = Object.values(store.state.articles).map((a) => ({ slug: a.slug, title: a.title, status: a.status }));
    return {
      site,
      ctx: {
        guideSchema: siteModules.guideSchema,
        categories: siteModules.GUIDE_CATEGORIES,
        siteSlugs: site.allSlugs,
        siteTitles: site.allTitles,
        managed,
        pages: readSitePages(siteRoot),
        companions: [],
        basePath: BASE_PATH,
        siteUrl: SITE_URL,
        ...extra,
      },
    };
  }

  /** 管理中の記事を検証（自分自身との重複は除く） */
  async function validateManaged(slug, text, companions = []) {
    const { ctx } = await context();
    // 公開済みになった記事は、サイト側にあるのが正しい状態
    const siteSlugs = new Set(ctx.siteSlugs);
    if (store.state.articles[slug]?.status !== 'published') siteSlugs.delete(slug);
    return validateArticle(text, { ...ctx, siteSlugs, managed: ctx.managed.filter((m) => m.slug !== slug), companions, replaceSlug: slug });
  }

  async function dashboard() {
    const { site } = await context();
    const arts = Object.values(store.state.articles);
    const month = thisMonth();
    const count = (s) => arts.filter((a) => a.status === s).length;
    const publishedDates = site.guides.map((g) => g.data.publishedAt).filter(Boolean).sort();
    const gitBranch = (await run('git', ['branch', '--show-current'], { cwd: siteRoot })).stdout.trim();
    const dirty = (await run('git', ['status', '--porcelain'], { cwd: siteRoot })).stdout.trim();
    const gh = await run('gh', ['auth', 'status'], { cwd: siteRoot });
    return {
      counts: {
        published: site.guides.length,
        draft: count('draft'),
        review: count('review'),
        approved: count('approved'),
        rejected: count('rejected'),
        publishedThisMonth: site.guides.filter((g) => String(g.data.publishedAt).startsWith(month)).length,
        createdThisMonth: arts.filter((a) => String(a.importedAt ?? '').startsWith(month)).length,
      },
      month,
      lastPublishedAt: publishedDates.at(-1) ?? null,
      lastPromptAt: store.state.lastPromptAt,
      lastSync: store.state.lastSync,
      siteSource: site.source,
      unpublished: arts
        .filter((a) => a.status !== 'published' && a.status !== 'rejected')
        .map((a) => ({ slug: a.slug, title: a.title, status: a.status, statusLabel: STATUSES[a.status], batchId: a.batchId ?? null })),
      openBatches: Object.values(store.state.batches).filter((b) => !['deployed', 'closed'].includes(b.stage)).length,
      env: { branch: gitBranch, clean: !dirty, gh: gh.ok, repo: GITHUB_REPO, publicBase: PUBLIC_BASE, node: process.version },
      publishing: !!publishing,
    };
  }

  async function importArticles(text, { save, replace }) {
    const parts = splitArticles(text);
    if (parts.length === 0) throw new HttpError(400, '記事のテキストが空です');
    if (parts.length > 10) throw new HttpError(400, '一度に取り込めるのは10本までです');
    const { ctx } = await context();
    const slugsInPaste = parts.map((p) => p.match(/^slug:\s*['"]?([^'"\n]+)/m)?.[1]?.trim()).filter(Boolean);
    const results = [];
    const seen = new Set();
    for (const part of parts) {
      const slugGuess = part.match(/^slug:\s*['"]?([^'"\n]+)/m)?.[1]?.trim();
      const canReplace = replace && slugGuess && store.state.articles[slugGuess] && store.state.articles[slugGuess].status !== 'published';
      const v = validateArticle(part, { ...ctx, companions: slugsInPaste, replaceSlug: canReplace ? slugGuess : undefined });
      if (slugGuess && seen.has(slugGuess)) v.errors.push(`同じ貼り付けの中でスラッグ「${slugGuess}」が重複しています`);
      if (slugGuess) seen.add(slugGuess);
      v.ok = v.errors.length === 0;
      const r = { slug: v.data?.slug ?? slugGuess ?? null, title: v.data?.title ?? null, ok: v.ok, errors: v.errors, warnings: v.warnings, saved: false, replaced: false };
      if (save && v.ok) {
        const now = new Date().toISOString();
        const prev = store.state.articles[r.slug];
        store.writeArticle(r.slug, part);
        store.state.articles[r.slug] = {
          slug: r.slug,
          title: r.title,
          category: v.data.category,
          relatedApp: v.data.relatedApp,
          status: 'draft',
          importedAt: prev?.importedAt ?? now,
          updatedAt: now,
          history: [...(prev?.history ?? []), { from: prev?.status ?? null, to: 'draft', at: now, by: 'import', ...(prev ? { note: '原稿を置き換え（承認は取り消し）' } : {}) }],
        };
        r.saved = true;
        r.replaced = !!prev;
        ctx.managed = [...ctx.managed.filter((m) => m.slug !== r.slug), { slug: r.slug, title: r.title, status: 'draft' }];
      }
      results.push(r);
    }
    if (save) store.save();
    return { results };
  }

  async function articleDetail(slug) {
    const a = store.state.articles[slug];
    if (!a) throw new HttpError(404, '記事が見つかりません');
    const text = store.readArticle(slug);
    const v = await validateManaged(slug, text);
    const batch = a.batchId ? store.state.batches[a.batchId] : null;
    return { article: { ...a, statusLabel: STATUSES[a.status] }, text, validation: { ok: v.ok, errors: v.errors, warnings: v.warnings }, data: v.data, url: articleUrl(slug), batch };
  }

  async function changeStatus(slug, { to, confirm, note }) {
    const a = store.state.articles[slug];
    if (!a) throw new HttpError(404, '記事が見つかりません');
    if (to === 'published') throw new HttpError(400, '公開済みにはできません（GitHub でデプロイを確認したときに自動で変わります）');
    if (to === 'approved') {
      if (confirm !== true) throw new HttpError(400, '承認には明示的な確認が必要です');
      const v = await validateManaged(slug, store.readArticle(slug));
      if (!v.ok) throw new HttpError(400, `検証エラーがあるため承認できません：${v.errors.join('／')}`);
    }
    try {
      return store.setStatus(slug, to, { note });
    } catch (e) {
      throw new HttpError(400, e.message);
    }
  }

  async function startPublish({ slugs, batchId }) {
    if (publishing) throw new HttpError(409, '別の公開処理を実行中です');
    const revalidate = async (targets, texts) => {
      const errors = [];
      for (const s of targets) {
        const v = await validateManaged(s, texts[s], targets);
        errors.push(...v.errors.map((e) => `${s}：${e}`));
      }
      return { ok: errors.length === 0, errors };
    };
    // 開始前の確認（承認済みかどうか）は publishBatch 内で同期的に行われる
    let resolveStart;
    const started = new Promise((r) => (resolveStart = r));
    const job = publishBatch({
      store, siteRoot, slugs, batchId, revalidate, run,
      onProgress: (ev) => resolveStart(ev.batchId),
    })
      .catch((e) => { resolveStart(null); return { error: e.message }; })
      .finally(() => { publishing = null; });
    publishing = job;
    const id = await Promise.race([started, job.then((r) => r?.id ?? null)]);
    if (!id) {
      const r = await job;
      throw new HttpError(400, r?.error ?? '公開を開始できませんでした');
    }
    return { batchId: id };
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://127.0.0.1');
    const host = String(req.headers.host ?? '').replace(/:\d+$/, '');
    if (!['127.0.0.1', 'localhost'].includes(host)) throw new HttpError(403, 'このツールは 127.0.0.1 からのみ使えます');

    if (!url.pathname.startsWith('/api/')) return serveStatic(url.pathname, res);

    let body = {};
    if (req.method !== 'GET') {
      if (req.headers['x-toailo-manager'] !== '1') throw new HttpError(403, '不正なリクエストです');
      if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) throw new HttpError(415, 'JSON で送信してください');
      const chunks = [];
      let size = 0;
      for await (const c of req) { size += c.length; if (size > 2 * 1024 * 1024) throw new HttpError(413, 'データが大きすぎます'); chunks.push(c); }
      body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
    }
    const m = (method, pattern) => {
      if (req.method !== method) return null;
      const mm = url.pathname.match(pattern);
      return mm ? mm.slice(1).map(decodeURIComponent) : null;
    };
    let p;
    if ((p = m('GET', /^\/api\/health$/))) return json(res, { app: 'toailo-manager', siteRoot });
    if ((p = m('GET', /^\/api\/health$/))) return json(res, { app: 'toailo-manager', siteRoot });
    if ((p = m('GET', /^\/api\/dashboard$/))) return json(res, await dashboard());
    if ((p = m('POST', /^\/api\/prompt$/))) {
      const { site } = await context();
      const pending = Object.values(store.state.articles).filter((a) => !['published', 'rejected'].includes(a.status));
      const contentGuide = readFileSync(join(siteRoot, 'docs/CONTENT_GUIDE.md'), 'utf8');
      const prompt = buildPrompt({ count: body.count, siteModules, guides: site.guides, pending, pages: readSitePages(siteRoot), contentGuide });
      store.state.lastPromptAt = new Date().toISOString();
      store.save();
      return json(res, { prompt, chars: prompt.length, source: site.source });
    }
    if ((p = m('GET', /^\/api\/template$/))) return json(res, loadTemplate());
    if ((p = m('PUT', /^\/api\/template$/))) {
      if (typeof body.text !== 'string' || body.text.trim().length < 100) throw new HttpError(400, '指示文が短すぎます');
      writeFileSync(CUSTOM_TEMPLATE_PATH, body.text);
      return json(res, { ok: true });
    }
    if ((p = m('DELETE', /^\/api\/template$/))) {
      if (existsSync(CUSTOM_TEMPLATE_PATH)) unlinkSync(CUSTOM_TEMPLATE_PATH);
      return json(res, { ok: true });
    }
    if ((p = m('POST', /^\/api\/import\/validate$/))) return json(res, await importArticles(body.text, { save: false, replace: !!body.replace }));
    if ((p = m('POST', /^\/api\/import$/))) return json(res, await importArticles(body.text, { save: true, replace: !!body.replace }));
    if ((p = m('GET', /^\/api\/articles$/))) {
      const list = [];
      for (const a of Object.values(store.state.articles)) {
        let v = { ok: false, errors: ['原稿ファイルがありません'] };
        try { v = await validateManaged(a.slug, store.readArticle(a.slug)); } catch {}
        list.push({ ...a, statusLabel: STATUSES[a.status], valid: v.ok, errorCount: v.errors.length, batch: a.batchId ? store.state.batches[a.batchId] : null });
      }
      list.sort((x, y) => String(y.updatedAt).localeCompare(String(x.updatedAt)));
      return json(res, { articles: list, statuses: STATUSES });
    }
    if ((p = m('GET', /^\/api\/articles\/([a-z0-9-]+)$/))) return json(res, await articleDetail(p[0]));
    if ((p = m('GET', /^\/api\/articles\/([a-z0-9-]+)\/preview$/))) {
      if (!store.state.articles[p[0]]) throw new HttpError(404, '記事が見つかりません');
      const { site } = await context();
      return json(res, { html: await renderPreview({ siteRoot, text: store.readArticle(p[0]), siteModules, siteGuides: site.guides.filter((g) => g.slug !== p[0]) }) });
    }
    if ((p = m('POST', /^\/api\/preview$/))) {
      const { site } = await context();
      return json(res, { html: await renderPreview({ siteRoot, text: String(body.text ?? ''), siteModules, siteGuides: site.guides }) });
    }
    if ((p = m('POST', /^\/api\/articles\/([a-z0-9-]+)\/status$/))) return json(res, { article: await changeStatus(p[0], body) });
    if ((p = m('DELETE', /^\/api\/articles\/([a-z0-9-]+)$/))) {
      const a = store.state.articles[p[0]];
      if (!a) throw new HttpError(404, '記事が見つかりません');
      if (!['draft', 'rejected'].includes(a.status)) throw new HttpError(400, '削除できるのは下書き・却下の記事だけです');
      store.deleteArticle(p[0]);
      store.save();
      return json(res, { ok: true });
    }
    if ((p = m('GET', /^\/api\/site-articles$/))) {
      const { site } = await context();
      return json(res, { source: site.source, guides: site.guides.map((g) => ({ slug: g.slug, title: g.data.title, category: g.data.category, publishedAt: g.data.publishedAt, updatedAt: g.data.updatedAt, url: g.url })) });
    }
    if ((p = m('GET', /^\/api\/batches$/))) return json(res, { batches: Object.values(store.state.batches).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), publishing: !!publishing, articles: store.state.articles });
    if ((p = m('POST', /^\/api\/publish$/))) return json(res, await startPublish({ slugs: body.slugs }));
    if ((p = m('POST', /^\/api\/batches\/([\w-]+)\/retry$/))) return json(res, await startPublish({ batchId: p[0] }));
    if ((p = m('POST', /^\/api\/sync$/))) {
      if (publishing) throw new HttpError(409, '公開処理の実行中は同期できません');
      return json(res, await syncWithGitHub({ store, siteRoot, run, ...(fetchUrl ? { fetchUrl } : {}) }));
    }
    if ((p = m('POST', /^\/api\/shutdown$/))) {
      json(res, { ok: true });
      setTimeout(() => process.emit('toailo:shutdown'), 100);
      return;
    }
    throw new HttpError(404, '見つかりません');
  }

  function serveStatic(pathname, res) {
    const rel = normalize(pathname === '/' ? '/index.html' : pathname).replace(/^(\.\.[/\\])+/, '');
    const file = join(publicDir, rel);
    if (!file.startsWith(publicDir) || !existsSync(file)) throw new HttpError(404, '見つかりません');
    res.writeHead(200, {
      'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; frame-src 'self' about:; img-src 'self' data:; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'",
    });
    res.end(readFileSync(file));
  }

  const listener = async (req, res) => {
    try {
      await handle(req, res);
    } catch (e) {
      const status = e instanceof HttpError ? e.status : e instanceof SyntaxError ? 400 : 500;
      if (status === 500) console.error(e);
      if (!res.headersSent) json(res, { error: e.message }, status);
    }
  };
  return { listener, store, siteModules };
}

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(data));
}

export { today };
