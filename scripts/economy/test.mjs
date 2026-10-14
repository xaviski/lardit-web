import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { INDICATORS, REGIONS, periodEnd, sourceUrl, validateSnapshot } from './shared.mjs';
import { START, END, escapeHtml, renderDashboard, replaceDashboard, timeAxisTicks } from './render.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const snapshot = JSON.parse(await fs.readFile(path.join(root, 'assets/data/economy.json'), 'utf8'));
const clone = () => structuredClone(snapshot);
const metric = (data, region = 'us', indicator = 'inflation') =>
  data.regions.find((entry) => entry.id === region).indicators[indicator];
const count = (text, pattern) => [...text.matchAll(pattern)].length;

function chartContents(html, id) {
  const svg = html.match(new RegExp(`<svg[^>]*aria-labelledby="${id}-title ${id}-desc"[^>]*>([\\s\\S]*?)</svg>`));
  assert.ok(svg, `Falta el gràfic ${id}`);
  return svg[1];
}

function chartPaths(html, id) {
  return [...chartContents(html, id).matchAll(/<path d="([^"]*)" class="economy-chart-line[^"\n]*"\/>/g)]
    .map((match) => match[1]);
}

function chartTimeTicks(html, id) {
  return [...chartContents(html, id).matchAll(/<g class="economy-chart-time-tick" data-period="([^"]+)">([\s\S]*?)<\/g>/g)]
    .map((match) => ({ period: match[1], content: match[2] }));
}

function setSeries(data, indicator, series) {
  const target = metric(data, 'us', indicator);
  target.series = series;
  target.latest = { ...series.at(-1) };
  return target;
}

test('La còpia publicada conté quatre territoris i setze indicadors vàlids', () => {
  assert.equal(validateSnapshot(snapshot), snapshot);
  assert.deepEqual(snapshot.regions.map((region) => region.id), REGIONS);
  assert.equal(snapshot.regions.reduce((total, region) => total + INDICATORS.filter((key) => region.indicators[key]).length, 0), 16);
});

test('Els períodes es converteixen al final del mes o del trimestre en UTC', () => {
  assert.equal(periodEnd('2024-02'), '2024-02-29');
  assert.equal(periodEnd('2025-02'), '2025-02-28');
  assert.equal(periodEnd('2026-Q1'), '2026-03-31');
  assert.equal(periodEnd('2026-Q4'), '2026-12-31');
  assert.equal(periodEnd('2026-10-14'), '2026-10-14');
  for (const invalid of ['2026-13', '2026-Q0', '2026-Q5', '2026-02-30', '2026-1', 'no-data']) {
    assert.throws(() => periodEnd(invalid));
  }
});

const invalidSnapshots = [
  ['versió desconeguda', (data) => { data.version = 2; }],
  ['data de consulta impossible', (data) => { data.asOf = '2026-02-30'; }],
  ['territori absent', (data) => { data.regions.pop(); }],
  ['ordre dels territoris alterat', (data) => { data.regions.reverse(); }],
  ['indicador absent', (data) => { delete metric(data, 'us', 'inflation').definition; }],
  ['unitat incorrecta', (data) => { metric(data).unit = 'USD'; }],
  ['freqüència incompatible', (data) => { metric(data, 'us', 'gdp').frequency = 'Mensual'; }],
  ['històric insuficient', (data) => { metric(data).series = [metric(data).series.at(-1)]; }],
  ['període duplicat', (data) => { metric(data).series.splice(1, 0, { ...metric(data).series[0] }); }],
  ['històric desordenat', (data) => { metric(data).series.reverse(); }],
  ['observació futura', (data) => { metric(data).series.push({ period: `${Number(data.asOf.slice(0, 4)) + 1}-01`, value: 2 }); }],
  ['valor no finit', (data) => { metric(data).series[0].value = NaN; }],
  ['taxa d’atur fora de rang', (data) => { metric(data, 'us', 'unemployment').series[0].value = 101; }],
  ['últim valor inconsistent', (data) => { metric(data).latest.value += 1; }],
  ['límit superior històric absent', (data) => { delete metric(data, 'us', 'policy').series[0].valueUpper; }],
  ['límit superior intermedi absent', (data) => { delete metric(data, 'us', 'policy').series[1].valueUpper; }],
  ['límit superior inferior al mínim', (data) => { const point = metric(data, 'us', 'policy').series[0]; point.valueUpper = point.value - 1; }],
  ['límit superior no finit', (data) => { metric(data, 'us', 'policy').series[0].valueUpper = Infinity; }],
  ['últim límit superior inconsistent', (data) => { metric(data, 'us', 'policy').latest.valueUpper += 1; }],
  ['interval en un indicador que no és un tipus', (data) => {
    const target = metric(data);
    for (const point of target.series) point.valueUpper = point.value + 1;
    target.latest = { ...target.series.at(-1) };
  }],
  ['estat de publicació desconegut', (data) => { metric(data).latestStatus = 'invented'; }],
];

