/**
 * ファビコン・アイコン・OG画像を生成する（public/ に出力）。ロゴは TOAILO Design System の暫定シンボルと同じ形。
 * 実行：node scripts/make-brand-images.mjs（日本語の描画に macOS のヒラギノを使うため、手元の Mac で実行して結果をコミットする）
 */
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const ACCENT = '#42C7C7';
const TEXT = '#171A1A';
const symbol = (color) => `
  <g opacity="0.38"><polygon points="0,97 102,55 102,115 0,140" fill="${color}" stroke="${color}" stroke-width="18" stroke-linejoin="round"/></g>
  <g opacity="0.5"><polygon points="27,50 142,0 142,120 27,165" fill="${color}" stroke="${color}" stroke-width="18" stroke-linejoin="round"/></g>
  <g opacity="0.6"><polygon points="62,80 180,30 180,145 62,195" fill="${color}" stroke="${color}" stroke-width="18" stroke-linejoin="round"/></g>
  <circle cx="212" cy="100" r="17" fill="${color}"/>`;

// favicon（正方形・余白つき）
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-30 -47 289 289">${symbol(ACCENT)}</svg>`;
writeFileSync('public/favicon.svg', favicon);

const iconOnWhite = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="-40 -57 309 309"><rect x="-40" y="-57" width="309" height="309" fill="#ffffff"/>${symbol(ACCENT)}</svg>`;
await sharp(Buffer.from(iconOnWhite(32))).png().toFile('public/favicon-32.png');
await sharp(Buffer.from(iconOnWhite(180))).png().toFile('public/apple-touch-icon.png');
await sharp(Buffer.from(iconOnWhite(512))).png().toFile('public/icon-512.png');

// OG画像 1200x630
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs><radialGradient id="g" cx="0.85" cy="0" r="0.9"><stop offset="0" stop-color="#E5F8F7"/><stop offset="1" stop-color="#ffffff"/></radialGradient></defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <g transform="translate(96 92) scale(0.42)">${symbol(ACCENT)}</g>
  <text x="210" y="140" font-family="Helvetica Neue, Arial" font-size="40" font-weight="500" letter-spacing="6" fill="${TEXT}">TOAILO</text>
  <text x="96" y="330" font-family="Hiragino Sans, Hiragino Kaku Gothic ProN" font-weight="700" font-size="72" fill="${TEXT}">記録する。持ち出す。</text>
  <text x="96" y="428" font-family="Hiragino Sans, Hiragino Kaku Gothic ProN" font-weight="700" font-size="72" fill="#15777A">AIで活かす。</text>
  <text x="96" y="530" font-family="Hiragino Sans, Hiragino Kaku Gothic ProN" font-weight="400" font-size="30" fill="#4F5757">家計簿・ToDoリストの記録を、好きなAIへ。</text>
  <rect x="0" y="618" width="1200" height="12" fill="${ACCENT}"/>
</svg>`;
await sharp(Buffer.from(og)).png().toFile('public/og-default.png');
console.log('done');
