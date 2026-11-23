// TOAILO Manager 画面。DOM は textContent で組み立て、記事の内容を HTML として直接差し込まない。
const app = document.getElementById('app');
const STATUS = { draft: '下書き', review: '確認待ち', approved: '承認済み', published: '公開済み', rejected: '却下' };
const STAGE = { running: '処理中', failed: '失敗（再試行できます）', pr_open: 'PR作成済み・マージ待ち', merged: 'マージ済み・デプロイ確認待ち', deployed: '公開済み（デプロイ成功）', closed: 'PRクローズ（未公開）' };
const CATEGORY = { household: '家計簿', tasks: 'タスク管理', general: 'AI活用全般' };

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') throw new Error('html は使わない');
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}
const badge = (status) => h('span', { class: `badge s-${status}` }, STATUS[status] ?? status);
const fmt = (iso) => (iso ? new Date(iso).toLocaleString('ja-JP', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const fmtDay = (d) => (d ? d.replace(/^(\d+)-(\d+)-(\d+)$/, (_, y, m, dd) => `${y}年${+m}月${+dd}日`) : '—');

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: method === 'GET' ? {} : { 'Content-Type': 'application/json', 'X-TOAILO-Manager': '1' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `エラー（${res.status}）`);
  return data;
}
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2400);
}
const msgBox = (kind, title, items = []) =>
  h('div', { class: `msg msg-${kind}`, role: kind === 'error' ? 'alert' : null }, h('strong', {}, title), items.length ? h('ul', {}, items.map((i) => h('li', {}, i))) : null);
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return toast("コピーしました");
  } catch {}
  // クリップボード API が使えない環境向け（選択してコピー）
  const ta = h("textarea", { style: "position:fixed;left:-9999px", "aria-hidden": "true" });
  ta.value = text;
  document.body.append(ta);
  ta.select();
  const doc = /** @type {any} */ (document);
  const ok = doc.execCommand("copy");
  ta.remove();
  toast(ok ? "コピーしました" : "コピーできませんでした。指示文を選択してコピーしてください");
}
function page(title, lead, ...right) {
  return h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, title), lead ? h('p', { class: 'muted' }, lead) : null), right.length ? h('div', { class: 'row' }, right) : null);
}
function render(...nodes) { app.replaceChildren(...nodes.flat().filter((n) => n != null && n !== false)); app.focus({ preventScroll: true }); }
function fail(e) { render(msgBox('error', 'エラーが発生しました', [e.message])); }