for (const [description, mutate] of invalidSnapshots) {
  test(`La validació rebutja ${description}`, () => {
    const data = clone();
    mutate(data);
    assert.throws(() => validateSnapshot(data));
  });
}

test('Només s’accepten fonts HTTPS oficials sense credencials a l’URL', () => {
  assert.equal(sourceUrl('https://fred.stlouisfed.org/series/GDPC1'), 'https://fred.stlouisfed.org/series/GDPC1');
  for (const invalid of ['http://fred.stlouisfed.org/series/GDPC1', 'https://example.com/data', 'https://fred.stlouisfed.org.example.com/data', 'https://user:password@fred.stlouisfed.org/data']) {
    assert.throws(() => sourceUrl(invalid));
    const data = clone();
    metric(data).dataUrl = invalid;
    assert.throws(() => validateSnapshot(data));
  }
});

test('La renderització és determinista, no modifica les dades i genera setze gràfics i quatre pestanyes', () => {
  const data = clone();
  const before = JSON.stringify(data);
  const html = renderDashboard(data);
  assert.equal(renderDashboard(data), html);
  assert.equal(JSON.stringify(data), before);
  assert.equal(count(html, /<article class="economy-metric"/g), 16);
  assert.equal(count(html, /<svg class="economy-chart"/g), 16);
  assert.equal(count(html, /role="tab"/g), 4);
  assert.equal(count(html, /role="tabpanel"/g), 4);
  assert.equal(count(html, /aria-selected="true"/g), 1);
  assert.equal(count(html, /role="tabpanel"[^>]* hidden/g), 3);
  assert.doesNotMatch(html, /NaN|Infinity|undefined/);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'Els identificadors accessibles han de ser únics.');
});

