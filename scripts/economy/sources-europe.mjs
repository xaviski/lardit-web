const EUROSTAT_API = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/';
const EUROSTAT_BROWSER = 'https://ec.europa.eu/eurostat/databrowser/view/';
const ECB_API = 'https://data-api.ecb.europa.eu/service/data/FM/D.U2.EUR.4F.KR.DFR.LEV';
const ECB_SOURCE = 'https://data.ecb.europa.eu/data/datasets/FM/FM.D.U2.EUR.4F.KR.DFR.LEV';

const FLAG_NAMES = {
  b: 'ruptura de la sèrie',
  d: 'definició diferent',
  e: 'estimació',
  f: 'previsió',
  p: 'dada provisional',
  r: 'dada revisada',
  u: 'fiabilitat reduïda',
};

function isoDate(asOf) {
  const date = asOf instanceof Date ? asOf.toISOString().slice(0, 10) : String(asOf).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
    throw new Error('Europe: asOf ha de ser una data ISO vàlida.');
  }
  return date;
}

function eurostatUrl(dataset, filters, from, to) {
  const url = new URL(`${EUROSTAT_API}${dataset}`);
  url.searchParams.set('lang', 'en');
  for (const [dimension, codes] of Object.entries(filters)) {
    for (const code of Array.isArray(codes) ? codes : [codes]) url.searchParams.append(dimension, code);
  }
  url.searchParams.set('sinceTimePeriod', from);
  url.searchParams.set('untilTimePeriod', to);
  return url.href;
}

function categoryEntries(dataset, dimension) {
  const index = dataset.dimension?.[dimension]?.category?.index;
  if (Array.isArray(index)) return index.map((code, position) => [code, position]);
  if (index && typeof index === 'object') return Object.entries(index);
  throw new Error(`Eurostat: falta la dimensió ${dimension}.`);
}

// JSON-stat stores cells in row-major dimension order; missing cells are absent,
// not zero. Only the explicitly selected geography is allowed through.
function eurostatRecords(dataset, geo, asOf, limit) {
  if (dataset.class !== 'dataset' || !Array.isArray(dataset.id) || !Array.isArray(dataset.size)) {
    throw new Error(`Eurostat: resposta no vàlida (${dataset.error?.label || geo}).`);
  }
  const geoPosition = dataset.id.indexOf('geo');
  const timePosition = dataset.id.indexOf('time');
  const geoEntry = categoryEntries(dataset, 'geo').find(([code]) => code === geo);
  if (geoPosition < 0 || timePosition < 0 || !geoEntry) throw new Error(`Eurostat: geografia ${geo} no disponible.`);
  for (let i = 0; i < dataset.id.length; i += 1) {
    if (i !== geoPosition && i !== timePosition && dataset.size[i] !== 1) {
      throw new Error(`Eurostat: filtre ambigu per a ${dataset.id[i]}.`);
    }
  }
  const strides = dataset.size.map((_, position) => dataset.size.slice(position + 1).reduce((a, b) => a * b, 1));
  return categoryEntries(dataset, 'time')
    .map(([period, timeIndex]) => {
      const cell = Number(geoEntry[1]) * strides[geoPosition] + Number(timeIndex) * strides[timePosition];
      const value = dataset.value?.[cell];
      return { period, value, flag: dataset.status?.[cell] || '' };
    })
    .filter(({ period, value, flag }) => Number.isFinite(value) && periodEndsBy(period, asOf) && !String(flag).includes('f'))
    .sort((a, b) => a.period.localeCompare(b.period))
    .slice(-limit);
}

function periodEndsBy(period, asOf) {
  let end;
  if (/^\d{4}-Q[1-4]$/.test(period)) {
    end = new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.at(-1)) * 3, 0)).toISOString().slice(0, 10);
  } else if (/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
    end = new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5)), 0)).toISOString().slice(0, 10);
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(period)) {
    end = period;
  } else {
    throw new Error(`Europe: període desconegut ${period}.`);
  }
  return end <= asOf;
}

function flagDescription(flag, dataset) {
  return String(flag).trim().split(/\s+/).filter(Boolean).map((code) => {
    if (FLAG_NAMES[code]) return `${FLAG_NAMES[code]} (${code})`;
    if ([...code].every((letter) => FLAG_NAMES[letter])) {
      return [...code].map((letter) => `${FLAG_NAMES[letter]} (${letter})`).join(', ');
    }
    return `${dataset.extension?.status?.label?.[code] || 'marca de qualitat'} (${code})`;
  }).join(', ');
}

