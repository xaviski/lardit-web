# Panorama econòmic

El web publica quatre indicadors per a Catalunya, Espanya, la zona euro i els EUA. La còpia de dades és [`assets/data/economy.json`](../../assets/data/economy.json); l’HTML i els gràfics SVG es generen abans de publicar, de manera que la consulta no depèn de les API dels organismes.

## Fonts i definicions

| Territori | PIB real | Inflació | Atur |
| --- | --- | --- | --- |
| Catalunya | [Idescat, comptabilitat trimestral](https://www.idescat.cat/pub/?id=pibt&n=10231&col=3) | [INE, IPC](https://www.ine.es/jaxiT3/Tabla.htm?t=76136), sèrie `IPC294107` | [INE, EPA](https://www.ine.es/jaxiT3/Tabla.htm?t=65334), sèrie `EPA452504` |
| Espanya i zona euro | [Eurostat `namq_10_gdp`](https://ec.europa.eu/eurostat/databrowser/view/namq_10_gdp/default/table?lang=en), `CLV_PCH_SM`, `SCA` | [Eurostat `prc_hicp_minr`](https://ec.europa.eu/eurostat/databrowser/view/prc_hicp_minr/default/table?lang=en), IPCH total, `RCH_A` | [Eurostat `une_rt_m`](https://ec.europa.eu/eurostat/databrowser/view/une_rt_m/default/table?lang=en), `PC_ACT`, `SA` |
| EUA | [BEA via FRED `GDPC1`](https://fred.stlouisfed.org/series/GDPC1) | [BLS via FRED `CPIAUCNS`](https://fred.stlouisfed.org/series/CPIAUCNS) | [BLS via FRED `UNRATE`](https://fred.stlouisfed.org/series/UNRATE) |

El PIB és creixement interanual en volum, desestacionalitzat. Als EUA es calcula `100 × (nivell del trimestre / nivell del mateix trimestre de l’any anterior − 1)`; no és la variació trimestral anualitzada. La inflació és interanual: IPC català, IPCH europeu i CPI-U dels EUA tenen cobertures diferents. L’atur català és trimestral (EPA, 16 anys o més); l’europeu és mensual i desestacionalitzat (15–74 anys); l’estatunidenc és U-3 mensual i desestacionalitzat (16 anys o més). La zona euro té composició variable en PIB/IPCH i composició EA21 en atur.

El tipus compartit per Catalunya, Espanya i la zona euro és la [facilitat de dipòsit del BCE](https://data.ecb.europa.eu/data/datasets/FM/FM.D.U2.EUR.4F.KR.DFR.LEV), `FM.D.U2.EUR.4F.KR.DFR.LEV`. Als EUA és el [rang objectiu dels fons federals](https://www.federalreserve.gov/economy-at-a-glance-policy-rate.htm), `DFEDTARL`–`DFEDTARU`: es conserven tots dos límits. Les línies són esglaonades, amb els canvis i una observació final de confirmació. Són instruments diferents.

Cada indicador conserva la font humana (`sourceUrl`), l’adreça de descàrrega (`dataUrl`), la definició, els períodes i les notes de publicació. Els gràfics cobreixen aproximadament cinc o sis anys, tenen escales pròpies i interrompen la línia quan falta un mes o trimestre. No s’omplen buits amb valors inventats.

## Actualització local

Des de l’arrel del repositori, amb Node.js 24 i accés a internet per consultar les fonts:

```sh
node --test scripts/economy/test.mjs
node scripts/economy/update.mjs
node --test scripts/economy/test.mjs
git diff -- index.html assets/data/economy.json
```

No calen claus de les API estadístiques. Les proves són locals i no consulten la xarxa. L’actualitzador obté i valida totes les sèries abans de substituir cap dada; si falla una font, conserva la còpia anterior i acaba amb codi 1. Prepara tots dos fitxers temporals i restaura el JSON si falla la substitució de l’HTML; una fallada de restauració s’indica explícitament.

A `index.html` només es reemplaça el bloc entre `<!-- PANORAMA_ECONOMIC_START -->` i `<!-- PANORAMA_ECONOMIC_END -->`. Els marcadors han de ser únics i estar ordenats. Les edicions de l’autor fora del bloc es conserven exactament.

`asOf` és la data de comprovació, en UTC; cada indicador mostra el seu propi període. L’opció `--as-of=YYYY-MM-DD` limita els períodes admesos, però no recupera la versió que es va publicar aquell dia: les fonts proporcionen la revisió més recent. Una publicació prevista avui pot encara no aparèixer a l’API o a FRED. No es mostren previsions ni períodes encara inacabats.

## GitHub Actions

[`update-economy.yml`](../../.github/workflows/update-economy.yml), «Actualitza el panorama econòmic», s’executa diàriament a les 03:23 UTC sobre `main`. Consulta les fonts, executa les proves i, si hi ha canvis, desa només `index.html` i `assets/data/economy.json` amb un push normal. Si una consulta o prova falla, no publica cap canvi. Demana després la reconstrucció de GitHub Pages amb el `GITHUB_TOKEN` temporal; necessita permisos `contents: write` i `pages: write`.

Per executar-lo manualment: **Actions → Actualitza el panorama econòmic → Run workflow**, branca `main`. L’opció `force_build` permet reconstruir Pages encara que les dades no canviïn.

GitHub pot retardar les execucions i, als repositoris públics, desactiva la programació després de 60 dies sense activitat. Si passa, cal tornar a habilitar el workflow a Actions i executar-lo manualment. La programació requereix que el fitxer sigui a la branca per defecte. [Limitacions oficials de les execucions programades](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).
