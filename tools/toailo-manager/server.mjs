#!/usr/bin/env node
/**
 * TOAILO Manager の起動。127.0.0.1 の空いているポート（4870〜4899）で待ち受け、ブラウザを開く。
 * すでに起動している場合は、そのページを開くだけで終了する。
 * 停止：管理画面の「停止」ボタン、またはこのウィンドウで Ctrl + C。
 */
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { createApp } from './lib/app.mjs';
import { SITE_ROOT } from './lib/config.mjs';

const HOST = '127.0.0.1';
const PORTS = Array.from({ length: 30 }, (_, i) => 4870 + i);
const noOpen = process.argv.includes('--no-open');

async function existingManager(port) {
  try {
    const r = await fetch(`http://${HOST}:${port}/api/health`, { signal: AbortSignal.timeout(800) });
    const j = await r.json();
    return j.app === 'toailo-manager' && j.siteRoot === SITE_ROOT;
  } catch {
    return false;
  }
}

function listen(server, port) {
  return new Promise((resolve) => {
    const onError = (e) => { server.off('listening', onOk); resolve(e.code === 'EADDRINUSE' ? false : Promise.reject(e)); };
    const onOk = () => { server.off('error', onError); resolve(true); };
    server.once('error', onError);
    server.once('listening', onOk);
    server.listen(port, HOST);
  });
}

const open = (url) => { if (!noOpen) execFile('open', [url], () => {}); };

for (const port of PORTS) {
  if (await existingManager(port)) {
    const url = `http://${HOST}:${port}/`;
    console.log(`TOAILO Manager はすでに起動しています：${url}`);
    open(url);
    process.exit(0);
  }
}

const { listener } = await createApp();
const server = createServer(listener);
let bound = null;
for (const port of PORTS) {
  if (await listen(server, port)) { bound = port; break; }
}
if (!bound) {
  console.error('空いているポート（4870〜4899）が見つかりませんでした。');
  process.exit(1);
}
const url = `http://${HOST}:${bound}/`;
console.log('');
console.log('  TOAILO Manager を起動しました');
console.log(`  ${url}`);
console.log('');
console.log('  停止するには：管理画面右上の「停止」ボタン、またはこのウィンドウで Ctrl + C');
console.log('');
open(url);

const shutdown = () => {
  console.log('TOAILO Manager を停止しました。このウィンドウは閉じてかまいません。');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('toailo:shutdown', shutdown);