// ---------- ダッシュボード ----------
async function viewDashboard() {
  const d = await api('/dashboard');
  const c = d.counts;
  const stat = (label, value, sm) => h('div', { class: 'stat' }, h('div', { class: 'label' }, label), h('div', { class: `value${sm ? ' sm' : ''}` }, value));
  const sync = d.lastSync;
  render(
    page('ダッシュボード', `${d.month.replace('-', '年')}月の状況`, h('button', { class: 'btn btn-secondary', onclick: doSync }, 'GitHubと同期')),
    !d.env.clean ? msgBox('warn', `サイトのフォルダに未コミットの変更があります（ブランチ：${d.env.branch}）。公開前にコミットまたは元に戻してください。`) : null,
    !d.env.gh ? msgBox('warn', 'GitHub CLI（gh）にログインしていません。ターミナルで「gh auth login」を実行してください。') : null,
    d.siteSource !== 'remote' ? msgBox('warn', 'GitHub の情報を読めなかったため、手元のファイルで集計しています。') : null,
    h('div', { class: 'grid stats' },
      stat('公開済み記事', c.published),
      stat('下書き', c.draft),
      stat('承認待ち（確認待ち）', c.review),
      stat('承認済み・未公開', c.approved),
      stat('今月の公開記事', `${c.publishedThisMonth} / 目標2`),
      stat('今月の作成記事', c.createdThisMonth),
      stat('最終公開日', fmtDay(d.lastPublishedAt), true),
      stat('最終記事生成（指示文作成）', fmt(d.lastPromptAt), true),
      stat('最終GitHub同期', sync ? `${sync.ok ? '成功' : '失敗'}：${fmt(sync.at)}` : '未実行', true),
    ),
    sync && !sync.ok ? msgBox('error', `前回の同期は失敗しました：${sync.message}`) : sync ? h('p', { class: 'small muted' }, `前回の同期：${sync.message}`) : null,
    h('h2', {}, '操作'),
    h('div', { class: 'grid actions' },
      action(1, '#/prompt', 'ChatGPT用指示文を作成・コピー', '今月の記事の指示文を作り、ChatGPT に貼り付けます'),
      action(2, '#/import', '記事を取り込む', 'ChatGPT が書いた Markdown を貼り付け・ファイルで取り込みます'),
      action(3, '#/articles', '下書き一覧を見る', 'プレビュー・確認・承認をします'),
      action(4, '#/published', '公開済み記事を見る', 'サイトに公開中の記事の一覧です'),
    ),
    h('div', { class: 'card', style: 'margin-top:18px' },
      h('h2', {}, '未公開の記事'),
      d.unpublished.length
        ? h('table', {}, h('tr', {}, h('th', {}, '記事'), h('th', {}, '状態')), d.unpublished.map((a) => h('tr', {}, h('td', {}, h('a', { href: `#/article/${a.slug}` }, a.title)), h('td', {}, badge(a.status), a.batchId ? h('span', { class: 'small muted' }, '　PR作成済み') : null))))
        : h('p', { class: 'muted' }, '未公開の記事はありません。'),
      h('p', { class: 'small muted' }, '月2本は目安です。品質に納得できない記事を、本数のために公開する必要はありません。'),
    ),
    h('p', { class: 'env' }, `サイト：${d.env.publicBase}　リポジトリ：${d.env.repo}　ブランチ：${d.env.branch}　Node.js ${d.env.node}`),
  );
}
const action = (no, href, title, desc) => h('a', { class: 'action', href }, h('span', { class: 'no' }, no), h('strong', {}, title), h('span', { class: 'small muted' }, desc));

async function doSync() {
  toast('GitHub と同期しています…');
  try {
    const r = await api('/sync', { method: 'POST', body: {} });
    toast(r.ok ? '同期しました' : '同期に失敗しました');
  } catch (e) { toast(e.message); }
  route();
}

// ---------- 指示文 ----------
async function viewPrompt() {
  let count = 2;
  const out = h('div');
  const select = h('select', { id: 'count', style: 'width:auto' }, [2, 3, 4, 1].map((n) => h('option', { value: n }, `${n}本${n === 2 ? '（基本）' : ''}`)));
  select.addEventListener('change', () => (count = Number(select.value)));
  const gen = async () => {
    out.replaceChildren(h('p', { class: 'muted' }, '作成中…'));
    try {
      const r = await api('/prompt', { method: 'POST', body: { count } });
      const box = h('div', { class: 'prompt-box', tabindex: '0', 'aria-label': 'ChatGPT用指示文' }, r.prompt);
      out.replaceChildren(
        h('div', { class: 'row', style: 'margin:12px 0' }, h('button', { class: 'btn btn-primary', onclick: () => copyText(r.prompt) }, '指示文をコピー'), h('span', { class: 'small muted' }, `${r.prompt.length.toLocaleString()}文字・既存記事は${r.source === 'remote' ? 'GitHub（main）' : '手元のファイル'}から読み込み`)),
        box,
        msgBox('info', '次の手順', ['ChatGPT を開き、新しいチャットに貼り付けて送信します', '出力された記事（```markdown のブロック）を、まとめてコピーします', '「記事を取り込む」に貼り付けます']),
      );
    } catch (e) { out.replaceChildren(msgBox('error', e.message)); }
  };
  render(
    page('今月の記事を作成', 'サイトのアプリ情報・既存記事・記事ガイドから、ChatGPT に渡す指示文を作ります。'),
    h('div', { class: 'card' },
      h('div', { class: 'row' }, h('label', { for: 'count' }, '作成する本数'), select, h('button', { class: 'btn btn-primary', onclick: gen }, '指示文を作成')),
      h('p', { class: 'small muted', style: 'margin-top:10px' }, '共通部分は「共通指示文」で編集できます。AI API は使わないので、ChatGPT への送信はご自身で行います。'),
      out,
    ),
  );
}

