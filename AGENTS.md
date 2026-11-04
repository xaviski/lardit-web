# Articles de L’Ardit

- El model visual canònic és `articles/habitatge/transport-public/index.html`.
- Els encapçalaments de secció segueixen el model de `articles/economia/creixement-benestar-catalunya/index.html`: `p.section-number` amb número i etiqueta, `h2` i `p.chart-subtitle`. La numeració és consecutiva i coincideix amb el menú; els apèndixs de fonts duen etiqueta sense número i els requadres introductoris no es numeren.
- Abans de crear o reformatejar articles, llegeix `docs/estil-articles.md`.
- Parteix de `templates/article.html.example`; conserva `noindex,nofollow,noarchive` fins que l’usuari autoritzi publicar i indexar.
- Tots els articles comparteixen les primitives `.article-*` d’`assets/styles.css`. No creïs graelles, amplades, capçaleres o tipografies particulars per article.
- Conserva el contingut, les dades, les fonts, la data de publicació i les modificacions de l’usuari quan canviïs només el format.
- El meme de portada es manté també dins l’article, després de la introducció i del requadre inicial quan n’hi ha. No el dupliquis a la capçalera.
- La metadada visible d’un article publicat només mostra Xavi Palahí i la data original de publicació, sense temps de lectura.
- Tots els articles publicats i els nous de la plantilla inclouen un únic `nav.article-share` després de la conclusió i abans de fonts/metodologia, amb WhatsApp, X, Facebook, Instagram i Correu. Els enllaços usen el títol i la URL canònica propis. `main.js` en deriva les cinc icones laterals i, carregat després, `instagram-share.js` vincula el modal als dos disparadors d’Instagram; els articles i la plantilla han de carregar tots dos scripts en aquest ordre, sense duplicar manualment les destinacions ni crear estils particulars.
- El modal d’Instagram ofereix «Copia l’enllaç» i «Obre els missatges», i genera una Story PNG de 1080 × 1920. Només ofereix compartir el fitxer amb el menú natiu quan `navigator.canShare({ files })` ho admet; la descàrrega continua disponible com a alternativa. L’usuari completa el missatge o la Story a Instagram i hi afegeix manualment l’adhesiu «Enllaç»; no prometis ni simulis una publicació automàtica.
- Després dels canvis, executa `python scripts/test-format-articles.py` i `python scripts/test-metadades-articles.py`; comprova ordinador, mòbil i una pantalla baixa si canvies el disseny.
- Per a revisions globals o publicació, executa també `python scripts/test-site.py`: les pàgines públiques han de tenir rutes, metadades socials, imatges, sitemap i directives d’indexació coherents. No canviïs la data original de publicació en una revisió posterior.
