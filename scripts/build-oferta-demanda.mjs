/**
 * Gràfic de l’esborrany sobre oferta, demanda i bombolla immobiliària.
 * node scripts/build-oferta-demanda.mjs
 * Només llegeix la instantània contrastada; no consulta xarxa ni modifica HTML.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(await readFile(path.join(root, 'assets/data/oferta-demanda/habitatges.json'), 'utf8'));
const rows = data.annual;
if (rows.length !== 14 || rows.some((r, i) => r.year !== 2000 + i || !Number.isSafeInteger(r.dwellings) || r.dwellings <= 0)) throw new Error('Sèrie anual invàlida');
const sum = rows.filter(r => r.year <= 2007).reduce((n, r) => n + r.dwellings, 0);
if (sum !== data.checks.sum_2000_2007) throw new Error('La suma 2000–2007 no coincideix');
const esc = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const fmt = n => new Intl.NumberFormat('ca-ES').format(n);
const txt = (x, y, s, size = 14, anchor = 'start', color = '#132a38', weight = 400) => `<text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="${size}" text-anchor="${anchor}" fill="${color}" font-weight="${weight}">${esc(s)}</text>`;
function figure(mobile) {
  const width = mobile ? 360 : 760, height = mobile ? 390 : 430;
  const left = mobile ? 48 : 66, right = width - 14;
  const top = 94, bottom = height - 66;
  const step = (right - left) / rows.length, barWidth = step * 0.68;
  const y = value => bottom - value / 700000 * (bottom - top);
  const title = 'Molta obra nova abans de la crisi, un fort descens després';
  const description = 'Habitatges acabats cada any a Espanya: màxim de 658.510 el 2006; 60.289 el 2013. Total del 2000 al 2007: 4.404.136. Sèrie ministerial, habitatge lliure acabat i qualificacions definitives de protegit.';
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc"><title id="title">${title}</title><desc id="desc">${description}</desc><rect width="${width}" height="${height}" fill="#f4efe5"/>`;
  s += txt(12, 25, 'Habitatges acabats · Espanya', mobile ? 15 : 18, 'start', '#132a38', 700);
  s += txt(12, 49, 'Cada any · 2000–2013', mobile ? 13 : 15, 'start', '#52636d');
  s += txt(12, 73, 'Màxim: 658.510 habitatges (2006)', mobile ? 13 : 15, 'start', '#1c6579', 700);
  for (const value of [0, 200000, 400000, 600000]) {
    s += `<line x1="${left}" y1="${y(value)}" x2="${right}" y2="${y(value)}" stroke="#d4cfc5"/>`;
    s += txt(left - 7, y(value) + 4, value ? value / 1000 + ' mil' : '0', mobile ? 10 : 13, 'end', '#52636d');
  }
  rows.forEach((r, i) => {
    const x = left + i * step + (step - barWidth) / 2;
    s += `<rect x="${x.toFixed(2)}" y="${y(r.dwellings).toFixed(2)}" width="${barWidth.toFixed(2)}" height="${(bottom-y(r.dwellings)).toFixed(2)}" fill="#1c6579"><title>${r.year}: ${fmt(r.dwellings)} habitatges</title></rect>`;
    if (!mobile || i % 2 === 0 || i === rows.length - 1) s += txt(x + barWidth / 2, bottom + 23, r.year, mobile ? 10 : 12, 'middle', '#52636d');
  });
  s += txt(12, height - 15, 'Flux anual, no estoc d’habitatges disponibles.', mobile ? 12 : 14, 'start', '#52636d');
  return s + '</svg>\n';
}
const dir = path.join(root, 'assets/charts/oferta-demanda');
await mkdir(dir, { recursive: true });
await writeFile(path.join(dir, 'habitatges-acabats.svg'), figure(false));
await writeFile(path.join(dir, 'habitatges-acabats-mobile.svg'), figure(true));
console.log('Creats 2 gràfics accessibles. Habitatges acabats 2000–2007: ' + fmt(sum));
