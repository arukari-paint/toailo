/**
 * 状態データの保存（data/ 配下・Git 管理外）。
 * - state.json：記事の状態・公開バッチ・同期結果
 * - articles/<slug>.md：取り込んだ記事の原稿（公開時に src/content/guides/ にコピーする）
 * 書き込みは一時ファイル → rename で行い、異常終了しても壊れたファイルを残さない。
 */
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, readdirSync, unlinkSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR } from './config.mjs';

export const STATUSES = {
  draft: '下書き',
  review: '確認待ち',
  approved: '承認済み',
  published: '公開済み',
  rejected: '却下',
};

/** 人が操作できる状態の移り変わり（published は同期処理だけが付ける） */
export const TRANSITIONS = {
  draft: ['review', 'rejected'],
  review: ['approved', 'draft', 'rejected'],
  approved: ['review', 'draft', 'rejected'],
  rejected: ['draft'],
  published: [],
};

const empty = () => ({ version: 1, articles: {}, batches: {}, lastPromptAt: null, lastSync: null });

export class Store {
  constructor(dir = DATA_DIR) {
    this.dir = dir;
    this.articlesDir = join(dir, 'articles');
    this.file = join(dir, 'state.json');
    mkdirSync(this.articlesDir, { recursive: true });
    this.state = this.#load();
  }

  #load() {
    if (!existsSync(this.file)) return empty();
    try {
      return { ...empty(), ...JSON.parse(readFileSync(this.file, 'utf8')) };
    } catch {
      // 壊れていた場合は退避して空から始める（原稿ファイルから復元する）
      const bad = `${this.file}.broken-${Date.now()}`;
      copyFileSync(this.file, bad);
      const state = empty();
      for (const f of readdirSync(this.articlesDir).filter((n) => n.endsWith('.md'))) {
        const slug = f.replace(/\.md$/, '');
        state.articles[slug] = { slug, title: slug, status: 'draft', importedAt: null, updatedAt: null, history: [], recovered: true };
      }
      return state;
    }
  }

  save() {
    atomicWrite(this.file, JSON.stringify(this.state, null, 2));
  }

  readArticle(slug) {
    return readFileSync(join(this.articlesDir, `${slug}.md`), 'utf8');
  }
  writeArticle(slug, text) {
    atomicWrite(join(this.articlesDir, `${slug}.md`), text);
  }
  deleteArticle(slug) {
    const p = join(this.articlesDir, `${slug}.md`);
    if (existsSync(p)) unlinkSync(p);
    delete this.state.articles[slug];
  }

  /** 状態を変える。許可されていない移り変わりは例外 */
  setStatus(slug, to, { by = 'user', note } = {}) {
    const a = this.state.articles[slug];
    if (!a) throw new Error(`記事「${slug}」が見つかりません`);
    if (to !== 'published' && !TRANSITIONS[a.status]?.includes(to)) {
      throw new Error(`「${STATUSES[a.status]}」から「${STATUSES[to] ?? to}」には変更できません`);
    }
    if (a.batchId && to !== 'published' && this.state.batches[a.batchId]?.stage !== 'failed') {
      throw new Error('Pull Request を作成済みの記事は状態を変更できません（PR をクローズしてから同期してください）');
    }
    const at = new Date().toISOString();
    a.history = [...(a.history ?? []), { from: a.status, to, at, by, ...(note ? { note } : {}) }];
    a.status = to;
    a.updatedAt = at;
    if (to === 'approved') a.approvedAt = at;
    this.save();
    return a;
  }
}

export function atomicWrite(file, text) {
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, text);
  renameSync(tmp, file);
}