function statusNote(records, dataset) {
  const flags = [...new Set(records.map(({ flag }) => flag).filter(Boolean))];
  const latestFlag = records.at(-1)?.flag;
  const parts = [];
  if (latestFlag) parts.push(`Última observació: ${flagDescription(latestFlag, dataset)}.`);
  if (flags.length) parts.push(`Marques d’Eurostat en l’historial: ${flags.map((flag) => flagDescription(flag, dataset)).join('; ')}.`);
  parts.push('Les dades oficials es poden revisar.');
  return parts.join(' ');
}

function latestStatus(records) {
  const flag = String(records.at(-1)?.flag || '');
  if (flag.includes('e')) return 'estimated';
  if (flag.includes('p')) return 'provisional';
  return '';
}

function metric({ dataset, geo, asOf, limit, label, frequency, definition, dataUrl, note = '' }) {
  const records = eurostatRecords(dataset, geo, asOf, limit);
  if (!records.length) throw new Error(`Eurostat: sèrie buida per a ${label}, ${geo}.`);
  const series = records.map(({ period, value }) => ({ period, value }));
  return {
    label,
    unit: '%',
    frequency,
    definition,
    sourceName: 'Eurostat',
    sourceUrl: `${EUROSTAT_BROWSER}${dataset.extension?.id?.toLowerCase() || new URL(dataUrl).pathname.split('/').at(-1)}/default/table?lang=en`,
    dataUrl,
    series,
    latest: { ...series.at(-1) },
    latestStatus: latestStatus(records),
    note: [note, statusNote(records, dataset)].filter(Boolean).join(' '),
  };
}

function euroAreaComposition(dataset, asOf) {
  // GDP's EA code is the official changing-composition aggregate. Its label
  // identifies which fixed-composition code unemployment uses in each year.
  const label = dataset.dimension?.geo?.category?.label?.EA || '';
  const compositions = [...label.matchAll(/EA(\d+)-(\d{4})/g)]
    .map((match) => ({ code: `EA${match[1]}`, countries: Number(match[1]), year: Number(match[2]) }))
    .filter(({ year }) => year <= Number(asOf.slice(0, 4)))
    .sort((a, b) => a.year - b.year);
  if (!compositions.length) throw new Error('Eurostat: no es pot identificar la composició vigent de la zona euro.');
  return compositions.at(-1);
}

function csvRows(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const source = String(text).replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (char === '"') {
      if (quoted && source[i + 1] === '"') { field += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(field); field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && source[i + 1] === '\n') i += 1;
      row.push(field);
      if (row.some((value) => value !== '')) rows.push(row);
      row = []; field = '';
    } else field += char;
  }
  if (quoted) throw new Error('ECB: CSV amb cometes sense tancar.');
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

async function policyMetric({ asOf, fetchText }) {
  const start = new Date(`${asOf}T00:00:00Z`);
  start.setUTCFullYear(start.getUTCFullYear() - 5);
  const dataUrl = `${ECB_API}?format=csvdata&startPeriod=${start.toISOString().slice(0, 10)}&endPeriod=${asOf}`;
  const rows = csvRows(await fetchText(dataUrl));
  const header = rows.shift() || [];
  const columns = Object.fromEntries(header.map((name, position) => [name, position]));
  for (const column of ['KEY', 'TIME_PERIOD', 'OBS_VALUE', 'OBS_STATUS', 'UNIT']) {
    if (!(column in columns)) throw new Error(`ECB: falta la columna ${column}.`);
  }
  const daily = rows.filter((row) => row[columns.KEY] === 'FM.D.U2.EUR.4F.KR.DFR.LEV' && row[columns.UNIT] === 'PCPA')
    .map((row) => ({ period: row[columns.TIME_PERIOD], value: row[columns.OBS_VALUE] === '' ? NaN : Number(row[columns.OBS_VALUE]), flag: row[columns.OBS_STATUS] }))
    .filter(({ period, value, flag }) => Number.isFinite(value) && periodEndsBy(period, asOf) && flag !== 'F')
    .sort((a, b) => a.period.localeCompare(b.period));
  if (!daily.length) throw new Error('ECB: sèrie del tipus de dipòsit buida.');
  const changes = daily.filter((point, position) => position === 0 || point.value !== daily[position - 1].value);
  const lastChange = changes.at(-1);
  const lastObservation = daily.at(-1);
  const series = changes.map(({ period, value }) => ({ period, value }));
  // A real final daily observation keeps the horizontal step visible up to the
  // last date confirmed by the source; it does not invent a policy change.
  if (series.at(-1).period !== lastObservation.period) series.push({ period: lastObservation.period, value: lastObservation.value });
  const flags = [...new Set(daily.map(({ flag }) => flag).filter((flag) => flag && flag !== 'A'))];
  return {
    label: 'Tipus de dipòsit del BCE',
    unit: '%',
    frequency: 'Quan canvia',
    definition: 'Tipus anual de la facilitat de dipòsit del Banc Central Europeu; referència compartida pels països de la zona euro.',
    sourceName: 'Banc Central Europeu',
    sourceUrl: ECB_SOURCE,
    dataUrl,
    lineType: 'step',
    series,
    latest: { period: lastObservation.period, value: lastObservation.value },
    latestStatus: '',
    note: `Sèrie diària oficial resumida als canvis de tipus, amb una observació inicial i una de final. Últim canvi dins de l’historial: ${lastChange.period}; valor confirmat fins al ${lastObservation.period}.${flags.length ? ` Marques de l’ECB: ${flags.join(', ')}.` : ''}`,
  };
}