// ---------- 取り込み ----------
function viewImport() {
  const ta = h('textarea', { id: 'md', placeholder: '---\ntitle: …\nslug: …\n---\n\n本文…\n\n（複数の記事をまとめて貼り付けできます。```markdown の囲みのままでもかまいません）' });
  const file = h('input', { type: 'file', accept: '.md,.markdown,text/markdown,text/plain', multiple: true, id: 'file' });
  const replace = h('input', { type: 'checkbox', id: 'replace' });
  const out = h('div');
  file.addEventListener('change', async () => {
    const texts = await Promise.all([...file.files].map((f) => f.text()));
    ta.value = texts.join('\n\n');
    toast(`${file.files.length}件のファイルを読み込みました`);
  });
  const showResults = (results, saved) => {
    out.replaceChildren(
      ...results.map((r) =>
        h('div', { class: 'card' },
          h('h3', {}, r.title ?? '（タイトルなし）', ' ', h('span', { class: 'small muted' }, r.slug ?? '')),
          r.ok ? msgBox('ok', saved ? (r.replaced ? '原稿を置き換えて下書きに戻しました' : '下書きとして取り込みました') : '問題はありません（まだ保存していません）') : msgBox('error', `取り込めません（${r.errors.length}件のエラー）`, r.errors),
          r.warnings.length ? msgBox('warn', '確認してください', r.warnings) : null,
          saved && r.saved ? h('a', { class: 'btn btn-secondary btn-sm', href: `#/article/${r.slug}` }, 'プレビュー・確認へ') : null,
        ),
      ),
    );
  };
  const go = async (save) => {
    if (!ta.value.trim()) return toast('記事を貼り付けてください');
    try {
      const r = await api(save ? '/import' : '/import/validate', { method: 'POST', body: { text: ta.value, replace: replace.checked } });
      showResults(r.results, save);
      if (save && r.results.every((x) => x.saved)) ta.value = '';
    } catch (e) { out.replaceChildren(msgBox('error', e.message)); }
  };
  render(
    page('記事を取り込む', 'ChatGPT が作った Markdown 記事を貼り付けるか、.md ファイルを選びます。サイトと同じスキーマで検証し、問題のない記事だけを下書きとして保存します。'),
    h('div', { class: 'card' },
      h('div', { class: 'row', style: 'margin-bottom:10px' }, h('label', { for: 'file' }, '.md ファイル：'), file),
      ta,
      h('div', { class: 'row', style: 'margin-top:12px' },
        h('button', { class: 'btn btn-secondary', onclick: () => go(false) }, '検証だけする'),
        h('button', { class: 'btn btn-primary', onclick: () => go(true) }, '検証して取り込む'),
        h('label', { class: 'small', style: 'font-weight:400' }, replace, ' 同じスラッグの未公開の原稿を置き換える（承認は取り消されます）'),
      ),
    ),
    out,
  );
}

// ---------- 記事一覧 ----------
async function viewArticles(filter = 'active') {
  const { articles } = await api('/articles');
  const filters = { active: '未公開', draft: '下書き', review: '確認待ち', approved: '承認済み', published: '公開済み', rejected: '却下', all: 'すべて' };
  const shown = articles.filter((a) => (filter === 'all' ? true : filter === 'active' ? !['published', 'rejected'].includes(a.status) : a.status === filter));
  render(
    page('記事一覧', '取り込んだ記事の状態を管理します。公開前に必ずプレビューで確認し、承認してください。', h('a', { class: 'btn btn-primary', href: '#/import' }, '記事を取り込む')),
    h('div', { class: 'row', style: 'margin-bottom:12px' }, Object.entries(filters).map(([k, v]) => h('a', { href: `#/articles/${k}`, class: `btn btn-sm ${k === filter ? 'btn-primary' : 'btn-ghost'}` }, `${v}（${k === 'all' ? articles.length : k === 'active' ? articles.filter((a) => !['published', 'rejected'].includes(a.status)).length : articles.filter((a) => a.status === k).length}）`))),
    h('div', { class: 'card table-wrap' },
      shown.length
        ? h('table', {},
            h('tr', {}, h('th', {}, 'タイトル'), h('th', {}, 'カテゴリ'), h('th', {}, '状態'), h('th', {}, '検証'), h('th', {}, '更新')),
            shown.map((a) => h('tr', {},
              h('td', {}, h('a', { href: `#/article/${a.slug}` }, a.title), h('div', { class: 'small muted' }, a.slug)),
              h('td', {}, CATEGORY[a.category] ?? a.category ?? ''),
              h('td', {}, badge(a.status), a.batch ? h('div', { class: 'small muted' }, STAGE[a.batch.stage] ?? a.batch.stage) : null),
              h('td', {}, a.status === 'published' ? '—' : a.valid ? h('span', { class: 'badge s-published' }, 'OK') : h('span', { class: 'badge s-rejected' }, `エラー${a.errorCount}件`)),
              h('td', { class: 'small' }, fmt(a.updatedAt)),
            )),
          )
        : h('p', { class: 'muted' }, '該当する記事はありません。'),
    ),
  );
}