test('Els setze gràfics generats i publicats tenen quatre dates vàlides a la posició cronològica exacta', async () => {
  const data = clone();
  const before = JSON.stringify(data);
  const documents = [renderDashboard(data), await fs.readFile(path.join(root, 'index.html'), 'utf8')];
  const monthLabel = /^(?:\d{1,2} )?(?:gen\.|feb\.|febr\.|març|abr\.|maig|juny|jul\.|ag\.|set\.|oct\.|nov\.|des\.)$/;
  for (const html of documents) {
    for (const region of data.regions) {
      for (const indicator of INDICATORS) {
        const target = region.indicators[indicator];
        const id = `economy-${region.id}-${indicator}`;
        const dates = timeAxisTicks(target);
        const ticks = chartTimeTicks(html, id);
        assert.equal(dates.length, 4, `${id}: calen dues dates intermèdies.`);
        assert.equal(new Set(dates).size, 4, `${id}: no es poden repetir dates.`);
        assert.equal(dates[0], target.series[0].period);
        assert.equal(dates.at(-1), target.series.at(-1).period);
        assert.deepEqual(ticks.map((tick) => tick.period), dates);
        const firstTime = Date.parse(periodEnd(dates[0]));
        const lastTime = Date.parse(periodEnd(dates.at(-1)));
        let previousTime = firstTime - 1;
        for (const [index, tick] of ticks.entries()) {
          const time = Date.parse(periodEnd(tick.period));
          assert.ok(Number.isFinite(time) && time > previousTime && time <= lastTime);
          const expectedX = Number((45 + (time - firstTime) / (lastTime - firstTime) * 303).toFixed(2));
          const tickMark = tick.content.match(/<line x1="([^"]+)" x2="([^"]+)"/);
          const label = tick.content.match(/<text x="([^"]+)"[^>]*text-anchor="([^"]+)"/);
          assert.ok(tickMark && label, `${id}: falten la marca i l’etiqueta.`);
          assert.equal(Number(tickMark[1]), expectedX);
          assert.equal(Number(tickMark[2]), expectedX);
          assert.equal(Number(label[1]), expectedX);
          assert.equal(label[2], index === 0 ? 'start' : index === 3 ? 'end' : 'middle');
          const parts = [...tick.content.matchAll(/<tspan\b([^>]*)>([^<]*)<\/tspan>/g)];
          assert.equal(parts.length, 2, `${id}: la data i l’any han d’ocupar dues línies.`);
          assert.equal(parts[1][2], tick.period.slice(0, 4));
          const lineShift = parts[1][1].match(/\bdy="([^"]+)"/);
          assert.ok(lineShift && Number(lineShift[1]) > 0);
          for (const part of parts) {
            const partX = part[1].match(/\bx="([^"]+)"/);
            assert.ok(partX);
            assert.equal(Number(partX[1]), expectedX);
          }
          if (target.frequency === 'Trimestral') {
            assert.match(tick.period, /^\d{4}-Q[1-4]$/);
            assert.equal(parts[0][2], `${tick.period.at(-1)}T`);
          } else {
            assert.match(tick.period, /^\d{4}-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01]))?$/);
            assert.match(parts[0][2], monthLabel);
            if (tick.period.length === 10) assert.ok(parts[0][2].startsWith(`${Number(tick.period.slice(8, 10))} `));
          }
          previousTime = time;
        }
        assert.equal(count(chartContents(html, id), /class="economy-chart-time-guide"/g), 2);
      }
    }
    assert.doesNotMatch(html, /NaN|Infinity|undefined/);
  }
  assert.equal(JSON.stringify(data), before, 'Les marques de l’eix no poden alterar les observacions.');
});

for (const [indicator, periods, expected] of [
  ['inflation', ['2024-01', '2024-10'], ['2024-01', '2024-04', '2024-07', '2024-10']],
  ['gdp', ['2023-Q1', '2024-Q4'], ['2023-Q1', '2023-Q3', '2024-Q2', '2024-Q4']],
  ['policy', ['2024-01-31', '2024-10-31'], ['2024-01-31', '2024-05-01', '2024-08-01', '2024-10-31']],
]) {
  test(`Les dates de l’eix de ${indicator} segueixen el calendari, independentment del nombre d’observacions`, () => {
    const data = clone();
    const series = periods.map((period) => indicator === 'policy' ? { period, value: 3.75, valueUpper: 4 } : { period, value: 2 });
    const target = setSeries(data, indicator, series);
    const before = JSON.stringify(series);
    assert.deepEqual(timeAxisTicks(target), expected);
    const html = renderDashboard(data);
    assert.deepEqual(chartTimeTicks(html, `economy-us-${indicator}`).map((tick) => tick.period), expected);
    assert.equal(JSON.stringify(target.series), before);
    assert.doesNotMatch(html, /NaN|Infinity|undefined/);
  });
}

test('Una data de l’eix en un mes sense dada no afegeix cap punt ni omple el buit de la línia', () => {
  const data = clone();
  const series = ['2024-01', '2024-03', '2024-04', '2024-09', '2024-10']
    .map((period, index) => ({ period, value: 2 + index / 10 }));
  const target = setSeries(data, 'inflation', series);
  const before = JSON.stringify(data);
  const html = renderDashboard(data);
  assert.deepEqual(timeAxisTicks(target), ['2024-01', '2024-04', '2024-07', '2024-10']);
  assert.ok(!target.series.some((point) => point.period === '2024-07'));
  assert.equal(JSON.stringify(data), before);
  const [line] = chartPaths(html, 'economy-us-inflation');
  assert.equal(count(line, /M/g), 3);
  assert.equal(count(line, /L/g), 2);
  assert.equal(count(line, /M|L/g), series.length);
});

