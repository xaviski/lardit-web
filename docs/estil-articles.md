# Format comú dels articles de L’Ardit

El model editorial i visual és l’article **«El transport públic també és política d’habitatge»**, a `articles/habitatge/transport-public/index.html`. Els articles publicats i els esborranys comparteixen la mateixa estructura i els mateixos estils de lectura.

Per als encapçalaments de secció, el model és l’article **«Si Catalunya és una locomotora, per què els catalans no ho notem?»**: etiqueta numerada, títol i subtítol explicatiu, amb els components compartits descrits a continuació.

La plantilla per començar un article és `templates/article.html.example`. És un fitxer de referència, no una pàgina publicada. Cal copiar-lo a `articles/<categoria>/<slug>/index.html`, substituir els camps `{{...}}` i conservar el `noindex` mentre sigui un esborrany.

## Una sola font de format

Tots els articles carreguen `/assets/styles.css?v=20261021-compartir` i `/assets/main.js?v=20261021-compartir`. La geometria, la tipografia i el comportament responsive es defineixen en aquest full compartit; no s’han de tornar a definir en un CSS particular, un bloc `<style>` o un atribut `style` de l’article.

Les classes particulars només han de resoldre necessitats del contingut, com una visualització o un component específic. No han de canviar l’amplada ni l’alineació del cos, la separació del menú, els títols generals o la mida del text de lectura. Si cal modificar el format, cal fer-ho en l’estil compartit i comprovar els tres articles publicats.

## Estructura obligatòria

```html
<main id="article">
  <header class="shell article-header">
    <p class="eyebrow">Categoria · Tema</p>
    <h1 class="article-title">Títol</h1>
    <p class="article-deck">Entradeta</p>
    <p class="article-meta">
      <span>Per Xavi Palahí</span>
      <span><time datetime="AAAA-MM-DD">Data de publicació</time></span>
    </p>
  </header>
  <div class="shell article-layout">
    <aside class="article-rail">
      <nav class="article-toc" aria-label="Continguts de l’article">…</nav>
    </aside>
    <article class="article-body">…</article>
    <!-- Opcional: aside.margin-note, després del cos. -->
  </div>
</main>
```

- Una única capçalera, un únic `h1` i un únic cos de lectura.
- L’autoria és **Xavi Palahí**. Les metadades visibles contenen només autor i data original de publicació, sense temps de lectura. Una correcció posterior no substitueix aquesta data.
- El menú és a `aside.article-rail`, abans del cos, amb una llista d’enllaços als identificadors reals de les seccions. Cada `id` ha de ser únic.
- El primer paràgraf introductori usa `article-lead`, amb la caplletra del model. No s’ha de desactivar en un article particular.
- Les seccions principals usen `h2`; els apartats interns, `h3`. La mida, els marges i la interlínia provenen de l’estil compartit.

## Encapçalaments de secció

Cada secció principal, inclosa la conclusió, segueix aquest trio de germans consecutius:

```html
<p class="section-number">01 · Etiqueta breu de la secció</p>
<h2 id="identificador-estable">Títol de la secció</h2>
<p class="chart-subtitle">Una frase breu que explica l’abast de la secció.</p>
```

- L’etiqueta usa la tipografia monoespaiada, el color vermell i les majúscules definides al CSS comú; el text s’escriu amb majúscules i minúscules normals.
- Numera les seccions consecutivament amb dos dígits (`01`, `02`…) i el separador `·`. El menú inclou aquestes seccions en el mateix ordre.
- Conserva els `id` i els enllaços existents quan només canvies el format.
- El subtítol resumeix el tema. En una secció de dades pot indicar la mesura, el territori, el període i les unitats, però no ha d’inventar dades ni substituir les fonts del gràfic.
- Bibliografia i metodologia fan servir el mateix trio, però l’etiqueta no es numera i porta `class="section-number section-number--appendix"`.
- Els requadres introductoris `key-points`, els exemples i els subapartats `h3` no formen part d’aquesta numeració.
- Els esborranys existents poden adoptar el patró en revisar-los; qualsevol article nou o que es publiqui ha de seguir-lo.

## Columnes i comportament responsive

- **Més de 1100 px:** text centrat, fins a **740 px** d’amplada. El menú se centra horitzontalment en tot l’espai entre la vora esquerra de la pàgina i l’inici del text, incloent-hi el marge exterior. La graella ocupa tota l’amplada i separa explícitament les columnes amb **2 rem**; això no mou el cos ni les notes del marge dret. El menú conserva l’amplada anterior, fins a **218 px**, en comptes d’estirar-se per omplir tot l’espai.
- **De 701 a 1100 px:** dues columnes, menú i text; les notes al marge passen sota el cos. S’aplica exactament la mateixa regla a tots els articles.
- **Fins a 700 px:** lectura en una columna. El menú queda abans del text, sense posició fixa, i la seva llista també és d’una columna.
- El menú d’ordinador és `sticky`, a **2 rem** de la part superior. La seva alçada màxima és `calc(100dvh - 4rem)`, amb desplaçament intern si cal, per poder accedir als últims enllaços en pantalles baixes. No s’han d’afegir ancestres amb `overflow` que impedeixin aquest comportament.

## Memes, figures i fonts