// ---------- 記事の詳細・プレビュー・承認 ----------
async function viewArticle(slug) {
  const d = await api(`/articles/${encodeURIComponent(slug)}`);
  const a = d.article;
  const { html } = await api(`/articles/${encodeURIComponent(slug)}/preview`);
  const frame = h('iframe', { class: 'preview-frame', title: '記事のプレビュー', sandbox: '', referrerpolicy: 'no-referrer' });
  frame.srcdoc = html;
  const segPc = h('button', { type: 'button', 'aria-pressed': 'true', onclick: () => setWidth(false) }, 'PC幅');
  const segSp = h('button', { type: 'button', 'aria-pressed': 'false', onclick: () => setWidth(true) }, 'スマホ幅');
  const setWidth = (mobile) => { frame.classList.toggle('mobile', mobile); segSp.setAttribute('aria-pressed', String(mobile)); segPc.setAttribute('aria-pressed', String(!mobile)); };

  const change = async (to, opts = {}) => {
    if (to === 'approved') {
      const ok = confirm(`「${a.title}」を承認しますか？\n\nプレビューで本文・事実関係・サンプルデータの表記を確認したうえで承認してください。承認した記事は「公開」画面から Pull Request にできます。`);
      if (!ok) return;
      opts.confirm = true;
    }
    if (to === 'rejected' && !confirm('この記事を却下しますか？')) return;
    try { await api(`/articles/${encodeURIComponent(slug)}/status`, { method: 'POST', body: { to, ...opts } }); toast(`「${STATUS[to]}」にしました`); viewArticle(slug); }
    catch (e) { toast(e.message); }
  };
  const del = async () => {
    if (!confirm('この記事を管理ツールから削除しますか？（元に戻せません）')) return;
    try { await api(`/articles/${encodeURIComponent(slug)}`, { method: 'DELETE' }); toast('削除しました'); location.hash = '#/articles'; }
    catch (e) { toast(e.message); }
  };
  const locked = a.batch && !['failed', 'closed'].includes(a.batch.stage);
  const buttons = {
    draft: [h('button', { class: 'btn btn-primary', onclick: () => change('review'), disabled: !d.validation.ok }, '確認待ちにする'), h('button', { class: 'btn btn-danger', onclick: () => change('rejected') }, '却下'), h('button', { class: 'btn btn-ghost', onclick: del }, '削除')],
    review: [h('button', { class: 'btn btn-primary', onclick: () => change('approved'), disabled: !d.validation.ok }, '承認する'), h('button', { class: 'btn btn-ghost', onclick: () => change('draft') }, '下書きに戻す'), h('button', { class: 'btn btn-danger', onclick: () => change('rejected') }, '却下')],
    approved: [h('a', { class: 'btn btn-primary', href: '#/publish' }, '公開へ進む'), h('button', { class: 'btn btn-ghost', onclick: () => change('review'), disabled: locked }, '承認を取り消す'), h('button', { class: 'btn btn-danger', onclick: () => change('rejected'), disabled: locked }, '却下')],
    rejected: [h('button', { class: 'btn btn-secondary', onclick: () => change('draft') }, '下書きに戻す'), h('button', { class: 'btn btn-ghost', onclick: del }, '削除')],
    published: [h('a', { class: 'btn btn-secondary', href: d.url, target: '_blank', rel: 'noopener noreferrer' }, '公開ページを開く')],
  }[a.status];

  const fm = d.data ?? {};
  render(
    page(a.title, null, badge(a.status)),
    h('div', { class: 'detail' },
      h('div', {},
        h('div', { class: 'row', style: 'justify-content:space-between;margin-bottom:10px' }, h('div', { class: 'seg', role: 'group', 'aria-label': '表示幅' }, segPc, segSp), h('span', { class: 'small muted' }, '公開サイトと同じ Markdown 変換・スタイルで表示（スクリプトは無効）')),
        h('div', { class: 'preview-frame-wrap' }, frame),
      ),
      h('div', {},
        h('div', { class: 'card' }, h('h2', {}, '操作'), h('div', { class: 'row' }, buttons), locked ? h('p', { class: 'small muted', style: 'margin-top:8px' }, `Pull Request 作成済み（${STAGE[a.batch.stage]}）`) : null),
        d.validation.ok ? msgBox('ok', '検証：問題ありません') : msgBox('error', `検証エラー（${d.validation.errors.length}件）`, d.validation.errors),
        d.validation.warnings.length ? msgBox('warn', '確認してください', d.validation.warnings) : null,
        h('div', { class: 'card' }, h('h2', {}, 'メタデータ'),
          h('dl', { class: 'meta' },
            h('dt', {}, 'slug'), h('dd', {}, fm.slug ?? ''),
            h('dt', {}, 'カテゴリ'), h('dd', {}, CATEGORY[fm.category] ?? fm.category ?? ''),
            h('dt', {}, '関連アプリ'), h('dd', {}, fm.relatedApp ?? 'なし'),
            h('dt', {}, 'description'), h('dd', {}, fm.description ?? ''),
            h('dt', {}, '公開日'), h('dd', {}, 'PR作成日に自動で設定'),
            h('dt', {}, 'FAQ'), h('dd', {}, `${Array.isArray(fm.faq) ? fm.faq.length : 0}件`),
            h('dt', {}, '公開後のURL'), h('dd', {}, d.url),
          ),
        ),
        h('div', { class: 'card' }, h('h2', {}, '履歴'), h('ul', { class: 'small', style: 'padding-left:1.2em;margin:0' }, (a.history ?? []).map((x) => h('li', {}, `${fmt(x.at)}　${x.from ? STATUS[x.from] + ' → ' : ''}${STATUS[x.to] ?? x.to}${x.note ? `（${x.note}）` : ''}`)))),
        h('details', { class: 'card' }, h('summary', {}, 'Markdown 原稿を見る'), h('pre', { class: 'prompt-box', style: 'margin-top:10px' }, d.text)),
      ),
    ),
  );
}