test('Els historials curts mantenen dues o tres dates llegibles i no generen períodes impossibles', () => {
  for (const [indicator, periods, expected] of [
    ['inflation', ['2024-01', '2024-02'], ['2024-01', '2024-02']],
    ['inflation', ['2024-01', '2024-02', '2024-03'], ['2024-01', '2024-02', '2024-03']],
    ['gdp', ['2024-Q1', '2024-Q2'], ['2024-Q1', '2024-Q2']],
    ['policy', ['2024-02-28', '2024-02-29'], ['2024-02-28', '2024-02-29']],
  ]) {
    const data = clone();
    const target = setSeries(data, indicator, periods.map((period) =>
      indicator === 'policy' ? { period, value: 3.75, valueUpper: 4 } : { period, value: 2 }));
    assert.deepEqual(timeAxisTicks(target), expected);
    const html = renderDashboard(data);
    const ticks = chartTimeTicks(html, `economy-us-${indicator}`);
    assert.deepEqual(ticks.map((tick) => tick.period), expected);
    assert.equal(new Set(ticks.map((tick) => tick.period)).size, expected.length);
    for (const tick of ticks) assert.ok(Number.isFinite(Date.parse(periodEnd(tick.period))));
    if (indicator === 'policy') {
      assert.match(ticks[0].content, />28 feb\.<\/tspan>/);
      assert.match(ticks[1].content, />29 feb\.<\/tspan>/);
    }
    assert.doesNotMatch(html, /NaN|Infinity|undefined/);
  }
});

test('Els textos i les adreces de les fonts s’escapen abans de generar HTML', () => {
  const payload = '<img src=x onerror="boom()">&\'';
  const data = clone();
  data.regions[0].name = payload;
  data.regions[0].note = payload;
  const target = metric(data);
  target.definition = payload;
  target.sourceName = payload;
  target.note = payload;
  target.sourceUrl = 'https://fred.stlouisfed.org/series/CPIAUCNS?a=1&b=2';
  const html = renderDashboard(data);
  assert.equal(escapeHtml('&<>"\''), '&amp;&lt;&gt;&quot;&#39;');
  assert.ok(html.includes(escapeHtml(payload)));
  assert.ok(html.includes('CPIAUCNS?a=1&amp;b=2'));
  assert.ok(!html.includes(payload));
  assert.doesNotMatch(html, /<img\b/);
});

for (const [indicator, periods] of [
  ['inflation', ['2024-01', '2024-02', '2024-04']],
  ['gdp', ['2024-Q1', '2024-Q2', '2024-Q4']],
]) {
  test(`El gràfic de ${indicator} interromp la línia quan falta un període`, () => {
    const data = clone();
    setSeries(data, indicator, periods.map((period, index) => ({ period, value: 2 + index / 10 })));
    const html = renderDashboard(data);
    const [line] = chartPaths(html, `economy-us-${indicator}`);
    assert.equal(count(line, /M/g), 2);
    assert.equal(count(line, /L/g), 1);
    assert.doesNotMatch(html, /NaN|Infinity|undefined/);
  });
}

test('El rang de la Fed conserva dos límits i traça esglaons entre els canvis', () => {
  const data = clone();
  const target = setSeries(data, 'policy', [
    { period: '2024-01-01', value: 0, valueUpper: 0.25 },
    { period: '2024-06-01', value: 3.75, valueUpper: 4 },
    { period: '2024-10-01', value: 3.75, valueUpper: 4 },
  ]);
  target.lineType = 'step';
  const html = renderDashboard(data);
  const paths = chartPaths(html, 'economy-us-policy');
  assert.equal(paths.length, 2);
  for (const line of paths) {
    assert.equal(count(line, /M/g), 1);
    assert.equal(count(line, /H/g), 2);
    assert.equal(count(line, /V/g), 2);
    assert.doesNotMatch(line, /L|NaN|Infinity/);
  }
  assert.ok(html.includes('3,75–4,00'));
});

test('Una sèrie constant manté coordenades finites al gràfic', () => {
  const data = clone();
  setSeries(data, 'inflation', [{ period: '2024-01', value: 0 }, { period: '2024-02', value: 0 }]);
  assert.doesNotMatch(renderDashboard(data), /NaN|Infinity|undefined/);
});

