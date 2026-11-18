# pine-website

The website of [pine](https://github.com/pmndre/pine), served at pine.pmnd.re by Cloudflare Pages.

The sources are in `site/` and built with Vite into the top of the repository (`index.html`,
`assets/`, `shots/`, `fonts/`), which Pages serves as it is: the Pages project has no build step of
its own. So the built files are committed. Build before you commit:

```bash
npm install
npm run dev      # the sources, http://localhost:5173
npm run build    # the site, into the top of the repository
```

| | |
|---|---|
| `site/index.html` | The page. `<!--shot:name-->` is replaced by that scene when it is built |
| `site/src/style.css` | The grid, the type, the panels, the scroll effects |
| `site/src/main.ts` | Scales the app's windows to their place, and runs the shows |
| `site/src/app.css` | The Pine app's own CSS, cut down and scoped under `.pine-shot` (made by the capture) |
| `site/public/shots/` | The scenes: the Pine app's own DOM (made by the capture) |
| `scripts/capture.mjs` | The capture |

## The windows of the app

They are not pictures: `npm run capture` starts the real Pine app (from a pine checkout beside this
one, `../pine`, with `desktop/` installed) on a pine home of its own with pine's scripted model,
plays the scenes (a project with a worktree, a diff, the terminal, the browser; a scanned invoice, a
pull request, a price that drops) and saves each as the app's DOM, with the CSS rules it uses. It
needs a Mac with a screen and takes about a minute and a half. Its folders lie under /Users/Shared
while it runs. Run it again when the app's look changes, then build.

A window with several scenes is a show: the first scene is in the page, the others are fetched when
it comes near the screen, and they follow one another while it is on screen.

## The grid

Every panel has the same width, and every row inside it is a `.g` with the same columns: 12 from
1024 px, 6 from 640 px, 4 below. An element's columns are set inline: `--c` (12), `--cm` (6) and
`--cs` (4), for example `style="--c: 4 / 8; --cm: 1 / -1"`. Vertical sizes are multiples of 8 px.
`.guides` draws the columns with the same grid, so a line is always on an edge.

Fonts: Archivo (variable, width 62–125) and JetBrains Mono, both OFL.
