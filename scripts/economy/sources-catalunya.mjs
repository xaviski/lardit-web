// Official Catalan GDP and INE CPI/EPA adapters. Keep source metadata checks
// strict so a changed series cannot silently become a different indicator.
const GDP_PAGE = 'https://www.idescat.cat/pub/?id=pibt&n=10231&col=3';
const GDP_DATA = `${GDP_PAGE}&f=ssv`;
const CPI_DATA = 'https://servicios.ine.es/wstempus/js/ES/DATOS_SERIE/IPC294107?tip=AM&nult=60';
const EPA_DATA = 'https://servicios.ine.es/wstempus/js/ES/DATOS_SERIE/EPA452504?tip=AM&nult=24';

function latestStatus(flag) {
  const value = String(flag).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  if (value === 'p' || value.includes('provisional')) return 'provisional';
  if (value === 'a' || /avance|avanc/.test(value)) return 'advance';
  if (value === 'e' || /estimad|estimat|estimaci/.test(value)) return 'estimated';
  return '';
}

function cutoffDate(asOf) {
  const date = String(asOf ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
    throw new Error('Catalunya: asOf must be an ISO date.');
  }
  return date;
}

function periodEnd(period) {
  const quarter = /^(\d{4})-Q([1-4])$/.exec(period);
  const month = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);
  if (!quarter && !month) throw new Error(`Catalunya: invalid period ${period}.`);
  const year = Number((quarter ?? month)[1]);
  const endMonth = quarter ? Number(quarter[2]) * 3 : Number(month[2]);
  return new Date(Date.UTC(year, endMonth, 0)).toISOString().slice(0, 10);
}

function boundedSeries(observations, asOf, count) {
  const byPeriod = new Map();
  for (const observation of observations) {
    if (!Number.isFinite(observation.value)) continue;
    if (periodEnd(observation.period) > asOf) continue;
    if (byPeriod.has(observation.period)) {
      throw new Error(`Catalunya: duplicate observation for ${observation.period}.`);
    }
    byPeriod.set(observation.period, observation);
  }
  const result = [...byPeriod.values()]
    .sort((a, b) => a.period.localeCompare(b.period))
    .slice(-count);
  if (!result.length) throw new Error(`Catalunya: no observations at or before ${asOf}.`);
  return result;
}

function parseSsvRow(line) {
  const cells = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === ';' && !quoted) {
      cells.push(cell.trim());
      cell = '';
    } else cell += character;
  }
  cells.push(cell.trim());
  return cells;
}

function parseGdp(text, asOf) {
  const lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n/);
  const locationIndex = lines.findIndex((line) => line.trim() === 'Catalunya');
  if (locationIndex < 0 || !/Dades corregides d'estacionalitat/.test(lines[locationIndex - 1] ?? '') ||
      !/Variació interanual en volum \(%\)/.test(lines[locationIndex + 1] ?? '')) {
    throw new Error('Catalunya GDP: source metadata does not match real seasonally adjusted annual growth.');
  }
  const headerIndex = lines.findIndex((line, index) => index > locationIndex && parseSsvRow(line)[1] === 'PIB');
  if (headerIndex < 0) throw new Error('Catalunya GDP: PIB column is missing.');
  const observations = [];
  for (const line of lines.slice(headerIndex + 1)) {
    const cells = parseSsvRow(line);
    const period = /^T([1-4])\/(\d{4})(?:\s*\(([^)]+)\))?$/.exec(cells[0]);
    // The export includes Spain after the Catalan table; stop at that boundary.
    if (!period) break;
    if (cells[1] === '..' || cells[1] === '') continue;
    if (!/^-?\d+(?:,\d+)?$/.test(cells[1])) {
      throw new Error(`Catalunya GDP: unexpected PIB value ${cells[1]}.`);
    }
    observations.push({
      period: `${period[2]}-Q${period[1]}`,
      value: Number(cells[1].replace(',', '.')),
      flag: period[3] ?? '',
    });
  }
  const selected = boundedSeries(observations, asOf, 24);
  const provisional = selected.filter((entry) => entry.flag === 'p').map((entry) => entry.period);
  const estimated = selected.filter((entry) => entry.flag === 'a').map((entry) => entry.period);
  const series = selected.map(({ period, value }) => ({ period, value }));
  const note = [
    'Comptabilitat trimestral, revisió estadística 2024.',
    provisional.length ? `Dades provisionals: ${provisional.join(', ')}.` : '',
    estimated.length ? `Dades d'avanç: ${estimated.join(', ')}.` : '',
  ].filter(Boolean).join(' ');
  return {
    label: 'PIB real',
    unit: '%',
    frequency: 'Trimestral',
    definition: 'Canvi de l’activitat econòmica, descomptant l’efecte dels preus, respecte del mateix trimestre de l’any anterior.',
    sourceName: 'Idescat · Comptabilitat trimestral',
    sourceUrl: GDP_PAGE,
    dataUrl: GDP_DATA,
    series,
    latest: series.at(-1),
    latestStatus: latestStatus(selected.at(-1).flag),
    note,
  };
}

