/** 管理ツールの設定（パス・リポジトリ・公開URL）。値はサイトの設定・GitHub Actions に合わせる。 */
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

export const MANAGER_ROOT = resolve(here, '..');
export const SITE_ROOT = resolve(MANAGER_ROOT, '..', '..');
/** 状態データ（Git 管理外）。TOAILO_MANAGER_DATA で差し替え可能（テスト用） */
export const DATA_DIR = process.env.TOAILO_MANAGER_DATA ?? join(MANAGER_ROOT, 'data');
export const GUIDES_DIR_REL = 'src/content/guides';

export const SITE_URL = process.env.SITE_URL ?? 'https://arukari-paint.github.io';
export const BASE_PATH = (process.env.BASE_PATH ?? '/toailo').replace(/\/$/, '');
export const PUBLIC_BASE = `${SITE_URL}${BASE_PATH}/`;
export const GITHUB_REPO = process.env.TOAILO_REPO ?? 'arukari-paint/toailo';
export const DEFAULT_BRANCH = 'main';
export const REMOTE = 'origin';
/** デプロイ用ワークフロー（.github/workflows/deploy.yml） */
export const DEPLOY_WORKFLOW = 'deploy.yml';

export const articleUrl = (slug) => `${PUBLIC_BASE}guides/${slug}/`;

/** 今日の日付（Mac のローカル時刻）を YYYY-MM-DD で */
export function today(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export const thisMonth = (d = new Date()) => today(d).slice(0, 7);
