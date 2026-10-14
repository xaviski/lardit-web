import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {fetchCatalunya} from './sources-catalunya.mjs';
import {fetchEurope} from './sources-europe.mjs';
import {fetchUS} from './sources-us.mjs';
import {fetchText,fetchJson,REGIONS,validateSnapshot} from './shared.mjs';
import {replaceDashboard} from './render.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const dataFile=path.join(root,'assets/data/economy.json');
const htmlFile=path.join(root,'index.html');
async function main() {
  const asOf=process.argv.find(arg=>arg.startsWith('--as-of='))?.slice(8)||new Date().toISOString().slice(0,10);
  const options={asOf,fetchText,fetchJson};
  // Fetch and validate every source before touching the last working snapshot.
  // A source failure stops the update: never publish a partial or empty dashboard.
  const [catalunya,europe,usa]=await Promise.all([fetchCatalunya(options),fetchEurope(options),fetchUS(options)]);
  const regions={...catalunya,...europe,...usa};
  regions.cat.indicators.policy=structuredClone(regions.ea.indicators.policy);
  const snapshot=validateSnapshot({version:1,asOf,regions:REGIONS.map(id=>regions[id])});
  const html=await fs.readFile(htmlFile,'utf8');
  const nextHtml=replaceDashboard(html,snapshot);
  const nextData=JSON.stringify(snapshot,null,2)+'\n';
  // Generated data and the marked HTML block are a mechanical build output.
  // Everything outside that block, including the author's edits, is preserved.
  await fs.mkdir(path.dirname(dataFile),{recursive:true});
  const oldData=await fs.readFile(dataFile,'utf8').catch(error=>{if(error.code!=='ENOENT')throw error;return null;});
  if(oldData===nextData&&html===nextHtml) {console.log('Les dades ja estan al dia; cap fitxer modificat.');return;}
  // Stage both complete outputs first. If replacing HTML fails, restore JSON.
  // The workflow commits neither output unless this whole command succeeds.
  const dataPending=dataFile+`.pending-${process.pid}`;
  const htmlPending=htmlFile+`.pending-${process.pid}`;
  let dataReplaced=false;
  try {
    await fs.writeFile(dataPending,nextData,'utf8');
    await fs.writeFile(htmlPending,nextHtml,'utf8');
    await fs.rename(dataPending,dataFile);
    dataReplaced=true;
    await fs.rename(htmlPending,htmlFile);
  } catch (error) {
    if(dataReplaced) {
      try {
        if(oldData===null) await fs.unlink(dataFile);
        else {await fs.writeFile(dataPending,oldData,'utf8');await fs.rename(dataPending,dataFile);}
      } catch (rollbackError) {
        throw new AggregateError([error,rollbackError],'Error en l’escriptura i en la restauració local; no publiquis aquests fitxers.');
      }
    }
    throw error;
  } finally {
    for(const temporary of [dataPending,htmlPending]) await fs.unlink(temporary).catch(error=>{if(error.code!=='ENOENT')console.error('No s’ha pogut retirar el fitxer temporal: '+temporary);});
  }
  console.log(`Panorama actualitzat: ${snapshot.asOf}; quatre territoris, quatre indicadors cadascun.`);
  for(const region of snapshot.regions) console.log(region.name+': '+Object.entries(region.indicators).map(([key,metric])=>`${key}=${metric.latest.value}${metric.latest.valueUpper!==undefined?'–'+metric.latest.valueUpper:''} (${metric.latest.period})`).join('; '));
}
main().catch(error=>{console.error('No s’ha completat l’actualització del panorama; cap canvi s’ha publicat. '+error.message);process.exitCode=1;});