- El meme de portada s’usa a les targetes de la portada i de la categoria. Dins de l’article apareix després de la introducció i del requadre de síntesi, quan n’hi hagi; no al costat del titular.
- Dins de l’article, el meme usa `figure.article-figure.article-cover`, amb text alternatiu descriptiu, amplada i alçada reals i peu de figura. No s’inventa una imatge ni es deixa una ruta provisional en una pàgina preparada per publicar.
- Els gràfics i les altres imatges usen `figure.article-figure`. La font i les limitacions immediates s’inclouen en un `figcaption`, amb la mida reduïda comuna; no en un paràgraf normal desconnectat de la figura.
- Les taules usen els components compartits `evidence-table-wrap`, `evidence-table` i, si hi ha una nota externa, `table-source`.
- Els requadres de síntesi i els exemples reutilitzen `key-points` i `thought-experiment`; no redefineixen el format de tot l’article.
- Cal conservar els gràfics adaptats al mòbil quan una visualització ho necessiti, sense canviar l’amplada comuna del cos per encabir-los.

## Opcions per compartir

- Cada article publicat inclou un únic `nav.article-share`, germà de les seccions del cos, just després de la conclusió i abans de les fonts o la metodologia. Usa el bloc de `templates/article.html.example`, amb WhatsApp, X, Facebook i Correu, en aquest ordre, i els estils compartits.
- Els enllaços són HTML estàtic i funcionen també sense JavaScript. Comparteixen la URL canònica de l’article, no l’adreça de previsualització ni l’ancoratge actual. WhatsApp, X i l’assumpte del correu inclouen el títol de l’`h1` seguit de ` — L’Ardit`.
- A la plantilla, substitueix `{{TITOL_COMPARTIR_URLENCODED}}` pel títol amb la marca codificat per a URL, i `{{URL_CANONICA_URLENCODED}}` per la URL canònica codificada. Conserva els separadors HTML `&amp;`. El test de format comprova les destinacions, el títol, la URL i l’emplaçament en tots els articles publicats; també detecta camps sense substituir.
- Els enllaços de xarxes obren una pestanya nova amb `target="_blank"`, `rel="noopener noreferrer"` i un avís per als lectors de pantalla. Correu és un enllaç `mailto:` i no envia cap missatge automàticament.
- En ordinador, a més del bloc final, el JavaScript compartit crea quatre icones SVG petites al marge dret, sense text visible ni serveis externs incrustats. Reutilitza els enllaços del bloc final, conserva noms accessibles i una àrea clicable suficient. No copiïs manualment un segon joc d’URL ni afegeixis dependències socials.
- Les icones laterals acompanyen la lectura amb `sticky`, sense moure el cos ni el menú esquerre. Les notes existents es conserven al marge dret. Fins a 1100 px s’oculta el complement lateral i es manté el bloc del final; a la impressió no es mostren controls socials.
- Els esborranys existents han d’incorporar aquest bloc abans de publicar-se. Afegir opcions per compartir no elimina el `noindex` ni autoritza la publicació d’un esborrany.

## Esborranys i publicació

Un esborrany hereta el mateix format. Pot afegir avisos i components editorials de `assets/drafts.css`, però aquests no han de canviar les dimensions de la capçalera, les columnes o el cos.

Mentre no hi hagi autorització explícita per publicar, s’ha de mantenir:

```html
<meta name="robots" content="noindex,nofollow,noarchive">
```

Els esborranys no apareixen a la portada, als llistats de categories ni al `sitemap.xml`. Guardar-los a GitHub no autoritza a publicar-los o indexar-los. Les comprovacions de format tampoc no canvien el seu estat de publicació.

Abans d’una publicació autoritzada, cal revisar els camps provisionals, la data, les fonts, les imatges, la URL canònica, les metadades socials i les dades estructurades. Només llavors s’actualitzen els llistats, el sitemap i les directives d’indexació segons la petició de l’autor.

Els articles publiquen `og:image` i `twitter:image` amb la imatge real, text alternatiu i targeta `summary_large_image`. Les pàgines generals usen el logotip de L’Ardit i targeta `summary`. El compte de difusió de l’autor és `https://x.com/Xavipalahi`, no un compte separat de la marca. Conserva la data original de publicació i actualitza només la de modificació quan pertoqui, de manera coherent amb el sitemap.

## Comprovacions abans de donar el canvi per acabat

Des de l’arrel del repositori:

```sh
python scripts/test-format-articles.py
python scripts/test-metadades-articles.py
python scripts/test-publicacio-creixement.py
python scripts/test-site.py
node --test scripts/economy/test.mjs scripts/test-article-share.mjs
```

També cal revisar visualment transport, universitats i creixement:

1. En ordinador, comprovar la mateixa posició i amplada del cos, la separació del menú i els títols.
2. En una pantalla intermèdia, comprovar les dues columnes i l’absència de desbordament horitzontal.
3. En mòbil, comprovar el menú d’una columna abans del text, les taules i les variants dels gràfics.
4. En una pantalla baixa, arribar al darrer enllaç del menú i comprovar que continua sent accessible.
5. Comparar el diff: no s’han de modificar el text, les dades, les dates originals o l’estat d’indexació quan només s’està canviant el format.
