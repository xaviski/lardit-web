export const REGIONS = ['cat', 'es', 'ea', 'us'];
export const INDICATORS = ['gdp', 'inflation', 'unemployment', 'policy'];
const SOURCE_HOSTS = new Set(['www.idescat.cat', 'www.ine.es', 'servicios.ine.es', 'ec.europa.eu', 'data.ecb.europa.eu', 'data-api.ecb.europa.eu', 'fred.stlouisfed.org', 'www.federalreserve.gov']);

export function periodEnd(period) {
  let match = /^(\d{4})-Q([1-4])$/.exec(period);
  if (match) return new Date(Date.UTC(+match[1], +match[2] * 3, 0)).toISOString().slice(0, 10);
  match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);
  if (match) return new Date(Date.UTC(+match[1], +match[2], 0)).toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(period) && new Date(`${period}T00:00:00Z`).toISOString().slice(0, 10) === period) return period;
  throw new Error(`Període invàlid: ${period}`);
}

export function sourceUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !SOURCE_HOSTS.has(url.hostname) || url.username || url.password) throw new Error('Font no autoritzada.');
  return url.href;
}

export function validateSnapshot(snapshot) {
  if (snapshot.version !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(snapshot.asOf) || periodEnd(snapshot.asOf) !== snapshot.asOf) throw new Error('Data de consulta invàlida.');
  if (!Array.isArray(snapshot.regions) || snapshot.regions.map(r => r.id).join(',') !== REGIONS.join(',')) throw new Error('Calen els quatre territoris.');
  for (const region of snapshot.regions) {
    if (typeof region.name !== 'string' || typeof region.note !== 'string') throw new Error('Territori incomplet.');
    for (const key of INDICATORS) {
      const metric = region.indicators?.[key];
      if (!metric || metric.unit !== '%' || !['Trimestral', 'Mensual', 'Quan canvia'].includes(metric.frequency)) throw new Error(`${region.id}/${key}: unitat o freqüència invàlida.`);
      for (const field of ['label','definition','sourceName','sourceUrl','dataUrl','note']) if (typeof metric[field] !== 'string') throw new Error(`${region.id}/${key}: falta ${field}.`);
      if (metric.latestStatus !== undefined && !['','provisional','estimated','advance'].includes(metric.latestStatus)) throw new Error('Estat de publicació invàlid.');
      sourceUrl(metric.sourceUrl); sourceUrl(metric.dataUrl);
      if (!Array.isArray(metric.series) || metric.series.length < 2) throw new Error(`${region.id}/${key}: històric insuficient.`);
      const hasUpper = metric.series[0].valueUpper !== undefined;
      if (hasUpper && key !== 'policy') throw new Error('Només els tipus d’interès poden tenir un interval.');
      let previous = '';
      for (const point of metric.series) {
        if ((point.valueUpper !== undefined) !== hasUpper) throw new Error('Calen els dos límits a tots els punts de l’interval.');
        const end = periodEnd(point.period);
        if (end > snapshot.asOf || end <= previous || !Number.isFinite(point.value)) throw new Error(`${region.id}/${key}: dada futura, duplicada o invàlida.`);
        if (metric.frequency === 'Trimestral' && !/^\d{4}-Q[1-4]$/.test(point.period)) throw new Error('Freqüència trimestral incorrecta.');
        if (metric.frequency === 'Mensual' && !/^\d{4}-(0[1-9]|1[0-2])$/.test(point.period)) throw new Error('Freqüència mensual incorrecta.');
        if (metric.frequency === 'Quan canvia' && !/^\d{4}-\d{2}-\d{2}$/.test(point.period)) throw new Error('Freqüència diària incorrecta.');
        if (key === 'unemployment' && (point.value < 0 || point.value > 100)) throw new Error('Taxa d’atur fora de rang.');
        if (key === 'policy' && (point.value < -10 || point.value > 40)) throw new Error('Tipus d’interès fora de rang.');
        if ((key === 'gdp' || key === 'inflation') && (point.value < -100 || point.value > 100)) throw new Error('Variació percentual fora de rang.');
        if (point.valueUpper !== undefined && (!Number.isFinite(point.valueUpper) || point.valueUpper < point.value || point.valueUpper > 40)) throw new Error('Interval de tipus invàlid.');
        previous = end;
      }
      const last = metric.series.at(-1);
      if (last.period !== metric.latest?.period || last.value !== metric.latest?.value || last.valueUpper !== metric.latest?.valueUpper) throw new Error(`${region.id}/${key}: l’última dada no coincideix amb l’històric.`);
    }
  }
  return snapshot;
}

const RETRY_DELAYS = [2000, 5000, 15000];
const RETRY_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

function retryDelay(response, minimum) {
  const value = response?.headers?.get('retry-after');
  if (!value) return minimum;
  const requested = /^\d+$/.test(value.trim()) ? Number(value) * 1000 : Date.parse(value) - Date.now();
  return Number.isFinite(requested) ? Math.min(60000, Math.max(minimum, requested)) : minimum;
}

export async function fetchText(url, {fetchImpl = fetch, wait = ms => new Promise(resolve => setTimeout(resolve, ms))} = {}) {
  sourceUrl(url);
  const source = new URL(url);
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    let retryable = false;
    let response;
    try {
      // Only transport failures and temporary HTTP statuses justify another request.
      retryable = true;
      response = await fetchImpl(url, {headers:{'User-Agent':'LArdit-economic-indicators/1.0 (+https://lardit.cat/contacte/)', 'Accept':'application/json,text/csv,text/plain,*/*'}, signal:AbortSignal.timeout(20000)});
      retryable = false;
      sourceUrl(response.url);
      if (!response.ok) {
        retryable = RETRY_STATUSES.has(response.status);
        throw new Error(`HTTP ${response.status}`);
      }
      retryable = true;
      const text = await response.text();
      retryable = false;
      if (!text.length || text.length > 10_000_000) throw new Error('Resposta buida o excessivament gran.');
      return text;
    } catch (error) {
      if (!retryable || attempt === RETRY_DELAYS.length) {
        const detail = error.cause?.code ? `${error.message} (${error.cause.code})` : error.message;
        throw new Error(`No s’ha pogut consultar ${source.hostname}${source.pathname} després de ${attempt + 1} intent(s): ${detail}`, {cause: error});
      }
      // Retry-After may be seconds or an HTTP date; keep the wait within one minute.
      await wait(retryDelay(response, RETRY_DELAYS[attempt]));
    }
  }
}
export async function fetchJson(url) { return JSON.parse(await fetchText(url)); }
