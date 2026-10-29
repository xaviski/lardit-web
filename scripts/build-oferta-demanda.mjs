/**
 * Gràfics de l’esborrany sobre oferta, demanda i bombolla immobiliària.
 * node scripts/build-oferta-demanda.mjs
 * Només llegeix la instantània contrastada; no consulta xarxa ni modifica HTML.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(await readFile(path.join(root, 'assets/data/oferta-demanda/habitatges.json'), 'utf8'));
const prices = JSON.parse(await readFile(path.join(root, 'assets/data/oferta-demanda/preus-habitatge.json'), 'utf8'));
const priceRows = prices.annual;
if (priceRows.length !== 26 || priceRows.some((r, i) => r.year !== 2000 + i || !Number.isFinite(r.nominal_growth) || !Number.isFinite(r.real_growth) || Math.abs(r.nominal_growth) > 20 || Math.abs(r.real_growth) > 20)) throw new Error('Sèrie de preus o escala invàlida');
const rows = data.annual;
const firstYear = 2000, lastYear = data.last_complete_year;
if (!Number.isSafeInteger(lastYear) || rows.length !== lastYear - firstYear + 1 || rows.some((r, i) => r.year !== firstYear + i || !Number.isSafeInteger(r.dwellings) || r.dwellings <= 0)) throw new Error('Sèrie anual invàlida');
const latest = rows.at(-1), peak = rows.reduce((a, b) => a.dwellings > b.dwellings ? a : b);
const minimum = rows.reduce((a, b) => a.dwellings < b.dwellings ? a : b);
const sum = rows.filter(r => r.year <= 2007).reduce((n, r) => n + r.dwellings, 0);
if (sum !== data.checks.sum_2000_2007) throw new Error('La suma 2000–2007 no coincideix');
const esc = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const fmt = n => new Intl.NumberFormat('ca-ES').format(n);
const pct = n => `${n < -0.05 ? '−' : n >= 0.05 ? '+' : ''}${Math.abs(n).toLocaleString('ca-ES', {minimumFractionDigits: 1, maximumFractionDigits: 1})}%`;
const txt = (x, y, s, size = 14, anchor = 'start', color = '#132a38', weight = 400) => `<text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="${size}" text-anchor="${anchor}" fill="${color}" font-weight="${weight}">${esc(s)}</text>`;
function figure(mobile) {
  const width = mobile ? 360 : 760, height = mobile ? 390 : 430;
  const left = mobile ? 48 : 66, right = width - 14;
  const top = 115, bottom = height - 66;
  const step = (right - left) / rows.length, barWidth = step * 0.68;
  const y = value => bottom - value / 700000 * (bottom - top);
  const title = `Habitatges acabats a Espanya, ${firstYear}–${lastYear}`;
  const description = `Màxim de ${fmt(peak.dwellings)} el ${peak.year}; mínim de ${fmt(minimum.dwellings)} el ${minimum.year}; ${fmt(latest.dwellings)} el ${latest.year}, dada provisional. Total del 2000 al 2007: ${fmt(sum)}. Habitatge lliure acabat més qualificacions definitives de protegit. No inclou el 2026 parcial.`;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc"><title id="title">${title}</title><desc id="desc">${description}</desc><rect width="${width}" height="${height}" fill="#f4efe5"/>`;
  s += txt(12, 25, 'Habitatges acabats · Espanya', mobile ? 15 : 18, 'start', '#132a38', 700);
  s += txt(12, 49, `Cada any · ${firstYear}–${lastYear}`, mobile ? 13 : 15, 'start', '#52636d');
  s += txt(12, 73, `Màxim: ${fmt(peak.dwellings)} (${peak.year})`, mobile ? 13 : 15, 'start', '#1c6579', 700);
  s += txt(12, 96, `${latest.year} (p): ${fmt(latest.dwellings)} habitatges`, mobile ? 13 : 15, 'start', '#ae372f', 700);
  for (const value of [0, 200000, 400000, 600000]) {
    s += `<line x1="${left}" y1="${y(value)}" x2="${right}" y2="${y(value)}" stroke="#d4cfc5"/>`;
    s += txt(left - 7, y(value) + 4, value ? value / 1000 + ' mil' : '0', mobile ? 10 : 13, 'end', '#52636d');
  }
  rows.forEach((r, i) => {
    const x = left + i * step + (step - barWidth) / 2;
    s += `<rect data-year="${r.year}" data-value="${r.dwellings}" x="${x.toFixed(2)}" y="${y(r.dwellings).toFixed(2)}" width="${barWidth.toFixed(2)}" height="${(bottom-y(r.dwellings)).toFixed(2)}" fill="${r.year === lastYear ? '#ae372f' : '#1c6579'}"><title>${r.year}: ${fmt(r.dwellings)} habitatges${r.status === 'provisional' ? ' (provisional)' : ''}</title></rect>`;
    if ((r.year - firstYear) % 5 === 0 || r.year === lastYear) s += txt(x + barWidth / 2, bottom + 23, r.year, mobile ? 10 : 12, 'middle', '#52636d');
  });
  s += txt(12, height - 15, 'Flux anual, no estoc · (p) dada provisional.', mobile ? 12 : 14, 'start', '#52636d');
  return s + '</svg>\n';
}
function priceGrowthFigure(mobile) {
  const width = mobile ? 360 : 760, height = mobile ? 390 : 430;
  const left = mobile ? 45 : 62, right = width - (mobile ? 46 : 65);
  const top = 110, bottom = height - 66;
  const x = year => left + (year - 2000) / 25 * (right - left);
  const y = value => bottom - (value + 20) / 40 * (bottom - top);
  const latest = priceRows.at(-1);
  const description = `Variació de la mitjana anual del preu de l’habitatge a Espanya, 2000–2025. Màxim del període el 2003: nominal ${pct(prices.checks.nominal_max.value)} i real ${pct(prices.checks.real_max.value)}. Mínim el 2012: nominal ${pct(prices.checks.nominal_min.value)} i real ${pct(prices.checks.real_min.value)}. El 2025: nominal ${pct(latest.nominal_growth)} i real ${pct(latest.real_growth)}. Real vol dir descomptant l’IPC. Font: fonts nacionals i BIS, via FRED.`;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc"><title id="title">Creixement anual del preu de l’habitatge · Espanya, 2000–2025</title><desc id="desc">${esc(description)}</desc><rect width="${width}" height="${height}" fill="#f4efe5"/>`;
  s += txt(12, 25, 'Preu de l’habitatge · Espanya', mobile ? 15 : 18, 'start', '#132a38', 700);
  s += txt(12, 48, 'Variació de la mitjana anual (%) · 2000–2025', mobile ? 12 : 15, 'start', '#52636d');
  for (const [index, label, color, dashed] of [[0, 'Nominal (sense descomptar l’IPC)', '#132a38', false], [1, 'Real (descomptant l’IPC)', '#1c6579', true]]) {
    const ly = 70 + index * 20;
    s += `<line x1="12" y1="${ly}" x2="36" y2="${ly}" stroke="${color}" stroke-width="2.5"${dashed ? ' stroke-dasharray="5 3"' : ''}/>`;
    s += txt(44, ly + 4, label, mobile ? 12 : 14, 'start', color, 700);
  }
  for (const value of [-20, -10, 0, 10, 20]) {
    s += `<line${value === 0 ? ' class="price-zero"' : ''} x1="${left}" y1="${y(value)}" x2="${right}" y2="${y(value)}" stroke="${value === 0 ? '#52636d' : '#d4cfc5'}"${value === 0 ? ' stroke-dasharray="4 4"' : ''}/>`;
    s += txt(left - 7, y(value) + 4, `${value < 0 ? '−' : value > 0 ? '+' : ''}${Math.abs(value)}%`, mobile ? 10 : 13, 'end', '#52636d');
  }
  for (const year of [2000, 2005, 2010, 2015, 2020, 2025]) {
    s += `<line x1="${x(year)}" y1="${bottom}" x2="${x(year)}" y2="${bottom + 5}" stroke="#52636d"/>`;
    s += txt(x(year), bottom + 23, year, mobile ? 10 : 12, 'middle', '#52636d');
  }
  for (const [key, color, dashed] of [['nominal', '#132a38', false], ['real', '#1c6579', true]]) {
    const field = `${key}_growth`;
    const points = priceRows.map(r => `${x(r.year).toFixed(2)},${y(r[field]).toFixed(2)}`);
    s += `<path data-series="${key}" d="M${points.join(' L')}" fill="none" stroke="${color}" stroke-width="${mobile ? 2 : 2.5}" stroke-linejoin="round"${dashed ? ' stroke-dasharray="5 3"' : ''}/>`;
    for (const row of priceRows) s += `<circle data-series="${key}" data-year="${row.year}" data-value="${row[field]}" cx="${x(row.year).toFixed(2)}" cy="${y(row[field]).toFixed(2)}" r="${mobile ? 1.8 : 2.5}" fill="${color}"><title>${row.year} · ${key === 'real' ? 'Real' : 'Nominal'}: ${pct(row[field])}</title></circle>`;
    s += txt(right + 7, y(latest[field]) + 4, pct(latest[field]), mobile ? 10 : 13, 'start', color, 700);
  }
  s += txt(12, height - 15, 'Mitjanes anuals · Habitatge nou i usat', mobile ? 12 : 14, 'start', '#52636d');
  return s + '</svg>\n';
}
const dir = path.join(root, 'assets/charts/oferta-demanda');
await mkdir(dir, { recursive: true });
await writeFile(path.join(dir, 'habitatges-acabats.svg'), figure(false));
await writeFile(path.join(dir, 'habitatges-acabats-mobile.svg'), figure(true));
await writeFile(path.join(dir, 'preus-habitatge.svg'), priceGrowthFigure(false));
await writeFile(path.join(dir, 'preus-habitatge-mobile.svg'), priceGrowthFigure(true));
console.log('Creats 4 gràfics accessibles. Habitatges acabats 2000–2007: ' + fmt(sum));