// ---------- 公開 ----------
let pollTimer = null;
async function viewPublish() {
  const [{ articles }, { batches, publishing }] = await Promise.all([api('/articles'), api('/batches')]);
  const ready = articles.filter((a) => a.status === 'approved' && (!a.batch || ['failed', 'closed'].includes(a.batch.stage)));
  const checks = ready.map((a) => h('input', { type: 'checkbox', value: a.slug, checked: a.valid, disabled: !a.valid, id: `p-${a.slug}` }));
  const start = async () => {
    const slugs = checks.filter((c) => c.checked).map((c) => c.value);
    if (!slugs.length) return toast('公開する記事を選んでください');
    if (!confirm(`${slugs.length}本の記事で Pull Request を作成します。\n\n型チェック・ビルド・リンク検証のあと、専用ブランチにコミットして GitHub に push します。main には直接反映されません（PR をマージすると公開されます）。`)) return;
    try { await api('/publish', { method: 'POST', body: { slugs } }); toast('公開処理を開始しました'); viewPublish(); }
    catch (e) { toast(e.message); }
  };
  const retry = async (id) => {
    try { await api(`/batches/${id}/retry`, { method: 'POST', body: {} }); toast('再試行を開始しました'); viewPublish(); }
    catch (e) { toast(e.message); }
  };
  render(
    page('公開', '承認済みの記事を Pull Request にします。PR を GitHub でマージすると、GitHub Actions がサイトに公開します。', h('button', { class: 'btn btn-secondary', onclick: doSync }, 'GitHubと同期')),
    h('div', { class: 'card' },
      h('h2', {}, '承認済みの記事'),
      ready.length
        ? h('div', {}, ready.map((a, i) => h('div', { style: 'padding:6px 0' }, h('label', { for: `p-${a.slug}`, style: 'font-weight:400' }, checks[i], ' ', a.title, a.valid ? '' : '（検証エラーがあるため選べません）'))),
            h('div', { class: 'row', style: 'margin-top:12px' }, h('button', { class: 'btn btn-primary', onclick: start, disabled: publishing }, publishing ? '処理中…' : '選んだ記事で Pull Request を作成')))
        : h('p', { class: 'muted' }, '公開できる承認済みの記事はありません。記事一覧でプレビューを確認し、承認してください。'),
    ),
    h('h2', {}, '公開の履歴'),
    batches.length ? batches.map((b) => batchCard(b, retry)) : h('p', { class: 'muted' }, 'まだありません。'),
  );
  clearTimeout(pollTimer);
  if (publishing || batches.some((b) => b.stage === 'running')) pollTimer = setTimeout(() => location.hash.startsWith('#/publish') && viewPublish(), 1500);
}
function batchCard(b, retry) {
  const icon = { done: '✓', failed: '✕', running: '…', pending: '・' };
  return h('div', { class: 'card' },
    h('div', { class: 'row', style: 'justify-content:space-between' }, h('h3', {}, `${b.publishDate}　${b.slugs.length}本`), h('span', { class: `badge ${b.stage === 'deployed' ? 's-published' : b.stage === 'failed' ? 's-rejected' : b.stage === 'closed' ? 's-draft' : 's-approved'}` }, STAGE[b.stage] ?? b.stage)),
    h('ul', { class: 'small', style: 'padding-left:1.2em' }, b.slugs.map((s) => h('li', {}, h('a', { href: `#/article/${s}` }, s), b.stage === 'deployed' ? h('span', {}, '　', h('a', { href: `https://arukari-paint.github.io/toailo/guides/${s}/`, target: '_blank', rel: 'noopener noreferrer' }, '公開ページ'), b.pages?.[s] ? `（HTTP ${b.pages[s]}）` : '') : null))),
    h('dl', { class: 'meta' },
      h('dt', {}, 'ブランチ'), h('dd', {}, b.branch),
      h('dt', {}, 'Pull Request'), h('dd', {}, b.prUrl ? h('a', { href: b.prUrl, target: '_blank', rel: 'noopener noreferrer' }, b.prUrl) : '—'),
      h('dt', {}, 'マージ'), h('dd', {}, b.mergedAt ? `済み（${fmt(b.mergedAt)}）` : b.prUrl ? (b.prState === 'CLOSED' ? 'クローズ（マージなし）' : '未マージ') : '—'),
      h('dt', {}, 'デプロイ'), h('dd', {}, b.deploy ? (b.deploy.url ? h('a', { href: b.deploy.url, target: '_blank', rel: 'noopener noreferrer' }, `${b.deploy.status}${b.deploy.conclusion ? ' / ' + b.deploy.conclusion : ''}`) : '見つかりません') : '—'),
    ),
    b.error ? msgBox('error', b.error) : null,
    b.cleanupError ? msgBox('warn', b.cleanupError) : null,
    h('details', { open: b.stage === 'running' || b.stage === 'failed' }, h('summary', { class: 'small' }, '処理の記録'),
      h('ol', { class: 'steps' }, b.steps.map((s) => h('li', { class: `st-${s.status}` }, h('span', { class: 'ic' }, icon[s.status] ?? '・'), h('div', {}, s.label, s.at ? h('span', { class: 'small muted' }, `　${fmt(s.at)}`) : null, s.detail ? h('pre', {}, s.detail) : null)))),
    ),
    b.stage === 'failed' ? h('div', { class: 'row', style: 'margin-top:10px' }, h('button', { class: 'btn btn-primary btn-sm', onclick: () => retry(b.id) }, b.failedStep >= 7 ? '再試行（push から続ける）' : '再試行（最初から）')) : null,
    b.stage === 'pr_open' ? h('p', { class: 'small muted', style: 'margin-top:8px' }, 'GitHub で PR を確認してマージしてください。マージ後に「GitHubと同期」を押すと、デプロイ結果を確認して公開済みにします。') : null,
  );
}

