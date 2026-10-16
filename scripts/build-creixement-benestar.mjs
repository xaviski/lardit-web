/**
 * Figures for the unpublished Catalunya living-standards draft.
 * Run: node scripts/build-creixement-benestar.mjs
 * Input snapshots preserve official values and metadata in assets/data/creixement-benestar.
 * No remote fetch, third-party dependencies or edits to the article are required.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'assets/data/creixement-benestar');
const outputDir = path.join(root, 'assets/charts/creixement-benestar');
const load = async name => JSON.parse(await readFile(path.join(dataDir, `${name}.json`), 'utf8'));
const [macro, age, income] = await Promise.all(['macro', 'edat', 'renda'].map(load));
await mkdir(outputDir, { recursive: true });

const C = { ink: '#132a38', blue: '#1c6579', red: '#ae372f', gold: '#a66e00', green: '#2c6a59', paper: '#f4efe5', grid: '#d4cfc5', muted: '#52636d' };
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const fmt = (value, decimals = 1) => new Intl.NumberFormat('ca-ES', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
const signed = value => `${value > 0 ? '+' : value < 0 ? '−' : ''}${fmt(Math.abs(value))}%`;
const line = (x1, y1, x2, y2, color = C.grid, width = 1, dash = '') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
const text = (x, y, value, { size = 14, color = C.ink, anchor = 'start', weight = 400, family = 'Arial, sans-serif' } = {}) => `<text x="${x}" y="${y}" fill="${color}" text-anchor="${anchor}" font-family="${family}" font-size="${size}" font-weight="${weight}">${esc(value)}</text>`;
const rect = (x, y, width, height, fill, rx = 0) => `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}" rx="${rx}"/>`;
const circle = (x, y, r, fill) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`;
const pathLine = (points, color, width = 3) => `<path d="${points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
function linesOf(value, maxChars) {
  const result = []; let current = '';
  for (const word of value.split(' ')) {
    if (current && current.length + word.length + 1 > maxChars) { result.push(current); current = word; }
    else current += `${current ? ' ' : ''}${word}`;
  }
  if (current) result.push(current);
  return result;
}
function note(value, y, width, mobile) {
  return linesOf(value, mobile ? 47 : 103).map((v, i) => text(12, y + i * 17, v, { size: mobile ? 12 : 13, color: C.muted })).join('');
}
function svg(width, height, title, description, content) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="chart-title chart-description">\n<title id="chart-title">${esc(title)}</title>\n<desc id="chart-description">${esc(description)}</desc>\n${rect(0, 0, width, height, C.paper)}\n${content}\n</svg>\n`;
}
function assertFinite(value, trail = '') {
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`Non-finite chart data: ${trail}`);
  if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) assertFinite(item, `${trail}.${key}`);
}

const base2000 = macro.annual.find(r => r.year === 2000);
const macroRows = macro.annual.map(r => ({
  year: r.year,
  gdp_real_total_index2000: r.gdp_volume_index2020 / base2000.gdp_volume_index2020 * 100,
  gdp_real_percap_index2000: r.gdp_real_percap_eur2020 / base2000.gdp_real_percap_eur2020 * 100,
  household_consumption_real_percap_index2000_approx: r.household_consumption_real_percap_index2020_approx / base2000.household_consumption_real_percap_index2020_approx * 100,
  status: r.status_demand,
}));
const macroSeries = [
  { key: 'gdp_real_total_index2000', label: 'PIB real total', color: C.ink },
  { key: 'gdp_real_percap_index2000', label: 'PIB real per habitant', color: C.blue },
  { key: 'household_consumption_real_percap_index2000_approx', label: 'Consum real per habitant (aprox.)', color: C.red },
];

function macroLineFigure(series, { mobile, title, yMin, yMax, yTicks }) {
  const width = mobile ? 360 : 760;
  const left = mobile ? 41 : 56, right = mobile ? 46 : 66;
  const top = mobile ? 116 : 98, bottom = mobile ? 343 : 367;
  const plotWidth = width - left - right;
  const x = year => left + (year - 2000) / 25 * plotWidth;
  const y = value => bottom - (value - yMin) / (yMax - yMin) * (bottom - top);
  let s = text(12, 24, 'Catalunya · Índex, any 2000 = 100', { size: mobile ? 13 : 15 });
  series.forEach((a, i) => {
    const lx = mobile ? 12 : 12 + i * 326, ly = mobile ? 52 + i * 23 : 58;
    s += line(lx, ly - 4, lx + 20, ly - 4, a.color, 3) + text(lx + 28, ly, a.label, { size: mobile ? 12 : 14, weight: 600 });
  });
  for (const tick of yTicks) s += line(left, y(tick), width - right, y(tick), tick === 100 ? C.muted : C.grid, 1, tick === 100 ? '4 4' : '') + text(left - 9, y(tick) + 4, fmt(tick, 0), { size: mobile ? 12 : 13, anchor: 'end', color: C.muted });
  for (const year of [2000, 2005, 2010, 2015, 2020, 2025]) {
    s += line(x(year), bottom, x(year), bottom + 5, C.muted);
    s += text(x(year), bottom + 23, year, { size: mobile ? 11 : 13, anchor: 'middle', color: C.muted });
  }
  series.forEach(a => {
    s += pathLine(macroRows.map(row => [x(row.year), y(row[a.key])]), a.color);
    for (const row of macroRows) s += circle(x(row.year), y(row[a.key]), 1.8, a.color);
    const last = macroRows.at(-1);
    s += circle(x(last.year), y(last[a.key]), 3, a.color);
    s += text(x(2025) + 7, y(last[a.key]) + 4, fmt(last[a.key]), { size: mobile ? 12 : 14, color: a.color, weight: 700 });
  });
  s += note('2023–2025: dades provisionals. Volums encadenats: efecte dels preus descomptat.', bottom + 51, width, mobile);
  const height = mobile ? 436 : 447;
  return svg(width, height, title, `${title}. Sèrie anual de 2000 a 2025. Base 2000 igual a 100. Les dades de 2023 a 2025 són provisionals.`, s);
}

const sensitivityRows = macro.findings.flatMap(f => [
  { base_year: f.base_year, series: 'PIB real total', key: 'gdp', change_percent: f.gdp_real_percent, color: C.ink },
  { base_year: f.base_year, series: 'PIB real per habitant', key: 'gdp_percap', change_percent: f.gdp_real_percap_percent, color: C.blue },
  { base_year: f.base_year, series: 'Consum real per habitant (aprox.)', key: 'consumption_percap', change_percent: f.household_consumption_real_percap_percent_approx, color: C.red },
]);
function sensitivityFigure(mobile) {
  const width = mobile ? 360 : 760, left = mobile ? 111 : 232, right = mobile ? 56 : 90;
  const maxX = width - right, plotW = maxX - left;
  const x = n => left + (n + 15) / 75 * plotW;
  const rowGap = mobile ? 42 : 42, groupGap = 40;
  const top = 86, bottom = top + 9 * rowGap + 2 * groupGap - 15;
  let s = text(12, 24, 'Variació real acumulada fins al 2025 (%)', { size: mobile ? 13 : 15 });
  s += text(12, 47, 'El resultat depèn de l’any de partida', { size: mobile ? 12 : 14, color: C.muted });
  for (const tick of [-10, 0, 20, 40, 60]) {
    s += line(x(tick), top - 8, x(tick), bottom + 8, tick === 0 ? C.muted : C.grid);
    s += text(x(tick), bottom + 30, tick, { size: mobile ? 12 : 13, anchor: 'middle', color: C.muted });
  }
  sensitivityRows.forEach((r, i) => {
    const group = Math.floor(i / 3), within = i % 3;
    const yy = top + i * rowGap + group * groupGap;
    if (within === 0) s += text(12, yy - 13, `${r.base_year} → 2025`, { size: mobile ? 13 : 15, weight: 700 });
    const label = mobile ? ({ gdp: 'PIB total', gdp_percap: 'PIB / hab.', consumption_percap: 'Consum / hab.' })[r.key] : r.series.replace(' (aprox.)', '');
    s += text(12, yy + 14, label, { size: mobile ? 12 : 14 });
    const end = x(r.change_percent);
    s += rect(Math.min(x(0), end), yy, Math.max(1, Math.abs(end - x(0))), 20, r.color);
    s += text(width - 12, yy + 15, signed(r.change_percent), { size: mobile ? 12 : 14, anchor: 'end', color: r.color, weight: 700 });
  });
  s += note('Consum per habitant: càlcul propi aproximat. 2025 provisional.', bottom + 58, width, mobile);
  return svg(width, bottom + (mobile ? 110 : 94), 'La sensibilitat a l’any de partida', 'Canvis acumulats del PIB real total, del PIB real per habitant i del consum real per habitant des de 2000, 2007 i 2019 fins a 2025.', s);
}

const ageRows = age.age_order.map((group, i) => ({ age_group_main_provider: group, annual_nominal_euros_per_consumption_unit: age.annual_nominal_data['2024'].equivalent[i], status: 'b' }));
function ageSnapshotFigure(mobile) {
  const width = mobile ? 360 : 760, left = mobile ? 67 : 93, right = mobile ? 72 : 104;
  const x = n => left + n / 26000 * (width - right - left);
  const top = 103, gap = 58, bottom = top + 4 * gap + 26;
  let s = text(12, 24, 'Catalunya · 2024 · Euros anuals per unitat de consum', { size: mobile ? 12 : 15 });
  s += text(12, 48, 'Edat del sustentador principal de la llar', { size: mobile ? 12 : 14, color: C.muted });
  for (const tick of [0, 10000, 20000]) {
    s += line(x(tick), top - 13, x(tick), bottom, C.grid);
    s += text(x(tick), bottom + 24, fmt(tick, 0), { size: mobile ? 11 : 13, anchor: 'middle', color: C.muted });
  }
  ageRows.forEach((r, i) => {
    const yy = top + i * gap;
    s += text(12, yy + 18, r.age_group_main_provider, { size: mobile ? 13 : 15, weight: 600 });
    s += rect(left, yy, x(r.annual_nominal_euros_per_consumption_unit) - left, 27, C.blue);
    s += text(width - 12, yy + 19, `${fmt(r.annual_nominal_euros_per_consumption_unit, 0)} €`, { size: mobile ? 12 : 15, anchor: 'end', color: C.blue, weight: 700 });
  });
  s += note('Preus corrents. Unitat de consum: ajust per mida i composició de la llar. Inclou lloguer imputat.', bottom + 54, width, mobile);
  s += note('2024: ruptura de sèrie. Fotografia d’un sol any; no és l’edat de cada consumidor.', bottom + (mobile ? 109 : 86), width, mobile);
  return svg(width, bottom + (mobile ? 174 : 132), 'Despesa de consum segons l’edat del sustentador principal, 2024', 'Despesa anual per unitat de consum: de 16 a 29 anys, 18.755 euros; de 30 a 44, 20.148; de 45 a 59, 21.521; de 60 a 74, 24.907; 75 anys o més, 22.550. Preus corrents. No són grups d’edat de cada consumidor.', s);
}

const incomeKeys = ['under_16', 'age_16_39', 'age_40_64', 'age_65_plus'];
const incomeColors = [C.ink, C.blue, C.red, C.gold];
const cpi = age.cpi_annual_mean_Catalunya_base2025_100;
const incomeRows = income.rows.map(r => {
  const result = { income_reference_year: r.income_reference_year, survey_year: r.survey_year, cpi_annual_mean: cpi[r.income_reference_year] };
  for (const key of [...incomeKeys, 'total']) {
    const nominal = r.nominal_euros_per_consumption_unit[key];
    const real2024 = nominal * cpi[2024] / cpi[r.income_reference_year];
    const baseReal2024 = income.rows[0].nominal_euros_per_consumption_unit[key] * cpi[2024] / cpi[2012];
    result[`${key}_nominal_euros`] = nominal;
    result[`${key}_real_euros2024_approx`] = real2024;
    result[`${key}_real_index2012_approx`] = real2024 / baseReal2024 * 100;
  }
  return result;
});
function incomeFigure(mobile) {
  const width = mobile ? 360 : 760, columns = mobile ? 1 : 2;
  const panelW = mobile ? 336 : 354, panelH = mobile ? 208 : 226;
  const top = 70, panelGapX = 28, panelGapY = 30;
  const yMin = 90, yMax = 125;
  let s = text(12, 24, 'Renda neta per unitat de consum · Catalunya', { size: mobile ? 13 : 15 });
  s += text(12, 47, 'Índex real aproximat · Renda de 2012 = 100', { size: mobile ? 12 : 14, color: C.muted });
  incomeKeys.forEach((key, i) => {
    const col = i % columns, row = Math.floor(i / columns);
    const panelX = 12 + col * (panelW + panelGapX), panelY = top + row * (panelH + panelGapY);
    const left = panelX + 36, right = panelX + panelW - 20;
    const plotTop = panelY + 42, bottom = panelY + panelH - 30;
    const x = year => left + (year - 2012) / 12 * (right - left);
    const y = val => bottom - (val - yMin) / (yMax - yMin) * (bottom - plotTop);
    const color = incomeColors[i];
    s += text(panelX, panelY + 18, income.age_groups[key], { size: mobile ? 14 : 16, color, weight: 700 });
    const last = incomeRows.at(-1);
    s += text(panelX + panelW, panelY + 18, `2024: ${fmt(last[`${key}_real_index2012_approx`])}`, { size: mobile ? 13 : 14, anchor: 'end', color, weight: 700 });
    for (const tick of [90, 100, 110, 120]) {
      s += line(left, y(tick), right, y(tick), tick === 100 ? C.muted : C.grid, 1, tick === 100 ? '4 4' : '');
      s += text(left - 7, y(tick) + 4, tick, { size: 11, anchor: 'end', color: C.muted });
    }
    for (const year of [2012, 2015, 2018, 2021, 2024]) s += text(x(year), bottom + 20, year, { size: mobile ? 11 : 12, anchor: 'middle', color: C.muted });
    s += pathLine(incomeRows.map(r => [x(r.income_reference_year), y(r[`${key}_real_index2012_approx`])]), color, 2.7);
    for (const r of incomeRows) s += circle(x(r.income_reference_year), y(r[`${key}_real_index2012_approx`]), 2, color);
  });
  const panelsBottom = top + Math.ceil(incomeKeys.length / columns) * (panelH + panelGapY) - panelGapY;
  s += note('Edat de cada persona. Any de renda, no d’enquesta. Mitjanes; no són salaris individuals.', panelsBottom + 28, width, mobile);
  s += note('Deflactor: IPC anual mitjà de Catalunya. Grups canviants, no seguiment d’una mateixa generació.', panelsBottom + (mobile ? 80 : 61), width, mobile);
  return svg(width, panelsBottom + (mobile ? 139 : 109), 'Evolució de la renda real mitjana per edat, 2012–2024', 'Quatre gràfics amb la mateixa escala. Renda neta anual per unitat de consum, ajustada aproximadament amb l’IPC de Catalunya; 2012 igual a 100. Grups d’edat de cada persona, no del sustentador principal.', s);
}

const historicRows = age.age_order.map((group, i) => {
  const start = age.annual_nominal_data['2016'].equivalent[i];
  const end = age.annual_nominal_data['2019'].equivalent[i];
  return { age_group_main_provider: group, start_year: 2016, end_year: 2019, nominal_euros_start: start, nominal_euros_end: end, real_change_percent_approx: (end / start * cpi[2016] / cpi[2019] - 1) * 100 };
});
function historicFigure(mobile) {
  const width = mobile ? 360 : 760, left = mobile ? 67 : 93, right = mobile ? 65 : 91;
  const x = n => left + n / 17 * (width - right - left);
  const top = 101, gap = 58, bottom = top + 4 * gap + 26;
  let s = text(12, 24, 'Catalunya · 2016–2019 · Canvi real aproximat (%)', { size: mobile ? 12 : 15 });
  s += text(12, 48, 'Despesa per unitat de consum · Edat del sustentador', { size: mobile ? 12 : 14, color: C.muted });
  for (const tick of [0, 5, 10, 15]) {
    s += line(x(tick), top - 13, x(tick), bottom);
    s += text(x(tick), bottom + 24, tick, { size: mobile ? 12 : 13, anchor: 'middle', color: C.muted });
  }
  historicRows.forEach((r, i) => {
    const yy = top + i * gap;
    s += text(12, yy + 18, r.age_group_main_provider, { size: mobile ? 13 : 15, weight: 600 });
    s += rect(left, yy, x(r.real_change_percent_approx) - left, 27, C.blue);
    s += text(width - 12, yy + 19, signed(r.real_change_percent_approx), { size: mobile ? 13 : 15, anchor: 'end', color: C.blue, weight: 700 });
  });
  s += note('Episodi històric comparable, anterior a la pandèmia. No s’enllaça amb 2024.', bottom + 54, width, mobile);
  s += note('Deflactor comú: IPC general català; no és un índex de preus específic de cada edat.', bottom + (mobile ? 109 : 86), width, mobile);
  return svg(width, bottom + (mobile ? 174 : 132), 'Canvi real aproximat de la despesa per edat del sustentador, 2016–2019', 'Comparació històrica dins d’un tram homogeni de l’EPF, descomptant aproximadament l’IPC general català. No es comparen dades a través de les ruptures de 2023 i 2024.', s);
}

const specs = [
  { id: 'pib-total-per-habitant', title: 'Una economia més gran, però quant més per persona?', alt: 'PIB real total i PIB real per habitant de Catalunya, 2000–2025, amb base 2000 igual a 100.', unit: 'Índex, 2000=100', rows: macroRows.map(r => ({ year: r.year, gdp_real_total_index2000: r.gdp_real_total_index2000, gdp_real_percap_index2000: r.gdp_real_percap_index2000, status: r.status })), sources: [macro.sources[0].page, macro.sources[1].page], render: mobile => macroLineFigure(macroSeries.slice(0, 2), { mobile, title: 'PIB real total i per habitant, 2000–2025', yMin: 90, yMax: 160, yTicks: [90, 100, 120, 140, 160] }) },
  { id: 'pib-consum-per-habitant', title: 'Produir més no és el mateix que consumir més', alt: 'PIB real per habitant i consum real de les llars per habitant aproximat, Catalunya 2000–2025, base 2000 igual a 100.', unit: 'Índex, 2000=100', rows: macroRows.map(r => ({ year: r.year, gdp_real_percap_index2000: r.gdp_real_percap_index2000, household_consumption_real_percap_index2000_approx: r.household_consumption_real_percap_index2000_approx, status: r.status })), sources: [macro.sources[0].page, macro.sources[1].page], formula: macro.calculations.equivalent_formula, limitation: macro.calculations.limitation, render: mobile => macroLineFigure(macroSeries.slice(1), { mobile, title: 'PIB real i consum real per habitant, 2000–2025', yMin: 80, yMax: 125, yTicks: [80, 90, 100, 110, 120] }) },
  { id: 'sensibilitat-any-base', title: 'Què canvia quan movem el punt de partida?', alt: 'Variació acumulada fins a 2025 del PIB total, el PIB per habitant i el consum per habitant, des de 2000, 2007 i 2019.', unit: 'Variació acumulada (%)', rows: sensitivityRows.map(({ color, ...r }) => r), sources: [macro.sources[0].page, macro.sources[1].page], formula: '100 * (valor_2025 / valor_any_base - 1)', render: sensitivityFigure },
  { id: 'despesa-edat-2024', title: 'Quant consumeixen les llars segons l’edat?', alt: 'Despesa nominal anual per unitat de consum a Catalunya el 2024, segons l’edat del sustentador principal de la llar.', unit: 'Euros anuals per unitat de consum, preus corrents', rows: ageRows, sources: [age.sources.age_table, age.sources.equivalent_ssv], limitation: `${age.definitions.age_group} ${age.definitions.young_people_at_parental_home} ${age.comparability['2024_break']}`, render: ageSnapshotFigure },
  { id: 'renda-real-edat', title: 'Com ha canviat el poder adquisitiu per edat?', alt: 'Evolució aproximada de la renda real per unitat de consum dels menors de 16 anys, de 16 a 39, de 40 a 64 i de 65 o més, entre els anys de renda 2012 i 2024.', unit: 'Índex real aproximat, any de renda 2012=100', age_groups: income.age_groups, rows: incomeRows, sources: [income.source_url, age.sources.cpi_table], formula: 'renda_real_preus2024_t = renda_nominal_t * IPC_2024 / IPC_t; index2012 = 100 * renda_real_t / renda_real_2012', limitation: [...income.comparability_notes.filter(note => !note.startsWith('Valors encara no deflactats')), 'Sèrie derivada ajustada amb IPC anual mitjà de Catalunya de l’any de renda; aproximació comuna, no inflació específica per edat.'], render: incomeFigure },
  { id: 'despesa-real-edat-2016-2019', title: 'Un episodi històric: la despesa entre 2016 i 2019', alt: 'Creixement real aproximat de la despesa anual per unitat de consum entre 2016 i 2019, segons l’edat del sustentador principal de la llar.', unit: 'Variació real aproximada (%)', rows: historicRows, sources: [age.sources.equivalent_ssv, age.sources.cpi_table], formula: '100 * (despesa_nominal_2019 / despesa_nominal_2016 * IPC_2016 / IPC_2019 - 1)', limitation: `${age.comparability.safe_chart_option} ${age.comparability.cpi_limitation}`, render: historicFigure },
];

assertFinite(specs);
for (const spec of specs) {
  for (const mobile of [false, true]) {
    const content = spec.render(mobile);
    if (/NaN|Infinity|undefined/.test(content)) throw new Error(`Invalid SVG: ${spec.id}`);
    await writeFile(path.join(outputDir, `${spec.id}${mobile ? '-mobile' : ''}.svg`), content);
  }
}
const chartData = {
  generated_from_snapshots: '2026-10-16', territory: 'Catalunya', generator: 'scripts/build-creixement-benestar.mjs',
  notes: ['PIB, renda i consum són fluxos, no patrimoni net.', 'Sèries agregades reals: comptabilitat nacional. Despesa EPF i renda ECV reals: aproximació amb IPC general.', 'L’edat de l’EPF és la del sustentador principal; la de l’ECV és la de cada persona. No són classificacions equivalents.', 'El període EPF2016–2019 s’aïlla per evitar les ruptures metodològiques de la sèrie.'],
  charts: specs.map(({ render, ...spec }) => ({ ...spec, desktop: `/assets/charts/creixement-benestar/${spec.id}.svg`, mobile: `/assets/charts/creixement-benestar/${spec.id}-mobile.svg` })),
};
await writeFile(path.join(dataDir, 'charts.json'), `${JSON.stringify(chartData, null, 2)}\n`);
console.log(`Created ${specs.length * 2} SVGs in ${path.relative(root, outputDir)} and charts.json in ${path.relative(root, dataDir)}.`);
console.log('Real income change 2012–2024:', Object.fromEntries(incomeKeys.map(key => [key, signed(incomeRows.at(-1)[`${key}_real_index2012_approx`] - 100)])));
console.log('Historic real spending change 2016–2019:', historicRows.map(r => `${r.age_group_main_provider}: ${signed(r.real_change_percent_approx)}`).join('; '));