test('L’avís de provisionalitat correspon a l’estat de l’última observació', () => {
  const data = clone();
  const target = metric(data);
  target.latestStatus = 'estimated';
  let html = renderDashboard(data);
  assert.match(html, /· Estimació<\/span>/);
  target.latestStatus = '';
  target.note = 'Dades provisionals en una observació antiga.';
  html = renderDashboard(data);
  const card = html.match(/<article[^>]*aria-labelledby="economy-us-inflation-heading">([\s\S]*?)<\/article>/);
  assert.ok(card);
  assert.ok(!card[1].includes('economy-estimate'));
});

test('La substitució només modifica el bloc marcat i és idempotent', async () => {
  const original = await fs.readFile(path.join(root, 'index.html'), 'utf8');
  const start = original.indexOf(START);
  const end = original.indexOf(END);
  assert.ok(start >= 0 && end > start);
  const prefix = original.slice(0, start);
  const suffix = original.slice(end + END.length);
  const next = replaceDashboard(original, snapshot);
  assert.equal(next, prefix + renderDashboard(snapshot) + suffix);
  assert.equal(replaceDashboard(next, snapshot), next);
  const synthetic = `AUTOR: <script>const x = "&";</script>\r\n${START}antiga${END}\r\nFINAL sense normalitzar`;
  assert.equal(replaceDashboard(synthetic, snapshot), `AUTOR: <script>const x = "&";</script>\r\n${renderDashboard(snapshot)}\r\nFINAL sense normalitzar`);
});

test('La substitució rebutja marcadors absents, repetits o desordenats', () => {
  for (const html of ['', `${START}bloc`, `bloc${END}`, `${END}${START}`, `${START}${START}${END}`, `${START}${END}${END}`]) {
    assert.throws(() => replaceDashboard(html, snapshot), /únic bloc/);
  }
});

test('Una font fallida deixa intactes JSON i HTML sense accedir a la xarxa', async (context) => {
  // Run the real updater in an isolated temporary checkout. Every fetch throws,
  // so this test neither contacts an agency nor risks the published files.
  const tempPrefix = path.join(os.tmpdir(), 'lardit-economy-test-');
  const temporary = await fs.mkdtemp(tempPrefix);
  assert.ok(path.resolve(temporary).startsWith(path.resolve(tempPrefix)));
  context.after(async () => {
    assert.ok(path.resolve(temporary).startsWith(path.resolve(tempPrefix)));
    await fs.rm(temporary, { recursive: true, force: true, maxRetries: 3 });
  });
  const scripts = path.join(temporary, 'scripts/economy');
  const dataDirectory = path.join(temporary, 'assets/data');
  await fs.mkdir(scripts, { recursive: true });
  await fs.mkdir(dataDirectory, { recursive: true });
  for (const name of await fs.readdir(path.join(root, 'scripts/economy'))) {
    if (name.endsWith('.mjs') && name !== 'test.mjs') {
      await fs.copyFile(path.join(root, 'scripts/economy', name), path.join(scripts, name));
    }
  }
  const dataFile = path.join(dataDirectory, 'economy.json');
  const htmlFile = path.join(temporary, 'index.html');
  const oldData = JSON.stringify(snapshot);
  const oldHtml = `AUTOR${START}última còpia publicada${END}FINAL`;
  await fs.writeFile(dataFile, oldData);
  await fs.writeFile(htmlFile, oldHtml);
  const child = spawnSync(process.execPath, ['--input-type=module', '-e',
    'globalThis.fetch = async () => { throw new Error("offline source failure"); }; await import("./scripts/economy/update.mjs");',
  ], { cwd: temporary, encoding: 'utf8', timeout: 15000 });
  assert.ifError(child.error);
  assert.equal(child.status, 1);
  assert.match(child.stderr, /offline source failure/);
  assert.equal(await fs.readFile(dataFile, 'utf8'), oldData);
  assert.equal(await fs.readFile(htmlFile, 'utf8'), oldHtml);
  assert.ok(!(await fs.readdir(dataDirectory)).some((name) => name.includes('.pending-')));
});