// ---------- 公開済み記事 ----------
async function viewPublished() {
  const r = await api('/site-articles');
  render(
    page('公開済み記事', r.source === 'remote' ? 'GitHub（main）にある記事です。' : 'GitHub を読めなかったため、手元のファイルを表示しています。'),
    h('div', { class: 'card table-wrap' },
      h('table', {}, h('tr', {}, h('th', {}, 'タイトル'), h('th', {}, 'カテゴリ'), h('th', {}, '公開日'), h('th', {}, 'URL')),
        r.guides.map((g) => h('tr', {}, h('td', {}, g.title), h('td', {}, CATEGORY[g.category] ?? g.category), h('td', { class: 'small' }, fmtDay(g.publishedAt)), h('td', { class: 'small' }, h('a', { href: g.url, target: '_blank', rel: 'noopener noreferrer' }, g.url))))),
    ),
  );
}

// ---------- 共通指示文 ----------
async function viewSettings() {
  const t = await api('/template');
  const ta = h('textarea', { style: 'min-height:520px', 'aria-label': '共通指示文' });
  ta.value = t.text;
  const save = async () => { try { await api('/template', { method: 'PUT', body: { text: ta.value } }); toast('保存しました'); } catch (e) { toast(e.message); } };
  const reset = async () => { if (!confirm('標準の指示文に戻しますか？')) return; await api('/template', { method: 'DELETE' }); toast('標準に戻しました'); viewSettings(); };
  render(
    page('共通指示文', '毎月の指示文の共通部分です。{{APPS}}・{{ARTICLES}} などの部分は、作成時にサイトの最新情報で置き換わります。'),
    h('div', { class: 'card' },
      t.custom ? msgBox('info', '編集した指示文を使っています（data/prompt-template.md）') : h('p', { class: 'small muted' }, '標準の指示文（tools/toailo-manager/prompt-template.md）を使っています。'),
      ta,
      h('div', { class: 'row', style: 'margin-top:12px' }, h('button', { class: 'btn btn-primary', onclick: save }, '保存'), t.custom ? h('button', { class: 'btn btn-ghost', onclick: reset }, '標準に戻す') : null),
      h('p', { class: 'small muted', style: 'margin-top:8px' }, '使える差し込み：{{COUNT}} {{TODAY}} {{PUBLIC_BASE}} {{APPS}} {{PAGES}} {{ARTICLES}} {{CONTENT_GUIDE}} {{FRONTMATTER}}'),
    ),
  );
}

