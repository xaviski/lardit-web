import { INDICATORS, periodEnd, validateSnapshot } from './shared.mjs';

const TITLES = {gdp:'Creixement del PIB', inflation:'Inflació', unemployment:'Taxa d’atur', policy:'Tipus d’interès'};
export const START = '<!-- PANORAMA_ECONOMIC_START -->';
export const END = '<!-- PANORAMA_ECONOMIC_END -->';
export const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const number = (value, digits=1) => new Intl.NumberFormat('ca-ES', {minimumFractionDigits:digits, maximumFractionDigits:digits}).format(value);
export function periodLabel(period, compact=false) {
  if (period.includes('-Q')) return compact ? `${period.at(-1)}T ${period.slice(0,4)}` : `${['','1r','2n','3r','4t'][+period.at(-1)]} trimestre de ${period.slice(0,4)}`;
  return new Intl.DateTimeFormat('ca-ES', {year:'numeric', month:compact?'short':'long', ...(period.length===10?{day:'numeric'}:{}), timeZone:'UTC'}).format(new Date(`${period.length===7?period+'-01':period}T00:00:00Z`));
}
function displayValue(metric,key) {
  const digits=key==='policy'?2:1;
  const latest=metric.latest;
  const prefix=(key==='gdp'||key==='inflation')&&latest.value>0?'+':'';
  return prefix+number(latest.value,digits)+(latest.valueUpper!==undefined?'–'+number(latest.valueUpper,digits):'');
}
function chart(metric,id,key) {
  const points=metric.series;
  const values=points.flatMap(p=>p.valueUpper===undefined?[p.value]:[p.value,p.valueUpper]);
  const low=Math.min(...values), high=Math.max(...values);
  const padding=Math.max((high-low)*0.1,0.15);
  const min=low-padding,max=high+padding;
  const times=points.map(p=>Date.parse(periodEnd(p.period)));
  const width=360,left=45,right=348,top=10,bottom=90;
  const x=i=>left+(times[i]-times[0])/(times.at(-1)-times[0])*(right-left);
  const y=value=>bottom-(value-min)/(max-min)*(bottom-top);
  const xy=n=>n.toFixed(2);
  function line(field) {
    let path='';
    for (let i=0;i<points.length;i++) {
      const px=xy(x(i)),py=xy(y(points[i][field]));
      const gap=i>0&&metric.lineType!=='step'&&((metric.frequency==='Mensual'&&times[i]-times[i-1]>40*86400000)||(metric.frequency==='Trimestral'&&times[i]-times[i-1]>110*86400000));
      path+=i===0||gap?`M${px},${py}`:metric.lineType==='step'?`H${px}V${py}`:`L${px},${py}`;
    }
    return path;
  }
  const ticks=[min,(min+max)/2,max];
  const guides=ticks.map(value=>`<line x1="${left}" x2="${right}" y1="${xy(y(value))}" y2="${xy(y(value))}" class="economy-chart-grid"/><text x="${left-7}" y="${xy(y(value)+4)}" text-anchor="end">${escapeHtml(number(value))}</text>`).join('');
  const zero=min<0&&max>0?`<line x1="${left}" x2="${right}" y1="${xy(y(0))}" y2="${xy(y(0))}" class="economy-chart-zero"/>`:'';
  const upper=metric.latest.valueUpper!==undefined;
  const description=`${TITLES[key]}: ${displayValue(metric,key)} %. ${periodLabel(points[0].period)} a ${periodLabel(points.at(-1).period)}. ${upper?'Es representen els dos límits de l’interval objectiu. ':''}Les interrupcions de la línia indiquen períodes sense dada.`;
  return `<svg class="economy-chart" viewBox="0 0 ${width} 116" role="img" aria-labelledby="${id}-title ${id}-desc"><title id="${id}-title">${escapeHtml(TITLES[key])}: evolució recent</title><desc id="${id}-desc">${escapeHtml(description)}</desc>${guides}${zero}<path d="${line('value')}" class="economy-chart-line${upper?' economy-chart-lower':''}"/>${upper?`<path d="${line('valueUpper')}" class="economy-chart-line"/>`:''}<circle cx="${xy(x(points.length-1))}" cy="${xy(y(points.at(-1).value))}" r="3" class="economy-chart-dot"/><text x="${left}" y="112">${escapeHtml(periodLabel(points[0].period,true))}</text><text x="${right}" y="112" text-anchor="end">${escapeHtml(periodLabel(points.at(-1).period,true))}</text></svg>`;
}
function metricCard(metric,key,regionId,index) {
  const id=`economy-${regionId}-${key}`;
  const statusLabels={provisional:'Provisional',estimated:'Estimació',advance:'Avanç'};
  const warning=statusLabels[metric.latestStatus]||'';
  return `<article class="economy-metric" data-indicator="${key}" aria-labelledby="${id}-heading">
              <p class="economy-metric-index">0${index+1} — ${escapeHtml(metric.frequency)}</p>
              <h3 id="${id}-heading">${TITLES[key]}</h3>
              <p class="economy-value">${escapeHtml(displayValue(metric,key))}<span class="economy-unit">%</span></p>
              <p class="economy-period">${escapeHtml(periodLabel(metric.latest.period))}${warning?` <span class="economy-estimate">· ${warning}</span>`:''}</p>
              ${chart(metric,id,key)}
              <p class="economy-definition">${escapeHtml(metric.definition)}</p>
              <p class="economy-source">Font: <a href="${escapeHtml(metric.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(metric.sourceName)}</a></p>
              <details class="economy-series-note"><summary>Detalls de la sèrie</summary><p>${escapeHtml(metric.note||'Dades oficials subjectes a revisió.')}</p></details>
            </article>`;
}
export function renderDashboard(snapshot) {
  validateSnapshot(snapshot);
  const tabs=snapshot.regions.map((region,index)=>`<button type="button" role="tab" id="economy-tab-${region.id}" aria-controls="economy-panel-${region.id}" aria-selected="${index===0}" tabindex="${index===0?0:-1}">${escapeHtml(region.name)}</button>`).join('\n            ');
  const panels=snapshot.regions.map((region,index)=>`<div class="economy-panel" id="economy-panel-${region.id}" role="tabpanel" aria-labelledby="economy-tab-${region.id}"${index?' hidden':''}>
          <p class="economy-region-note">${escapeHtml(region.note)}</p>
          <div class="economy-metrics">
            ${INDICATORS.map((key,i)=>metricCard(region.indicators[key],key,region.id,i)).join('\n            ')}
          </div>
        </div>`).join('\n        ');
  return `${START}
      <section class="economy-band" id="panorama-economic" aria-labelledby="economy-heading" data-economy-dashboard>
        <div class="shell economy-layout">
          <header class="economy-intro">
            <p class="economy-eyebrow">L’economia, en quatre dades</p>
            <h2 id="economy-heading">Panorama econòmic.</h2>
            <p>Una mirada a l’activitat, els preus, el treball i els tipus d’interès.</p>
            <div class="economy-tabs" role="tablist" aria-label="Tria el territori">
              ${tabs}
            </div>
            <p class="economy-checked">Dades comprovades el <time datetime="${snapshot.asOf}">${escapeHtml(periodLabel(snapshot.asOf))}</time>.</p>
            <p class="economy-caption">Cada indicador té el seu període. No són dades en temps real.</p>
          </header>
          <div class="economy-content">
            ${panels}
            <details class="economy-method">
              <summary>Què estem comparant?</summary>
              <p>El PIB mostra creixement real respecte del mateix trimestre de l’any anterior, no creixement trimestral anualitzat. La inflació compara els preus amb els del mateix mes de l’any anterior: IPC a Catalunya, IPCH a Espanya i la zona euro, i CPI-U als EUA; els índexs no tenen exactament la mateixa cobertura.</p>
              <p>L’atur català és trimestral (EPA, població activa de 16 anys o més); Eurostat ofereix dades mensuals ajustades d’estacionalitat per a Espanya i la zona euro (15–74 anys). Als EUA és la taxa U-3 mensual ajustada (16 anys o més). Les poblacions i els períodes no són idèntics.</p>
              <p>El tipus de dipòsit del BCE és comú a Catalunya, Espanya i la zona euro. Als EUA es mostra l’interval objectiu dels fons federals. Són instruments diferents i no equivalen al tipus que paga una família per un préstec. La línia discontínua del gràfic dels EUA és el límit inferior; la contínua, el superior.</p>
              <p>Els gràfics recullen entre cinc i sis anys d’història, amb escales pròpies: serveixen per veure cada evolució, no per comparar la inclinació de les línies. Les dates inicials i finals apareixen sota cada gràfic. Les dades reflecteixen la revisió més recent; no es representen previsions ni s’inventen valors quan falta una observació.</p>
              <p><a href="/assets/data/economy.json" target="_blank" rel="noopener noreferrer">Consulta les dades i les adreces de les fonts</a>. Aquest web no està vinculat als organismes que publiquen les dades.</p>
            </details>
          </div>
        </div>
        <noscript><p class="shell economy-noscript">Sense JavaScript es mostra Catalunya. Els quatre territoris es poden consultar al <a href="/assets/data/economy.json">fitxer de dades</a>.</p></noscript>
      </section>
      ${END}`;
}
export function replaceDashboard(html,snapshot) {
  const start=html.indexOf(START),end=html.indexOf(END);
  if(start<0||end<start||html.indexOf(START,start+START.length)>=0||html.indexOf(END,end+END.length)>=0) throw new Error('No s’ha trobat un únic bloc del panorama econòmic.');
  return html.slice(0,start)+renderDashboard(snapshot)+html.slice(end+END.length);
}
