# Articles de L’Ardit

- El model visual canònic és `articles/habitatge/transport-public/index.html`.
- Els encapçalaments de secció segueixen el model de `articles/economia/creixement-benestar-catalunya/index.html`: `p.section-number` amb número i etiqueta, `h2` i `p.chart-subtitle`. La numeració és consecutiva i coincideix amb el menú; els apèndixs de fonts duen etiqueta sense número i els requadres introductoris no es numeren.
- Abans de crear o reformatejar articles, llegeix `docs/estil-articles.md`.
- Parteix de `templates/article.html.example`; conserva `noindex,nofollow,noarchive` fins que l’usuari autoritzi publicar i indexar.
- Tots els articles comparteixen les primitives `.article-*` d’`assets/styles.css`. No creïs graelles, amplades, capçaleres o tipografies particulars per article.
- Conserva el contingut, les dades, les fonts, la data de publicació i les modificacions de l’usuari quan canviïs només el format.
- El meme de portada es manté també dins l’article, després de la introducció i del requadre inicial quan n’hi ha. No el dupliquis a la capçalera.
- La metadada visible d’un article publicat només mostra Xavi Palahí i la data original de publicació, sense temps de lectura.
- Tots els articles publicats i els nous de la plantilla inclouen un únic `nav.article-share` després de la conclusió i abans de fonts/metodologia, amb WhatsApp, X, Facebook i Correu. Els enllaços usen el títol i la URL canònica propis. El JavaScript compartit en deriva les icones laterals, sense duplicar manualment les destinacions ni crear estils particulars.
- Després dels canvis, executa `python scripts/test-format-articles.py` i `python scripts/test-metadades-articles.py`; comprova ordinador, mòbil i una pantalla baixa si canvies el disseny.
