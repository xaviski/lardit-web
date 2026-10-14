const FRED_DOWNLOAD = 'https://fred.stlouisfed.org/graph/fredgraph.csv';

function calendarDate(input) {
  const date = input instanceof Date ? input.toISOString().slice(0, 10) : String(input).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) ||
      new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
    throw new Error(`Data de tall dels EUA no vàlida: ${input}`);
  }
  return date;
}

function downloadUrl(ids, start, end) {
  const url = new URL(FRED_DOWNLOAD);
  url.searchParams.set('id', ids.join(','));
  url.searchParams.set('cosd', start);
  url.searchParams.set('coed', end);
  return url.href;
}

function parseFredCsv(text, ids, asOf) {
  // FRED's CSV export uses ISO dates and plain numeric fields. Missing values
  // can be empty or "."; they must never become a zero or shift a y/y lag.
  const lines = String(text).replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  const header = lines.shift()?.split(',').map((field) => field.trim().replace(/^"|"$/g, ''));
  const dateColumn = header?.findIndex((field) => field === 'observation_date' || field === 'DATE');
  const columns = ids.map((id) => header?.indexOf(id) ?? -1);
  if (dateColumn === undefined || dateColumn < 0 || columns.some((column) => column < 0)) {
    throw new Error(`CSV de FRED no reconegut: ${ids.join(', ')}`);
  }

  const observations = new Map();
  for (const line of lines) {
    if (!line.trim()) continue;
    const fields = line.split(',').map((field) => field.trim().replace(/^"|"$/g, ''));
    const date = fields[dateColumn];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') || date > asOf) continue;
    const values = columns.map((column) => {
      const field = fields[column];
      return field && field !== '.' ? Number(field) : NaN;
    });
    if (values.some((value) => !Number.isFinite(value))) continue;
    if (observations.has(date)) throw new Error(`Observació duplicada de FRED: ${date}`);
    observations.set(date, { date, values });
  }
  const rows = [...observations.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (!rows.length) throw new Error(`FRED no ha retornat dades dels EUA: ${ids.join(', ')}`);
  return rows;
}

function monthlyPeriod(date) {
  return date.slice(0, 7);
}

function quarterlyPeriod(date) {
  return `${date.slice(0, 4)}-Q${Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1}`;
}

function periodEnd(date, frequency) {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const lastMonth = frequency === 'quarterly' ? Math.ceil(month / 3) * 3 : month;
  return new Date(Date.UTC(year, lastMonth, 0)).toISOString().slice(0, 10);
}

function yearOnYear(rows, frequency, asOf, length) {
  const toPeriod = frequency === 'quarterly' ? quarterlyPeriod : monthlyPeriod;
  const levels = new Map(rows.map((row) => [toPeriod(row.date), row.values[0]]));
  return rows.filter((row) => periodEnd(row.date, frequency) <= asOf).flatMap((row) => {
    const period = toPeriod(row.date);
    const previousPeriod = `${Number(period.slice(0, 4)) - 1}${period.slice(4)}`;
    const previousValue = levels.get(previousPeriod);
    if (!Number.isFinite(previousValue) || previousValue <= 0) return [];
    return [{ period, value: 100 * (row.values[0] / previousValue - 1) }];
  }).slice(-length);
}

function policyChanges(rows, start) {
  const daily = rows.filter((row) => row.date >= start).map((row) => ({
    period: row.date,
    value: row.values[0],
    valueUpper: row.values[1],
  }));
  if (daily.some((point) => point.value > point.valueUpper)) {
    throw new Error('El límit inferior del rang de la Fed supera el superior.');
  }
  const changes = daily.filter((point, index) => index === 0 ||
    point.value !== daily[index - 1].value || point.valueUpper !== daily[index - 1].valueUpper);
  // Keep the latest observed day so the final step reaches the current range.
  const latest = daily.at(-1);
  if (latest && changes.at(-1)?.period !== latest.period) changes.push(latest);
  return changes;
}

function metric(metadata, series) {
  if (!series.length) throw new Error(`Sèrie dels EUA buida: ${metadata.label}`);
  return { ...metadata, unit: '%', series, latest: { ...series.at(-1) } };
}

/**
 * Public FRED graph downloads need no API key. BEA/BLS/Federal Reserve are
 * the originating agencies; FRED publishes their levels and target limits.
 * asOf bounds observation periods, not historical publication vintages.
 */
export async function fetchUS({ asOf, fetchText }) {
  if (typeof fetchText !== 'function') throw new Error('Cal fetchText per obtenir les dades dels EUA.');
  const cutoff = calendarDate(asOf);
  const year = Number(cutoff.slice(0, 4));
  // One extra year is required to calculate each interannual observation.
  const levelStart = `${year - 7}-01-01`;
  const policyStart = new Date(Date.UTC(
    year - 5, Number(cutoff.slice(5, 7)) - 1, Number(cutoff.slice(8, 10)),
  )).toISOString().slice(0, 10);
  const urls = {
    gdp: downloadUrl(['GDPC1'], levelStart, cutoff),
    inflation: downloadUrl(['CPIAUCNS'], levelStart, cutoff),
    unemployment: downloadUrl(['UNRATE'], levelStart, cutoff),
    policy: downloadUrl(['DFEDTARL', 'DFEDTARU'], policyStart, cutoff),
  };
  const [gdpText, inflationText, unemploymentText, policyText] = await Promise.all([
    fetchText(urls.gdp),
    fetchText(urls.inflation),
    fetchText(urls.unemployment),
    fetchText(urls.policy),
  ]);
  const gdp = yearOnYear(parseFredCsv(gdpText, ['GDPC1'], cutoff), 'quarterly', cutoff, 20);
  const inflation = yearOnYear(parseFredCsv(inflationText, ['CPIAUCNS'], cutoff), 'monthly', cutoff, 60);
  const unemployment = parseFredCsv(unemploymentText, ['UNRATE'], cutoff)
    .filter((row) => periodEnd(row.date, 'monthly') <= cutoff)
    .map((row) => ({ period: monthlyPeriod(row.date), value: row.values[0] })).slice(-60);
  const policy = policyChanges(parseFredCsv(policyText, ['DFEDTARL', 'DFEDTARU'], cutoff), policyStart);

  return {
    us: {
      id: 'us',
      name: 'EUA',
      note: 'PIB real, IPC general i atur dels organismes estadístics dels EUA; rang objectiu de la Reserva Federal. Dades distribuïdes per FRED.',
      indicators: {
        gdp: metric({
          label: 'PIB real',
          frequency: 'Trimestral',
          definition: 'Canvi de l’activitat econòmica, descomptant l’efecte dels preus, respecte del mateix trimestre de l’any anterior.',
          sourceName: 'BEA · FRED (Reserva Federal de St. Louis)',
          sourceUrl: 'https://fred.stlouisfed.org/series/GDPC1',
          dataUrl: urls.gdp,
          note: 'Calculat a partir de GDPC1, desestacionalitzat i en dòlars encadenats de 2017: 100 × (nivell actual / nivell de fa un any − 1). És creixement interanual, no trimestral anualitzat; les dades poden ser revisades.',
        }, gdp),
        inflation: metric({
          label: 'Inflació',
          frequency: 'Mensual',
          definition: 'Canvi de l’índex general de preus de consum (CPI-U) respecte del mateix mes de l’any anterior.',
          sourceName: 'BLS · FRED (Reserva Federal de St. Louis)',
          sourceUrl: 'https://fred.stlouisfed.org/series/CPIAUCNS',
          dataUrl: urls.inflation,
          note: 'IPC de tots els articles per als consumidors urbans (CPI-U), sense ajust estacional: 100 × (índex actual / índex del mateix mes de l’any anterior − 1). Els mesos sense observació oficial queden fora de la sèrie.',
        }, inflation),
        unemployment: metric({
          label: 'Atur',
          frequency: 'Mensual',
          definition: 'Taxa U-3: persones aturades com a percentatge de la població activa civil de 16 anys o més, amb ajust estacional.',
          sourceName: 'BLS · FRED (Reserva Federal de St. Louis)',
          sourceUrl: 'https://fred.stlouisfed.org/series/UNRATE',
          dataUrl: urls.unemployment,
          note: 'Enquesta Current Population Survey. Els mesos sense observació oficial queden fora de la sèrie; les dades poden ser revisades.',
        }, unemployment),
        policy: metric({
          label: 'Tipus d’interès',
          frequency: 'Quan canvia',
          definition: 'Rang objectiu del tipus dels fons federals fixat pel FOMC; es conserven el límit inferior i el superior.',
          sourceName: 'Reserva Federal · FRED (St. Louis)',
          sourceUrl: 'https://www.federalreserve.gov/economy-at-a-glance-policy-rate.htm',
          dataUrl: urls.policy,
          lineType: 'step',
          note: 'Sèries DFEDTARL i DFEDTARU. Es mostren els canvis del rang i l’últim dia observat; les dates corresponen a l’entrada en vigor.',
        }, policy),
      },
    },
  };
}
