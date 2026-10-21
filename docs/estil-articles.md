# Format comú dels articles de L’Ardit

El model editorial i visual és l’article **«El transport públic també és política d’habitatge»**, a `articles/habitatge/transport-public/index.html`. Els articles publicats i els esborranys comparteixen la mateixa estructura i els mateixos estils de lectura.

La plantilla per començar un article és `templates/article.html.example`. És un fitxer de referència, no una pàgina publicada. Cal copiar-lo a `articles/<categoria>/<slug>/index.html`, substituir els camps `{{...}}` i conservar el `noindex` mentre sigui un esborrany.

## Una sola font de format

Tots els articles carreguen `/assets/styles.css?v=20261021-format-articles`. La geometria, la tipografia i el comportament responsive es defineixen en aquest full compartit; no s’han de tornar a definir en un CSS particular, un bloc `<style>` o un atribut `style` de l’article.

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

## Columnes i comportament responsive

- **Més de 1100 px:** tres columnes, amb el text a la columna central, fins a **740 px** d’amplada i **2 rem** entre columnes. Les columnes laterals mantenen el text centrat encara que no hi hagi una nota al marge dret.
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

## Esborranys i publicació

Un esborrany hereta el mateix format. Pot afegir avisos i components editorials de `assets/drafts.css`, però aquests no han de canviar les dimensions de la capçalera, les columnes o el cos.

Mentre no hi hagi autorització explícita per publicar, s’ha de mantenir:

```html
<meta name="robots" content="noindex,nofollow,noarchive">
```

Els esborranys no apareixen a la portada, als llistats de categories ni al `sitemap.xml`. Guardar-los a GitHub no autoritza a publicar-los o indexar-los. Les comprovacions de format tampoc no canvien el seu estat de publicació.

Abans d’una publicació autoritzada, cal revisar els camps provisionals, la data, les fonts, les imatges, la URL canònica, les metadades socials i les dades estructurades. Només llavors s’actualitzen els llistats, el sitemap i les directives d’indexació segons la petició de l’autor.

## Comprovacions abans de donar el canvi per acabat

Des de l’arrel del repositori:

```sh
python scripts/test-format-articles.py
python scripts/test-metadades-articles.py
python scripts/test-publicacio-creixement.py
node --test scripts/economy/test.mjs
```

També cal revisar visualment transport, universitats i creixement:

1. En ordinador, comprovar la mateixa posició i amplada del cos, la separació del menú i els títols.
2. En una pantalla intermèdia, comprovar les dues columnes i l’absència de desbordament horitzontal.
3. En mòbil, comprovar el menú d’una columna abans del text, les taules i les variants dels gràfics.
4. En una pantalla baixa, arribar al darrer enllaç del menú i comprovar que continua sent accessible.
5. Comparar el diff: no s’han de modificar el text, les dades, les dates originals o l’estat d’indexació quan només s’està canviant el format.