/** Fetch a bounded recent history from the official sources, without forecasts.
 * asOf bounds reference periods, not historical publication/revision vintages.
 */
export async function fetchEurope({ asOf, fetchText, fetchJson }) {
  const date = isoDate(asOf);
  const year = Number(date.slice(0, 4));
  const month = date.slice(0, 7);
  const quarter = `${year}-Q${Math.ceil(Number(date.slice(5, 7)) / 3)}`;
  const fromYear = year - 6;
  const gdpUrl = eurostatUrl('namq_10_gdp', {
    freq: 'Q', unit: 'CLV_PCH_SM', s_adj: 'SCA', na_item: 'B1GQ', geo: ['ES', 'EA'],
  }, `${fromYear}-Q1`, quarter);
  const inflationUrl = eurostatUrl('prc_hicp_minr', {
    freq: 'M', unit: 'RCH_A', coicop18: 'TOTAL', geo: ['ES', 'EA'],
  }, `${fromYear}-01`, month);
  const [gdp, inflation, policy] = await Promise.all([
    fetchJson(gdpUrl), fetchJson(inflationUrl), policyMetric({ asOf: date, fetchText }),
  ]);
  const composition = euroAreaComposition(gdp, date);
  const unemploymentUrl = eurostatUrl('une_rt_m', {
    freq: 'M', unit: 'PC_ACT', s_adj: 'SA', sex: 'T', age: 'TOTAL', geo: ['ES', composition.code],
  }, `${fromYear}-01`, month);
  const unemployment = await fetchJson(unemploymentUrl);

  const indicators = (geo, unemploymentGeo) => ({
    gdp: metric({
      dataset: gdp, geo, asOf: date, limit: 20, label: 'Creixement del PIB real', frequency: 'Trimestral',
      definition: 'Canvi de l’activitat econòmica, descomptant l’efecte dels preus, respecte del mateix trimestre de l’any anterior.',
      dataUrl: gdpUrl,
    }),
    inflation: metric({
      dataset: inflation, geo, asOf: date, limit: 60, label: 'Inflació interanual', frequency: 'Mensual',
      definition: 'Variació de l’índex harmonitzat de preus de consum (IPCH) respecte del mateix mes de l’any anterior, conjunt de béns i serveis.',
      dataUrl: inflationUrl,
      note: 'IPCH total; classificació ECOICOP versió 2 (COICOP 2018), vigent des de 2026.',
    }),
    unemployment: metric({
      dataset: unemployment, geo: unemploymentGeo, asOf: date, limit: 60, label: 'Taxa d’atur', frequency: 'Mensual',
      definition: 'Persones aturades com a percentatge de la població activa de 15 a 74 anys; ambdós sexes, amb ajust estacional.',
      dataUrl: unemploymentUrl,
      note: geo === 'EA' ? `Agregat ${composition.code}: composició de ${composition.countries} països vigent des de ${composition.year}, aplicada a tot l’historial.` : '',
    }),
    policy: { ...policy, series: policy.series.map((point) => ({ ...point })), latest: { ...policy.latest } },
  });

  return {
    es: { id: 'es', name: 'Espanya', note: '', indicators: indicators('ES', 'ES') },
    ea: {
      id: 'ea', name: 'Zona euro',
      note: `PIB i IPCH: zona euro de composició variable. Atur: ${composition.code}, composició de ${composition.countries} països vigent des de ${composition.year}.`,
      indicators: indicators('EA', composition.code),
    },
  };
}