function ineSeries(payload, { code, requiredMetadata, asOf, frequency, count }) {
  const source = Array.isArray(payload) ? payload.find((entry) => entry.COD === code) : payload;
  const metadata = source?.MetaData ?? [];
  if (source?.COD !== code || source.T3_Unidad !== 'Tasas' ||
      !requiredMetadata.every((name) => metadata.some((entry) => entry.Nombre === name)) ||
      !Array.isArray(source.Data)) {
    throw new Error(`Catalunya ${code}: official INE series metadata does not match the requested indicator.`);
  }
  const observations = source.Data.map((entry) => {
    const temporal = frequency === 'Mensual' ? /^M(0[1-9]|1[0-2])$/ : /^T([1-4])$/;
    const match = temporal.exec(entry.T3_Periodo ?? '');
    if (!match || !Number.isInteger(entry.Anyo)) throw new Error(`Catalunya ${code}: invalid INE period.`);
    return {
      period: frequency === 'Mensual' ? `${entry.Anyo}-${match[1]}` : `${entry.Anyo}-Q${match[1]}`,
      // Null or missing observations are omitted, never changed into zero.
      value: typeof entry.Valor === 'number' ? entry.Valor : NaN,
      flag: entry.T3_TipoDato ?? '',
    };
  });
  const selected = boundedSeries(observations, asOf, count);
  const provisional = selected.filter((entry) => /provisional|avance/i.test(entry.flag));
  return {
    series: selected.map(({ period, value }) => ({ period, value })),
    latestStatus: latestStatus(selected.at(-1).flag),
    note: provisional.length ? `Dades provisionals o d'avanç: ${provisional.map((entry) => entry.period).join(', ')}.` : '',
  };
}

export async function fetchCatalunya({ asOf, fetchText, fetchJson }) {
  const cutoff = cutoffDate(asOf);
  const [gdpText, cpiJson, epaJson] = await Promise.all([
    fetchText(GDP_DATA),
    fetchJson(CPI_DATA),
    fetchJson(EPA_DATA),
  ]);
  const cpi = ineSeries(cpiJson, {
    code: 'IPC294107',
    requiredMetadata: ['Cataluña', 'Índice general', 'Variación anual'],
    asOf: cutoff,
    frequency: 'Mensual',
    count: 60,
  });
  const epa = ineSeries(epaJson, {
    code: 'EPA452504',
    requiredMetadata: ['Cataluña', 'Ambos sexos', 'Total', 'Tasa de paro de la población'],
    asOf: cutoff,
    frequency: 'Trimestral',
    count: 24,
  });
  return {
    cat: {
      id: 'cat',
      name: 'Catalunya',
      note: 'IPC general de consum (base 2025) i atur EPA. Les sèries reflecteixen la darrera revisió disponible de les fonts oficials.',
      indicators: {
        gdp: parseGdp(gdpText, cutoff),
        inflation: {
          label: 'Inflació (IPC)',
          unit: '%',
          frequency: 'Mensual',
          definition: 'Canvi de l’índex general de preus de consum (IPC) respecte del mateix mes de l’any anterior.',
          sourceName: 'INE · IPC',
          sourceUrl: 'https://www.ine.es/jaxiT3/Tabla.htm?t=76136',
          dataUrl: CPI_DATA,
          series: cpi.series,
          latest: cpi.series.at(-1),
          latestStatus: cpi.latestStatus,
          note: ['IPC base 2025, grup general ECOICOP v2.', cpi.note].filter(Boolean).join(' '),
        },
        unemployment: {
          label: "Taxa d'atur",
          unit: '%',
          frequency: 'Trimestral',
          definition: "Població desocupada com a percentatge de la població activa de 16 anys o més; ambdós sexes, EPA.",
          sourceName: 'INE · Enquesta de població activa',
          sourceUrl: 'https://www.ine.es/jaxiT3/Tabla.htm?t=65334',
          dataUrl: EPA_DATA,
          series: epa.series,
          latest: epa.series.at(-1),
          latestStatus: epa.latestStatus,
          note: epa.note,
        },
      },
    },
  };
}