// ---------- ルーティング ----------
async function route() {
  clearTimeout(pollTimer);
  const [, name = '', arg] = location.hash.split('/');
  const nav = { '': 'dashboard', prompt: 'prompt', import: 'import', articles: 'articles', article: 'articles', publish: 'publish', published: 'published', settings: 'settings' }[name];
  document.querySelectorAll('[data-nav]').forEach((a) => (a.dataset.nav === nav ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  try {
    if (name === '') await viewDashboard();
    else if (name === 'prompt') await viewPrompt();
    else if (name === 'import') viewImport();
    else if (name === 'articles') await viewArticles(arg || 'active');
    else if (name === 'article') await viewArticle(decodeURIComponent(arg ?? ''));
    else if (name === 'publish') await viewPublish();
    else if (name === 'published') await viewPublished();
    else if (name === 'settings') await viewSettings();
    else render(msgBox('error', 'ページが見つかりません'));
  } catch (e) { fail(e); }
}
window.addEventListener('hashchange', route);
document.getElementById('shutdown').addEventListener('click', async () => {
  if (!confirm('TOAILO Manager を停止しますか？')) return;
  try { await api('/shutdown', { method: 'POST', body: {} }); } catch {}
  document.body.replaceChildren(h('main', { class: 'container' }, h('h1', {}, '停止しました'), h('p', { class: 'muted' }, 'このタブは閉じてかまいません。もう一度使うときは「TOAILO Manager.command」をダブルクリックしてください。')));
});
route();
