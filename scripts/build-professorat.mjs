/** Build accessible, responsive figures from checked teacher-salary snapshots. No network. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = async name => JSON.parse(await readFile(path.join(root, 'assets/data/professorat', name), 'utf8'));
const sweden = await read('salaris-suecia.json');
const publicPay = await read('salaris-publics.json');
const composition = await read('components-sou-2026.json');
const publicRows = publicPay.rows.map(r => ({ year: r.year, value: r.ordinary_monthly_base_eur }));
const swedenRows = sweden.rows.map(r => ({ year: r.year, value: r.monthly_sek }));
for (const [rows, first, last] of [[publicRows, 2005, 2026], [swedenRows, 2014, 2025]]) {
  if (rows.length !== last - first + 1 || rows.some((r, i) => r.year !== first + i || !Number.isFinite(r.value) || r.value <= 0)) throw new Error('Incomplete or invalid salary series');
}
const esc = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const fmt = (n, decimals = 0) => n.toLocaleString('ca-ES', {minimumFractionDigits: decimals, maximumFractionDigits: decimals});
const text = (x, y, s, size = 14, anchor = 'start', colour = '#132a38', weight = 400) => `<text x="${x}" y="${y}" font-family="Arial,sans-serif" font-size="${size}" text-anchor="${anchor}" fill="${colour}" font-weight="${weight}">${esc(s)}</text>`;
function chart(rows, mobile, title, subtitle, unit, max, tick, footnote, decimals) {
  const width = mobile ? 360 : 760, height = mobile ? 370 : 420;
  const left = mobile ? 47 : 64, right = width - 24, top = 105, bottom = height - 65;
  const x = year => left + (year - rows[0].year) / (rows.at(-1).year - rows[0].year) * (right-left);
  const y = value => bottom - value / max * (bottom-top);
  const desc = `${subtitle}. ${rows[0].year}: ${fmt(rows[0].value, decimals)} ${unit}; ${rows.at(-1).year}: ${fmt(rows.at(-1).value, decimals)} ${unit}. Imports nominals, sense descomptar la inflació.`;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc"><title id="title">${esc(title)}</title><desc id="desc">${esc(desc)}</desc><rect width="${width}" height="${height}" fill="#f4efe5"/>`;
  svg += text(12, 25, title, mobile ? 15 : 18, 'start', '#132a38', 700);
  svg += text(12, 48, subtitle, mobile ? 12 : 15, 'start', '#52636d');
  svg += text(12, 75, `${rows.at(-1).year}: ${fmt(rows.at(-1).value, decimals)} ${unit}`, mobile ? 15 : 17, 'start', '#1c6579', 700);
  for (let value=0; value<=max; value+=tick) {
    svg += `<line x1="${left}" y1="${y(value)}" x2="${right}" y2="${y(value)}" stroke="#d4cfc5"/>`;
    svg += text(left-7,y(value)+4,fmt(value),mobile ? 10 : 13,'end','#52636d');
  }
  const first = rows[0].year, last = rows.at(-1).year;
  const middleYears = rows.length > 16
    ? rows.filter(r => r.year % 5 === 0 && r.year >= first+3 && r.year <= last-3).map(r=>r.year)
    : [first+4, first+8].filter(year => year <= last-3);
  const years = mobile ? [first, rows[Math.floor(rows.length/2)].year, last] : [first,...middleYears,last];
  for (const year of years) svg += text(x(year), bottom+24, year, mobile ? 11 : 13,'middle','#52636d');
  svg += `<path d="M${rows.map(r=>`${x(r.year).toFixed(2)},${y(r.value).toFixed(2)}`).join(' L')}" fill="none" stroke="#1c6579" stroke-width="2.5" stroke-linejoin="round"/>`;
  for (const r of rows) svg += `<circle data-year="${r.year}" data-value="${r.value}" cx="${x(r.year).toFixed(2)}" cy="${y(r.value).toFixed(2)}" r="2.6" fill="#1c6579"><title>${r.year}: ${fmt(r.value,decimals)} ${unit}</title></circle>`;
  svg += text(12,height-17,footnote,mobile ? 11 : 13,'start','#52636d');
  return svg + '</svg>\n';
}
const cents = value => Math.round(value * 100);
if (composition.components.reduce((sum, row) => sum + cents(row.annual_eur), 0) !== cents(composition.annual_total_eur)) throw new Error('Annual pay components do not add up');
if (composition.components.reduce((sum, row) => sum + cents(row.ordinary_monthly_eur), 0) !== cents(composition.ordinary_monthly_total_eur)) throw new Error('Ordinary monthly pay components do not add up');
for (const row of composition.components) {
  const expected = row.id === 'base'
    ? cents(row.ordinary_monthly_eur) * row.ordinary_payments + cents(row.extra_component_eur) * row.extra_payments
    : row.single_payment_eur !== undefined ? cents(row.single_payment_eur) : cents(row.ordinary_monthly_eur) * row.payments;
  if (cents(row.annual_eur) !== expected) throw new Error(`Invalid annual calculation: ${row.id}`);
}
function compositionChart(mobile) {
  const width = mobile ? 360 : 760, height = mobile ? 710 : 620;
  const colours = {state:'#1c6579',generalitat:'#ae372f'};
  const componentColours = {base:colours.state,destination:'#7b253a',specific_general:'#ba4b35',service_improvement:'#b17b16',specific_single_payment:'#be6c7d'};
  const total = composition.annual_total_eur;
  const desc = composition.components.map(row => `${row.label}: ${fmt(row.annual_eur,2)} euros anuals. ${row.authority_label}. ${row.calculation_label}.`).join(' ') + ` Total: ${fmt(total,2)} euros bruts anuals; mes ordinari: ${fmt(composition.ordinary_monthly_total_eur,2)} euros. Sense antiguitat ni complements singulars. Blau: Estat; quatre tons càlids: Generalitat. Cada tram té el mateix color que la fila del seu component, en el mateix ordre. Els colors indiquen qui fixa els imports, no qui els paga.`;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc"><title id="title">Components del sou brut d’un mestre públic a Catalunya · 2026</title><desc id="desc">${esc(desc)}</desc><rect width="${width}" height="${height}" fill="#f4efe5"/>`;
  svg += text(12,26,'Qui fixa cada part del sou?',mobile ? 19 : 24,'start','#132a38',700);
  svg += text(12,50,'Mestre públic · Catalunya · Jornada completa · 2026',mobile ? 12 : 15,'start','#52636d');
  svg += text(12,89,`${fmt(total,2)} € bruts/any`,mobile ? 26 : 30,'start','#132a38',700);
  svg += text(12,115,`Mes ordinari: ${fmt(composition.ordinary_monthly_total_eur,2)} €`,mobile ? 14 : 16,'start','#52636d');
  const legend = [[12,148,'state','Estat'],[150,148,'generalitat','Generalitat']];
  for (const [x,y,key,label] of legend) {
    const swatches = composition.components.filter(row => row.authority===key);
    swatches.forEach((row,index) => {
      svg += `<rect x="${x+index*11}" y="${y-10}" width="10" height="12" fill="${componentColours[row.id]}"/>`;
    });
    svg += text(x+swatches.length*11+8,y,label,mobile ? 13 : 14);
  }
  const barY = mobile ? 198 : 178, barWidth = width-24;
  let running = 0;
  for (const row of composition.components) {
    const w = row.annual_eur/total*barWidth;
    svg += `<rect data-component="${row.id}" data-annual="${row.annual_eur}" data-authority="${row.authority}" x="${(12+running).toFixed(3)}" y="${barY}" width="${w.toFixed(3)}" height="30" fill="${componentColours[row.id]}" stroke="#f4efe5" stroke-width="1.5"><title>${esc(row.label)}: ${fmt(row.annual_eur,2)} € · ${esc(row.authority_label)}</title></rect>`;
    running += w;
  }
  const startY = mobile ? 269 : 247, step = mobile ? 73 : 59;
  composition.components.forEach((row,index) => {
    const y=startY+index*step;
    svg += `<rect x="12" y="${y-10}" width="10" height="10" fill="${componentColours[row.id]}"/>`;
    svg += text(32,y,row.label,mobile ? 13 : 16,'start','#132a38',700);
    svg += text(width-12,y,`${fmt(row.annual_eur,2)} €`,mobile ? 14 : 16,'end','#132a38',700);
    if (row.id==='destination') {
      svg += text(32,y+(mobile ? 23 : 18),'Generalitat · Nivell retributiu del lloc',mobile ? 11.5 : 13,'start',colours.generalitat);
      svg += text(32,y+(mobile ? 40 : 34),`${fmt(row.ordinary_monthly_eur,2)} € per paga · ${row.payments} pagues`,mobile ? 11.5 : 13,'start',colours.generalitat);
    } else {
      const detail = row.id==='base'?'Estat · 12 ordinàries + 2 extres':`Generalitat · ${row.calculation_label}`;
      svg += text(32,y+23,detail,mobile ? 11.5 : 13,'start',colours[row.authority]);
    }
    const lineY = y+(row.id==='destination' ? (mobile ? 55 : 43) : 39);
    svg += `<line x1="12" y1="${lineY}" x2="${width-12}" y2="${lineY}" stroke="#d4cfc5"/>`;
  });
  const footY = mobile ? 645 : 569;
  svg += text(12,footY,'Sense antiguitat, estadis ni complements singulars.',mobile ? 11.5 : 13,'start','#52636d');
  svg += text(12,footY+20,'Complements autonòmics dins del marc estatal.',mobile ? 11.5 : 13,'start','#52636d');
  svg += text(12,footY+40,'Els colors no indiquen l’origen del finançament.',mobile ? 11.5 : 13,'start','#52636d');
  return svg+'</svg>\n';
}
const dir = path.join(root,'assets/charts/professorat');
await mkdir(dir,{recursive:true});
for (const mobile of [false,true]) {
  const suffix = mobile ? '-mobile' : '';
  await writeFile(path.join(dir,`sou-base-public${suffix}.svg`),chart(publicRows,mobile,'Sou base dels mestres · Pública','2005–2026 · Brut mensual ordinari','€',1400,200,'Sense complements ni pagues extres · Nominal',2));
  await writeFile(path.join(dir,`sou-suecia${suffix}.svg`),chart(swedenRows,mobile,'Salari docent mitjà · Suècia','2014–2025 · Jornada completa equivalent','SEK',50000,10000,'Primària i secundària obligatòria · Nominal',0));
  await writeFile(path.join(dir,`components-sou${suffix}.svg`),compositionChart(mobile));
}
console.log('Creats sis gràfics accessibles amb les variants de mòbil; desglossaments mensual i anual validats.');
