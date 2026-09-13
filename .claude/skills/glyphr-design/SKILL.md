---
name: glyphr-design
description: The design bar, token contract, file map and pre-flight checks for Glyphr Studio 2 (Blue Rain fork). Load when changing how something in glyphr_studio_2/src looks or behaves — not when changing what it computes. Covers CSS and UI JavaScript, panels, dialogs, controls, tools, canvas chrome, tokens.css / colors.css / theme.js, spacing, type, colour, contrast, dark mode and theming, focus, keyboard and accessibility, motion and animation, z-index and layering, empty states, toasts, user-facing labels, errors, microcopy and terminology, brand and the Blue Rain seam — and any review of visual work, including "make it look better", "this feels off" or "more Blue Rain". Load it for brand work in the sibling marketing repo bluerain_v2 as well, since §7 defines the seam between the two.
---

# The Glyphr Studio 2 design bar

A dense, keyboard-first browser font editor in vanilla JS, shipping under **bluerain.studio**. Game developers first (pixel fonts, icon/PUA sets, texture atlases, anchors, metric keys); working type designers welcome. No framework and no build-time CSS: DOM is built by hand with `makeElement()`, styled by a flat cascade whose link order in `src/index.html` *is* the cascade order.

This file codifies the system and the bar. It does not authorise a redesign — specific redesigns come later, with the owner.

**Two voices in this file.** Every rule here is the bar for the code *you* write. Unmarked rules read as description, but §1 and §2 are aspirational as a description of the tree: most of the twelve properties have live counter-examples — invented heights, three label columns, eight deleted focus rings, hue-285 purples, `animation` on `.panel__card` (`panels.css:24`) — and §2 and §10 already name every one. So match the rule, not the neighbouring file, and never re-report a gap they already list as a discovery. A rule marked **(target)** goes further: it needs shared infrastructure that does not exist yet, so it always says what to do **today**, with the code as it stands, and §9.3 says how to report the shortfall.

### Find your task

| I am about to… | Go to |
|---|---|
| Anything at all — know what "done" means | §1, then §2 |
| Build a new surface or feature | §3 *Does it already exist?* first |
| Add a colour, size, duration or any scale value | §4 |
| Add or restyle a control in `src/controls/` | §5 |
| Add a panel card, a row, or a sidebar section | §6.2 |
| Add a dialog, menu, toast or floating surface | §6.4 |
| Draw on the canvas, add a tool, touch canvas chrome | §6.1 |
| Add a top-bar item, a hub view or a full-window page | §6.3 |
| Build a fork feature (pixel / icon / anchors / metrics / atlas) | §6.5 |
| Put brand anywhere near the tool | §7 |
| Write a label, hint, error or toast | §8 |
| Find myself blocked by shared infrastructure | §9.3 |
| Declare it finished | §9 |

---

## 1. The bar, made testable

"Apple-grade restraint plus Figma/Framer/Linear craft" is not a mood. In this app it is these twelve properties.

| # | Property | Test |
|---|---|---|
| 1 | **One grid.** Every *scale* value is a token. | Space, type size, radius, control height, duration and colour come from a token — no exceptions. A one-off structural dimension that is on no scale (a grid track width, a `max-height` on a scrolling list, a fixed preview box, an icon column) may be a literal in the feature's own stylesheet, as `atlas-export.css:44` and `command-palette.css:84` do: round it to the 4px grid, and never reach for one where a `--sp-*`, `--fs-*`, `--r-*`, `--control-h*` or `--row-h` already fits. `0`, `1px` hairlines, `ch` measures and layout units (`%`, `fr`, `vh`, `vw`, `minmax()`) are always legal. |
| 2 | **One row, dense on purpose.** Panel rows `--row-h` 28px, in-row controls `--control-h-sm` 24px, shell and top-bar controls `--control-h` 28px, tools `--tool-size` 32px. | Put an `input-number`, an `option-chooser` and a button in one card: their boxes align top and bottom. |
| 3 | **One label column.** Above the sidebar container breakpoint (320px, `sidebar.css:219`) every panel card starts its fields at the same x, in both sidebars. Below it every card collapses to one column, label above control — that is the shipped behaviour and it wins. | Drag a sidebar past 320px and read the field edges: one line. Never add a per-card `grid-template-columns` override to escape either state. |
| 4 | **One focus ring.** `:focus-visible` + `var(--focus-style)` + `var(--focus-offset)`, drawn outside the element. | Zero `outline: none` / `outline: 0` without a ring in the same rule; zero bare `:focus` owning an outline. |
| 5 | **One accent.** `--accent` (hue 212) is the only interaction colour. `--violet-*` and the legacy second hues carry real signal only — component instance vs path, kern indicators, guides. | Point at what each non-accent hue in your diff signals. "It looks nice" means delete it. |
| 6 | **Both themes, always.** | Every colour you wrote resolves in both the `:root` and the `:root[data-theme='dark']` block — check by reading, then hand the visual check to the owner. A surface correct in one theme is not finished. |
| 7 | **Stillness.** Nothing animates that the user did not move. | No `animation` on a selector whose element is rebuilt by a subscription; no infinite animation except a live indeterminate progress bar. Owner confirms by dragging a shape and watching both sidebars. |
| 8 | **Seven states.** rest, hover, active, `:focus-visible`, disabled, error, loading — all defined, all visibly distinct. | Name the selector for each. "Not applicable" is true only for a static label. |
| 9 | **24px floor.** Every pointer target ≥ 24×24 CSS px, using transparent padding so the drawn icon stays 16px. Canvas hit tolerance is padding *around* the drawn shape, never the shape's own bounds. | Measure the smallest thing you added. |
| 10 | **100ms.** A visible response inside 100ms; handler work under 50ms; frames under 16ms. | No project instantiation, project parse or glyph rasterisation synchronously inside a view builder or a dialog-open path. Never add a `setTimeout` so a toast can paint — yield one frame, then start. |
| 11 | **Numbers are the product.** Numeric UI is `var(--font-mono)` + `font-variant-numeric: tabular-nums`. Every drag reports its number. | Read the drag handler you added: if it changes a value and writes no readout, it is unfinished. |
| 12 | **Keyboard-first.** Everything reachable, activatable, named and findable. | Every new command has a command-palette entry with game-developer keywords; every interactive element answers the §5 keyboard contract. |

Properties 6, 7 and 11 finish in a browser. Claude verifies them by reading code and then states plainly what the owner must look at (§9.2). Never assert a visual check you did not perform.

---

## 2. Rejection list — what this codebase actually produces

### Three colour systems exist. Only one is real.

| System | Status | Rule |
|---|---|---|
| `tokens.css` semantics (`--bg-*`, `--text-*`, `--border-*`, `--icon-*`, `--accent*`, `--canvas-*`) | **Source of truth** | Use this. Always. |
| `colors.css` ramps (`--gray-l*`, `--blue-l*`, `--royal-l*`, `--purple-l*`, `--orange-l*`, `--green-l*`, `--red`, `--enabled-*`, `--disabled-*`, `--offWhite`) | Legacy bridge, still consumed by most older stylesheets | Zero new references. Migrate the lines you touch. |
| `colors.js` (`accentColors`, `uiColors`) | **Frozen.** Theme-blind, and off-hue from the token layer: its blue is hue 198 against the token ramp's 212, purple 285 vs 268, green 125 vs 152, orange 20 vs the warn ramp's 32–38 | No new imports anywhere. Live and not to be deleted: the colour maths helpers (`parseColorString`, `rgbToHex`, `shiftColor`, `getColorFromRGBA`, `transparencyToAlpha`) and `makeRandomSaturatedColor()`, which `panels/guides.js` calls for new guide colours. |

### Four declarations in this repo fail silently. Do not add a fifth.

| Symptom | Where | Why it survived |
|---|---|---|
| `var(--global-outline-style)` — defined nowhere | `controls/tabs/tab-control.css:21` | Invalid at computed-value time → the tab strip has no focus ring, and nothing logs |
| `var(--animate-slide-in)` — defined nowhere | `pages/editor-pages.css:194` | The animation never plays, and nothing logs |
| `tokens.css` never injected into the pop-out window | `project_editor/pop_out_window.js` | Every `var()` that reaches into the token layer resolves to `unset` — the `-l##` ramps are self-contained in `colors.css` and still work, but `colors.css`'s own semantic aliases (`--enabled-resting-text: var(--text-primary)`) and everything in `resets.css`, `pop-out-window.css`, `panels.css` and `dialogs.css` do not |
| `.showModal()` is never called anywhere | `controls/dialogs/dialogs.js` | The `<dialog>` is forced visible with `display: block` — no top layer, no focus trap, no `::backdrop` |

**Therefore: before shipping CSS, grep every `var(--x)` you wrote for a matching `--x:` declaration you can point at.** A typo'd custom property is invisible in the browser, in the build and in review.

### Failure modes with live instances

| Failure | Live here | Rule |
|---|---|---|
| Off-system colour | `white` in `panels.css`, `content-pages.css`, `pop-out-window.css`; hue-285 purples in `app-pages.css`; the atlas checkerboard in `atlas-export.css` | Colour literals exist only in `tokens.css` and `colors.css`. Everything else uses a semantic token, or `getCanvasColors()` on canvas. |
| Invented height | 20 / 22 / 24 / 26 / 28 / 30 / 32 / 40px controls in one card; `input-number` is 24px tall with a 26px arrow stack inside it | Heights come from `--control-h-sm` / `--control-h` / `--control-h-lg` / `--row-h` / `--tool-size`. No new px height, ever. |
| Second label column | Three splits ship at once: `minmax(96px,40%)` at `panels.css:10`, `clamp(110px,150px,190px)` at `panels.css:119`, `minmax(64px,38%)` at `sidebar.css:134`. (The `content-pages.css:89-90` copy is commented out — dead, not a fourth.) | **(target)** One fixed label track for every card in both sidebars (`--panel-label-col`, §4.5), with the shipped container query still collapsing it below 320px. Never a percentage, never a `clamp()` of constants, never a per-card override. |
| Silent focus deletion | Eight `outline: none` / `outline: 0` in CSS with no replacement — including `canvas` / `edit-canvas` at `resets.css:356-362` — plus two more in JS-injected stylesheets (`font_preview.js:169`, `edit_canvas.js:132`) that the §2 grep gate will also flag; bare `:focus` outnumbers `:focus-visible` by roughly seven to one | `outline: none` is legal only when the same rule draws an equally visible ring. Bare `:focus` may change background or border, never own or remove the outline. |
| Animation on rebuilt content | `.panel__card { animation: var(--animate-fade-update) }` replays on every publish, so both sidebars shimmer for the whole of a canvas drag | Never put `animation` on a selector whose element is recreated by a subscription. Entrance animation is added in JS on first mount and removed on `animationend`. |
| Decorative motion | `gradFade 120s linear infinite` on every `fancy-button` (via the `--fancy-animation` alias); bare `*` transitions in five injected sheets — the four shadow-injected ones, `fancy-button.css:1`, `input-number.css:1`, `option-chooser.css:1`, `option-toggle.css:1`, carry `transition: var(--global-transition)`; `info-bubble-popup.css:1` carries `transition: inherit` from a `<style>` that `info_bubble.js:52-53` appends inside `#bubble`, which `info_bubble.js:74` appends to `document.body` — light DOM, so that bare `*` rule reaches the whole main document | No infinite animation on a resting control. Transitions name their properties and their selectors. Never `transition: all`, never a bare `*` selector — shadow roots included. |
| Literal timing | Eight hardcoded durations — seven in CSS (250ms and 300ms ×4 in `pop-out-window.css`, 500ms in `glyph-tile.css`, 0.1s at `panels.css:727`) and one in the inline `<style>` of `src/index.html:91`, so a CSS-only grep finds seven. Of the eight, only `pop-out-window.css` (separate document, no `tokens.css`) and `glyph-tile.css` (shadow root, out of reach of the outer `*`) actually escape the reduced-motion override in `tokens.css` | `var(--dur-*)` and `var(--ease*)` only. JS-driven animation (`element.animate`, timed teardown) must read `prefers-reduced-motion` itself — the CSS media query cannot reach it. |
| Guessed z-index | Fifteen hand-picked values spanning 2 … 3000, one of them `z-index: 2000 !important` at `app.css:27` to break a tie with the modal | **(target)** Stacking comes from a named `--z-*` token (§4.5). Never a bare number, never `!important` for stacking. |
| Shadow alias sprawl | `resets.css` defines seven aliases over three real values; `--l2-shadow`, `--l2-shadow-upper-left` and `--l2-shadow-down` all render identically, so the directional names are lies | Use `--shadow-1` … `--shadow-4` directly. Never an alias, never a raw `box-shadow` colour. |
| Hidden identity | The project name disappears below 1100px; there is no dirty flag and no route back to the hub | Never hide identity or save state behind a media query. Shorten, do not drop. |
| Clipped shell | `#app__main-content { min-width: 720px }` at `app.css:33`, inside `overflow: hidden` — 200% zoom on a 1366px laptop clips the app with no scrollbar | The shell reflows to 640 CSS px. Never clip chrome; reflow or scroll. |
| Document without tokens | `pop_out_window.js` injects five sheets in order — `resets.css`, `colors.css`, `pop-out-window.css`, `dialogs.css`, `panels.css` — and never `tokens.css` | Any window, popup or shadow root that receives `resets.css` receives `tokens.css` **first**, and mirrors `document.documentElement.dataset.theme`. |
| Chrome outweighing content | *Judgement, not a gate:* if a surface is mostly headers, padding and dividers before the first real value, it is sparse and busy at once | Cut chrome, do not add space. Raise it with the owner rather than asserting a percentage. |
| Copy drift | `showToast`'s default message is the emoticon `'0_o'` | §8. |

### Grep gates — run over the diff, not the tree

Run these as literal regexes; the exceptions are part of the gate.

| Pattern | Expected |
|---|---|
| `#[0-9a-fA-F]{3,8}` · `rgba?\(` · `hsla?\(` · `:\s*(white\|black)\b` | zero outside `tokens.css` / `colors.css` |
| `--(gray\|blue\|royal\|purple\|orange\|green)-l[0-9]` · `--red\b` · `--(enabled\|disabled)-` · `--offWhite` | zero new |
| `uiColors` · `accentColors` · `--fancy-animation` | zero new references |
| `outline:\s*(none\|0)` | zero, unless the same rule draws a ring |
| `transition:\s*all` · a bare `*` selector carrying `transition` | zero |
| `[0-9]+ms` · `cubic-bezier\(` | zero **outside `tokens.css`** (which legitimately defines them) |
| `ease` `ease-in` `ease-in-out` `ease-out` `linear` as CSS keywords | zero — `var(--ease)` and `var(--ease-out)` are the only legal spellings |
| `font-family:[^;]*monospace` | only as `var(--font-mono)` |
| `keyCode` | zero new |
| `\.style\.(background\|backgroundColor\|color\|borderColor\|boxShadow\|fill)\s*=` | zero new — colour and shadow are attributes plus CSS (§5.2) |
| `\.style\.(left\|top\|right\|bottom\|width\|height\|maxWidth)\s*=` | zero new, **except** a surface positioned or sized from a measurement taken at runtime (§6.4) — `style.setProperty('--custom-prop', …)` is always allowed and is preferred |
| `z-index:\s*[0-9]` | zero new bare numbers |
| `global-outline-style` · `animate-slide-in` | zero — these properties do not exist |

---

## 3. File map — where the right thing lives

Cite a symbol, and a line number only as a pointer to it: symbols grep reliably and do not rot. The line numbers throughout this file are navigation aids, correct at the time of writing and free to drift; the symbol next to each one is what you actually search for.

### Does it already exist?

The commoner and costlier mistake in this repo is building a second copy of a shipped surface. Before you build one, grep `^export function show[A-Z]` across `src/` and read `collectCommands()`. What already ships: atlas export with engine presets, pixel size, texture size, padding and spacing (`showAtlasExportDialog`) · icon import and icon-map export (`showIconImportDialog`, `showIconMapDialog`) · anchor compose (`showComposeDialog`) · add component, add ligature, add/edit kern group, find and delete letter pair · choose-other-item and cross-project item pickers · the command palette and the shortcut sheet · project open/save from `menu.js`. **Extending one of these — a new preset, a new range, a new field — beats a parallel dialog every time.** If the answer really is a new surface, say in your summary which existing one you ruled out and why.

| You want to… | Go to | Note |
|---|---|---|
| Add or change any scale value or colour | `src/common/tokens.css` | The only file that may declare one. Three layers: primitives → semantics → components |
| Let canvas JS read a colour | `src/common/theme.js` — `CANVAS_TOKENS`, `getCanvasColors()`, `onThemeChange()`, `applyTheme()` | Every new `--canvas-*` name goes here in the same commit |
| Set a genuinely global element default | `src/common/resets.css` | Universal reset, `h1`–`h4`, `.number`, global `input`/`textarea`, `--animate-*` shorthands, and **three** `:focus-visible` rules — the universal ring (`:308`), an element-list duplicate (`:314-318`) and `canvas` / `edit-canvas` (`:356-362`), which sets `outline: 0` and deletes the ring. Never a component rule |
| Add a light-DOM stylesheet | `src/index.html` | Fixed order: `tokens.css` → `colors.css` → `resets.css` → feature sheets. Append after |
| Build any DOM | `src/common/dom.js` — `makeElement`, `addAsChildren`, `insertAfter`, `textToNode` | Never `createElement` + manual `setAttribute`; never a template string for structure |
| Add a reusable control | `src/controls/<kebab-name>/` | Folder name **is** the tag name. Register in `registerCustomComponents()` (`src/app/main.js`) **and** in `isFocusedOnInput()` (`src/edit_canvas/events_keyboard.js`) |
| Change panel information architecture | `sectionDefinitions` in `src/panels/sidebar.js` | `{ id, title, icon, subscriberPrefix, maker, defaultOpen, isAvailable, skipOnRefresh }` |
| Build a panel row | `src/panels/cards.js` — `makeSingleLabel`, `makeSingleInput`, `makeSingleCheckbox`, `makeDirectCheckbox`, `dimSplitElement`, `makeLinkReferenceRow` | Never a local copy in a panel file |
| Add a canvas or panel command | `getActionData()` in `src/panels/actions.js` | Canvas menu and panel buttons both derive from it, so they cannot drift |
| Add a command-palette entry | `collectCommands()` in `src/controls/command-palette/command_palette.js` | Feature dialogs register here, separately from `getActionData()`. The keyword field is `searchText` |
| Style canvas chrome | `src/pages/editor-pages.css` | `.editor__page` owns `--left-sidebar-w`, `--right-sidebar-w`, `--float-inset` |
| Style the shell / top bar / hub | `src/app/app.css`, `src/app/menu.js` / `src/app/app-pages.css`, `src/app/open_project.js` | |
| Add settings copy | `src/pages/settings_data.js` | Rows are built by `makeOneSettingsRow`, which is exported from `src/pages/settings.js`, not from the data file; groups are `project`, `font`, `app` |

**Model new work on these, they are the house style done right:** `src/anchors/anchors.css` · `src/formats_io/atlas/atlas-export.css` · `src/icon_font/icon-font.css` · `src/metrics/metrics.css` · `src/panels/sidebar.css` · `src/controls/command-palette/command-palette.css`.

**Do not model new work on these, they are pre-token and being migrated out:** `src/panels/panels.css` · `src/pages/content-pages.css` · the modal half of `src/controls/dialogs/dialogs.css` · `src/common/colors.css` · `src/common/colors.js`.

---

## 4. The token contract

### 4.1 Three layers, one direction

```
primitives   --n-*  --a-*  --danger|warn|ok-40/50/60  --violet-40/50/60  --brand-* (target, §4.5)
    ↓
semantics    --bg-*  --border-*  --text-*  --icon-*  --accent*  --canvas-*  --shadow-*
    ↓
components   --font-*  --fs-*  --sp-*  --r-*  --control-h*  --row-h  --icon-size*  --dur-*  --focus-*
```

- A component stylesheet reads **semantics and components only**. Referencing `--n-*`, `--a-*`, `--danger-50` or `--violet-50` from a feature file is a defect. The one carved exception is the brand primitives — `--brand-tint`, `--brand-black`, `--brand-paper` — which have no semantic aliases, and which brand chrome (§7) may read directly. Nothing else may. **(target)** None of the three is in `tokens.css` yet: author the one you need per §4.5 in the same commit as your first use, and never write `var(--brand-tint)` before that declaration exists.
- Light is the base on bare `:root`; dark is a delta under `:root[data-theme='dark']`. **Never define a colour for the first time inside a `[data-theme]` or media block** — a colour that exists only in dark belongs in the primitive layer.
- Only the semantic layer changes between themes. Type, spacing, radius and motion are theme-invariant.
- Theme is a `data-theme` attribute on `<html>`, stamped before first paint. `prefers-color-scheme` is only the pre-paint `color-scheme` hint.

**A colour need §4.2 does not cover.** First try harder to reuse: nearly every need is an existing semantic under a different name. If it is genuinely new — (1) add or reuse a primitive on bare `:root`, named by ramp position, never by use; (2) add the semantic on bare `:root`, named by **role**, in the same family as its neighbours (`--bg-*`, `--text-*`, `--icon-*`, `--border-*`); (3) add the dark override in the `[data-theme='dark']` block in the same commit; (4) compute both themes against their grounds (§4.4) before you use it; (5) if it is a canvas colour, add the name to `CANVAS_TOKENS` too (§6.1). A semantic is warranted when two unrelated surfaces need the same role, not when one surface needs a shade.

### 4.2 Which token

| Need | Reach for |
|---|---|
| Window ground | `--bg-app` |
| Panel, card, menu | `--bg-surface`; floating/elevated `--bg-surface-raised`; input well, inset, preview `--bg-surface-sunken` |
| Interaction ground | `--bg-hover`, `--bg-active`, `--bg-selected`, `--bg-selected-strong`, `--bg-disabled` |
| Hairline / edge / emphasis | `--border-subtle` / `--border-default` / `--border-strong`; selected `--border-selected`; `--border-disabled` |
| Text | `--text-primary`, `--text-secondary`, `--text-disabled`, `--text-on-accent`, `--text-accent`, `--text-danger`. `--text-tertiary` is decoration only — see 4.4 |
| Icons (a separate family from text, deliberately — icons need more weight at the same size) | `--icon-default`, `--icon-strong`, `--icon-accent`, `--icon-on-accent`, `--icon-disabled` |
| Interaction | `--accent`, `--accent-hover`, `--accent-press` |
| Status | `--danger`/`--danger-bg`, `--warn`/`--warn-bg`, `--ok`/`--ok-bg` |
| Elevation | `--shadow-1` … `--shadow-4`. Dark elevation is diffusion and larger blur, not heavier black |
| Focus | `--focus-style` + `--focus-offset`; colour `--focus-ring`, width `--focus-ring-width` (2px) |
| Canvas, in CSS | `--canvas-bg`, `--canvas-ink`, `--canvas-grid`, `--canvas-selection`, … (16 names) |
| Canvas, in JS | `getCanvasColors().bg / .ink / .grid / .anchor / .selection / .pointSelected / .metricStrong / .handle` |

### 4.3 Scales

| Axis | Scale | Rule |
|---|---|---|
| Space | `--sp-0` 0 · `--sp-1` 2 · `--sp-2` 4 · `--sp-3` 6 · `--sp-4` 8 · `--sp-5` 12 · `--sp-6` 16 · `--sp-7` 20 · `--sp-8` 24 · `--sp-9` 32 · `--sp-10` 40 | 4px grid. Migrating legacy: 3/5→4, 7/9/10→8, 11/13→12, 14/15→16, 25→24, 30→32. Never create vertical space with a spacer element (`rowPad()` is banned in new code) |
| Type | `--fs-2xs` 10 · `--fs-xs` 11 · `--fs-sm` 12 · `--fs-md` 13 · `--fs-lg` 15 · `--fs-xl` 18 · `--fs-2xl` 22 · `--fs-3xl` 28 | **By role, never by feel:** 10 = uppercase eyebrows with `--tracking-caps` only · 11 = metadata, key caps, tabular readouts, captions attached to a control · 12 = control labels and table cells · 13 = body and panel prose (the UI default) · 15/18/22 = h3/h2/h1 via `resets.css` only. Never `em` for font-size — it compounds against the universal reset and lands on fractional pixels. Never below 10 |
| Line height | `--lh-tight` 1.2 · `--lh-normal` 1.45 | `1` for single-line controls, tight for headings, normal for prose. **Never a px line-height** — centre with `display:flex; align-items:center` plus a height token |
| Weight / tracking | `--fw-normal` / `--fw-medium` / `--fw-semibold`; `--tracking-tight`, `--tracking-caps` 0.06em | Uppercase labels are always `--fs-2xs` + `--tracking-caps` + `--fw-semibold` — four of the five shipped eyebrows already are (`command-palette.css:72` and `:227`, `sidebar.css:147`, `nav.css:139`); `app-pages.css:306` is the lone `--fw-medium` outlier and migrates on the line you touch |
| Font | `--font-ui` everywhere; `--font-mono` for numbers, codepoints, key caps, code | Always write `var(--font-mono)` — bare `monospace` resolves to Courier New on Windows, where most of this audience is. Never use `--font-brand` / FiraGo for UI or canvas text |
| Radius | `--r-xs` 3 · `--r-sm` 5 · `--r-md` 8 · `--r-lg` 12 · `--r-pill` 999 | Inputs and in-row controls `--r-xs`; buttons, chips, swatches `--r-sm`; cards, menus, popovers `--r-md`; dialogs and floating panels `--r-lg`; strips and pills `--r-pill`. An off-scale radius you encounter migrates to the nearest step on the line you touch. Asymmetric radius only to join two physically touching controls, as `input-number.css` does |
| Heights | `--control-h-sm` 24 · `--control-h` 28 · `--control-h-lg` 32 · `--row-h` 28 · `--tool-size` 32 · `--topbar-h` 44 | §1 property 2 |
| Icons | `--icon-size` 16 · `--icon-size-lg` 20 | Two sizes only. Icons are inline SVG on a 16- or 20-unit viewBox, `fill="currentColor"`, `aria-hidden="true"` — never an `<img>` |
| Borders | **(target)** `1px`, with `--focus-ring-width` (2px) the only 2px that survives migration. Seven literal 2px borders still ship (`app-pages.css:468`, `resets.css:121` and `:297`, `command-palette.css:170`, `panels.css:643`, `:652`, `:832`) | Never a new 2px border. Never 3/5/10/12px — `panels.css:539` and `:546` carry `border-left-width: 10px`. Never `border-image-width` |
| Motion | `--dur-fast` 90ms · `--dur-base` 140ms · `--dur-slow` 220ms; `--ease`, `--ease-out`; bundle `--transition-color` | Entrances and moves **decelerate** (`--ease-out`); exits and state changes use `--ease`. Only `opacity`, `transform`, `background-color`, `border-color`, `color`, `fill`, `box-shadow`, `outline-color` may animate. Nothing in editor chrome exceeds 250ms. *Using* the currently-unused `--dur-slow` / `--ease-out` is correct; adding a fourth duration is not |
| Prose measure | `max-width: 62ch` | Never a px measure on a text block |

**Declared but unread** — do not treat them as endorsement: `--fs-3xl`, `--lh-loose`, `--sp-0`, `--sp-10`, `--font-brand`, `--focus-ring-offset`, and eight of the sixteen `--canvas-*` tokens. All sixteen are listed in `CANVAS_TOKENS` and returned by `getCanvasColors()`, so nothing is missing there — the eight no draw code reads are `inkMuted`, `metric`, `guide`, `selectionFill`, `handleStroke`, `handleLine`, `point` and `snap`, exactly the complement of the eight in §4.2. Delete a `--canvas-*` nothing reads rather than leaving it as decoration.

### 4.4 Contrast, non-negotiable

- Body and secondary text ≥ 4.5:1. Borders, icons, focus rings, canvas affordances and state fills ≥ 3:1. Compute against the **composited** result for any `hsla()` token, **in both themes**.
- Known failures — do not build on them: `--text-tertiary` 2.99:1 light, `--text-disabled` 2.18:1 light, every **neutral** `--border-*` token (`--border-subtle`, `--border-default`, `--border-strong`, `--border-disabled`) between 1.17:1 and 1.79:1 in both themes. `--border-selected` is the exception: it resolves to `--a-50` in both themes, 3.54:1 on white. White on `--accent` (`--a-50`) is likewise 3.54:1; only `--a-60` clears it at 4.52:1, so that is the fill that can carry `--text-on-accent`.
- **Never stack `opacity` on a text or icon token.** Dimmed, hidden and disabled states get their own token.
- **Never pair `--fs-2xs` with `--text-tertiary`** — 2.99:1, a straight AA failure at the smallest size in the app. The shipped card eyebrow (`.panel__card h3`, the `color` declaration at `sidebar.css:150`) does exactly this; §6.2 gives the replacement. `--text-secondary` (`--n-58`, 5.6:1 on white) is the smallest-size pairing that clears AA.
- Never encode a state by hue alone. Selected vs unselected must also differ by shape, size or weight.

### 4.5 Tokens that do **not** exist yet — author before first use

If your change needs one of these, add it to `tokens.css` in the same commit, under exactly this name. Do not invent a synonym, and do not ship the literal instead.

| Name | Value / shape | For |
|---|---|---|
| `--z-base` `--z-resizer` `--z-canvas-float` `--z-sticky` `--z-dropdown` `--z-shell` `--z-modal` `--z-toast` `--z-alert` `--z-menu` `--z-command-palette` | 0 · 5 · 10 · 100 · 1000 · 2000 · 2005 · 2010 · 2020 · 2030 · 3000 | Every stacking decision. `--z-modal` sits one step above `--z-shell` on purpose: that one step is what lets `z-index: 2000 !important` be deleted from `app.css:27` in the same commit, and it keeps the modal under the toast, the alert and the context menu, which is where they ship today |
| `--scrim` | one value per theme | Modal `::backdrop` and the palette overlay |
| `--opacity-disabled` `--opacity-muted` `--opacity-overlay` `--opacity-scrim` | 0.4 · 0.6 · 0.8 · 0.45, decimal notation only | Disabled, muted, overlay, scrim |
| `--panel-label-col` | 96px | The single label track for every panel card above the 320px container breakpoint. Below it the shipped container query still collapses the card to one column — that override stays |
| `--focus-ring-inset` | box-shadow built from `--focus-ring` | Elements that cannot use `outline` (inside `overflow: hidden`, or drawing their own border). Note the near-name `--focus-ring-offset` already exists and is unread — not the same token |
| `--checker-a` `--checker-b` | light + dark | The alpha checkerboard behind the atlas preview |
| `--brand-tint` | `#B0EEFC`, **primitive layer**, read directly by brand chrome | Brand chrome only — §4.1, §7 |
| `--brand-black` | `#0A0A0F`, **primitive layer** | The ground of a full-bleed brand surface (splash, About hero) — brand chrome only |
| `--brand-paper` | `#F0EDE6`, **primitive layer** | Brand text on `--brand-black` in dark theme — brand chrome only |

**The z-scale is named after what already sits at each value** — verify that before you rename anything, because a name that lies is exactly the shadow-alias failure §2 condemns. Today: 2000 is both `#app__top-bar` (`app.css:27`) and the modal (`dialogs.css:268`), which is why the `!important` exists; 2010 is the toast **and** the error box — one shared `#toast, #error` rule (`dialogs.css:18`) — plus the info-bubble popup (`info-bubble-popup.css:11`), so the error box rides `--z-toast` and `--z-alert` is the *notation* box, which sits alone at 2020 (`dialogs.css:48`); 2030 the context menu (`dialogs.css:124`); 3000 the palette (`command-palette.css:12`) and an inline value at `events_keyboard.js:506`. Once `.showModal()` lands, the modal leaves the z-index stack entirely and `--z-shell` can stop fighting it. One value is unmapped — `z-index: 2` at `panels.css:1030`; decide its home when you write the scale.

Two modules are missing the same way; create each the first time you need it. `src/common/product_identity.js` — product name, domain, support address, repo, licence link; route every string through it (§8). `src/controls/dialogs/dialog_sizes.js` — the JS-side scale values a CSS custom property cannot reach: dialog max widths (`DIALOG_W_SM` 640, `DIALOG_W_MD` 720, `DIALOG_W_LG` 760) and toast durations (`TOAST_SHORT` 2000, `TOAST_DEFAULT` 3000, `TOAST_LONG` 5000). That file is the *only* sanctioned home for a numeric scale value outside `tokens.css`, and it exists because `showModalDialog()` and `showToast()` take JS numbers.

---

## 5. Controls — reuse before you build

**Registered custom elements** (`registerCustomComponents()`, `src/app/main.js`): `fancy-button`, `input-number`, `option-chooser`, `option-toggle`, `glyph-tile`, `info-bubble`, `font-preview`, `display-canvas`, `edit-canvas`.
**Factories:** `TabControl`, `makeFancySlider`, `makeProgressIndicator`; and from `src/controls/dialogs/dialogs.js`: `makeContextMenu`, `showToast`, `showError`, `showNotation`, `showModalDialog`, `animateRemove`, `closeEveryTypeOfDialog`; plus `showCommandPalette` / `showKeyboardShortcuts`.

| You need | Use | Never |
|---|---|---|
| A number, coordinate or metric **bound to a project item** | `makeSingleInput(item, property, topic, 'input-number')` | a raw `<input type="number">`, a local number class |
| A number in a **dialog**, where there is no item, property or pubsub topic | `makeElement({ tag: 'input-number', attributes: { value } })` directly, read back from its `change` event | `makeSingleInput` — it requires an item and a property and publishes to the project editor, which has no meaning here |
| A dropdown | `option-chooser` | `<select>` — unstyled, OS-chromed, theme-blind |
| A two-way choice | `option-toggle` | a pair of buttons |
| A button in product UI | `fancy-button` with `secondary` / `minimal`; for `danger` see below | `.hub-button` (hub only), a bespoke `.anchors__compose`-style class |
| A paired-field separator | `dimSplitElement()` | a spacer div, a local width |
| A checkbox | `makeSingleCheckbox` / `makeDirectCheckbox` | a per-page checkbox override |
| A dialog field | **(target)** a shared `src/controls/field-row/` module with its own namespace. **Today:** `makeFieldRow` at `atlas_export.js:699` is a plain non-exported function emitting `atlas-export__*` classes — do not import it and do not borrow its namespace. Copy its shape — a two-column grid, label cell and control cell, hint stacked inside the control cell — into your feature's own namespace, and say in your summary that the promotion is outstanding | a `makeRow` that invents a fourth row shape |
| Help on a label | `info-bubble` | a `title` attribute alone |
| A menu | `makeContextMenu` | a bespoke popup |
| Progress | `makeProgressIndicator()` | a long-duration toast |
| A completion message | `showToast()` with a count, duration from `dialog_sizes.js` (§4.5) | a toast for a validation error (§8) |

**`input-number` cannot express bounds.** Its `observedAttributes` is `['disabled', 'value', 'locked', 'unlocked']`, and `sanitizeValue` does `Number(input) || 0` — the silent coercion authoring rule 9 below forbids. Until `min` / `max` / `[invalid]` are added to that control, clamp in your own `change` handler, write the clamped value back with `setAttribute('value', …)`, and state the range in the field hint. Do not copy `makeNumberField` (`atlas_export.js:618`), which ships a raw `<input type="number">` with `min` / `max` attributes; report the `input-number` bounds gap under §9.3.

**`fancy-button[danger]` is not shippable as it stands.** `fancy-button.css:176-188` renders it as `linear-gradient(135deg, var(--orange-l50), var(--red))` with `.buttonText { background: white }` and `animation: var(--fancy-animation)` — ramp colours, a literal white and a 120s infinite gradient, and it differs from the default by hue alone. If your work needs a destructive button, migrate that one rule in the same commit — `--danger` fill, `--text-on-accent` text, no `animation`, plus a non-hue difference (an icon, or `--fw-semibold`) — rather than shipping the current one or inventing a local class.

**Authoring contract**

1. Folder name = tag name; JS snake_case, CSS kebab-case. Shadow-DOM controls `import style from './x.css?inline'` and inject it as the **first** child of the shadow root. Light-DOM control CSS is `<link>`ed in `src/index.html`, never imported by JS.
2. One `.wrapper` div is the styled root; host attributes are mirrored onto it. Visual state is a boolean/enum **HTML attribute** — `[disabled]`, `[selected]`, `[deployed]`, `[session-state='…']` — never a CSS class, and never `element.style` for colour or shadow.
3. `static get observedAttributes()` + `attributeChangedCallback` drive every re-render. Signal out with `new Event('change')` or a `CustomEvent`.
4. Paste this verbatim into every control stylesheet — the global rule in `resets.css` cannot cross a shadow boundary:
   ```css
   :focus-visible { outline: var(--focus-style); outline-offset: var(--focus-offset); border-radius: var(--r-xs); }
   ```
5. Exactly one real tab stop per control; decorative parts get `tabIndex -1`. Disabling removes listeners and strips `tabIndex`. Never set a positive `tabindex`.
6. Icon-only controls carry `title` **and** `aria-label`, plus `aria-pressed` or `aria-expanded` when stateful; their SVG carries `aria-hidden="true"`. Menus and listboxes use roving tabindex with `role="menu"/"menuitem"` or `listbox`/`option`, and `aria-activedescendant` when focus stays in an input.
7. Every dismissible surface gets a `closeAllX()` added to `closeEveryTypeOfDialog()`, tears down via `animateRemove()`, and must survive in the pop-out document — use `element.ownerDocument` / `ownerDocument.defaultView`, never global `document` / `window`.
8. Never `display: contents` on anything focusable or anything needing a background, border, padding or outline — the box and all four disappear.
9. Ship all seven states (§1 property 8). Expose `[invalid]` + `aria-invalid`; a bad value typed into a sidebearing or advance-width field must be rejected, not silently coerced to `0`.

**Keyboard contract — read `event.key`**

| Keys | Behaviour |
|---|---|
| Enter, Space | Activate a button; open a menu or dropdown |
| Up / Down | Move within a list or menu |
| Left / Right | Move within a segmented control; resize a divider |
| Home / End | Jump to first / last |
| Escape | Close the topmost layer only, and return focus to the trigger |
| Cmd/Ctrl+K | Command palette |

Never rebind Cmd/Ctrl+Z, S, A, C, X, V or F. Display modifiers in the order Control-Option-Shift-Command. Gestures that already follow the convention, and that you must not re-implement: wheel pans, shift+wheel pans horizontally, ctrl/cmd+wheel zooms toward the pointer (`events_mouse.js:493-516`), space-drag pans (`events_keyboard.js:111` / `:567`), and wheel-click pans (`events_mouse.js:49-54`, which share `togglePanOn` / `togglePanOff` with space-drag). **(target)** canvas view shortcuts, none of which are bound yet: Shift+1 zoom to fit, Shift+2 zoom to selection, Shift+0 100%, Cmd/Ctrl+' pixel grid.

*Done when:* registered in both places · seven states · pasted focus snippet · `event.key` · 24px targets · no ramp colour, no `--enabled-*`, no literal `white`/`rgb()`.

---

## 6. Surfaces

### 6.1 Edit canvas

**Colour has exactly one path.** (1) Define the token in **both** the `:root` and the dark block of `tokens.css`. (2) Add its name to `CANVAS_TOKENS` in `theme.js` — *a 2D context cannot read CSS custom properties, so without this step the colour is unreachable.* (3) Read it with `getCanvasColors()` **inside** the draw function, refreshed through an `onThemeChange()` callback. Never `getComputedStyle` in a render loop, never cache across a theme change, never a literal in `fillStyle` / `strokeStyle`, never import `uiColors` or `accentColors`.

- The canvas is the **ground**: `position:absolute; inset:0`, no border, radius, shadow or layout track. All chrome floats above it. **Statically placed** chrome positions with `calc()` from `--float-inset`, `--left-sidebar-w`, `--right-sidebar-w` — never a hardcoded offset (`#done-creating-path-button { left: 530px; top: 107px }` at `editor-pages.css:288` is the live counter-example, and it is a bug, not a pattern).
- **Selection-tracking chrome** (a contextual toolbar, a measurement badge) is the sanctioned exception to the no-inline-style rule, and it has one recipe: convert the selection bounds from em-space with `sXcX` / `sYcY`, clamp the result inside the canvas rect, then write **custom properties** on the floating element — `el.style.setProperty('--anchor-x', \`${x}px\`)` — and let its stylesheet place it from those, as `sidebar.js:408` and `:447` already do for `--left-sidebar-w`. Writing `style.left` / `style.top` directly is the fallback the existing floating surfaces use (`dialogs.js:281-284`, `info_bubble.js:90-91`); it is permitted, the custom property is preferred, and either way the values come from a measurement, never from a constant. During a drag such a surface **hides** and returns on pointerup: a toolbar that chases a moving selection re-enters on every frame, which is the §1 property 7 failure applied to the canvas.
- All floating surfaces share one treatment: `--bg-surface` + `1px solid var(--border-default)` + `--r-lg` (`--r-pill` for strips) + `--shadow-3` (`--shadow-2` for the zoom pill).
- Redraw via `redraw(caller)`, never `paint()` directly, so publishes in one tick collapse into one frame. Every coordinate conversion goes through `sXcX` / `sYcY` / `cXsX` / `cYsY`. Snap 1px strokes with `makeCrisp()` or `Math.round(v) + 0.5`. DPR is applied once, in `updateCanvasSize()`; nothing downstream knows about it.
- UI sizes are constant CSS pixels converted to em by **dividing** by `view.dz` — never multiplied by zoom. Drawn size and hit size are separate numbers.
- Hit testing is geometric — cached `Path2D` + `isPointInPath`, or a bounding-box pre-pass. **Never allocate an offscreen canvas or call `getImageData` in a mousemove path.**
- Every tool defines **both** a cursor in `updateCursor` and a hover affordance drawn in `paint()`; a tool with no pointer feedback is unfinished. Set the cursor on the canvas element, never `document.body`. Every direct-manipulation target draws idle / hover / active.
- A disabled tool sets the real `disabled` attribute, guards its click handler, and carries that state through every icon re-render. Dimming the SVG is not a disabled control.
- **(target)** Give every tool button `title`, `aria-label` (name plus shortcut) and `aria-pressed`; give the strip `role="toolbar"` with roving-tabindex arrow movement. Today `tools.js:95-97` sets `title` only, and there is no `role="toolbar"` anywhere in the repo — add all three to the buttons you touch, and say in your summary that the strip role is outstanding. Shortcut letters live in the tooltip **and** in the key handler — edit both together.
- **Every drag shows its number, painted on the canvas:** dx/dy while moving, W×H while resizing or drawing, the value while dragging a side bearing or kern — drawn inside `paint()` with `ctx.fillText` next to the thing being dragged, exactly as the rotation affordance draws its degrees (`draw_edit_affordances.js:291`). The readout is never DOM chrome, which is precisely why hiding a floating toolbar for the duration of a drag costs nothing.
- Canvas typography composes from `--font-ui` / `--font-mono` and the `--fs-*` values through one shared helper. Never a new font stack in a `ctx.font` string; never ship debug labels.
- Clamp `view.dz` to an explicit min and max, and zoom about the pointer or the canvas centre — never the view origin.
- Canvas drags use Pointer Events with `setPointerCapture`, released on pointerup **and** pointercancel, plus a `body` class locking the cursor for the gesture. `makeResizer` (`sidebar.js:426-488`) is the precedent for capture and for the body class (`is-resizing-sidebar`, styled at `editor-pages.css:180`); it registers only `pointerdown`/`pointermove`/`pointerup`, so it is **not** a precedent for the pointercancel release — write that one yourself.

*Done when:* colour via `CANVAS_TOKENS` + `getCanvasColors()` · 24px hit targets · geometric hit testing · cursor **and** hover affordance · a readout during the drag.

### 6.2 Inspector panels and sidebar

- A section is the only top-level container. A `.panel__card` inside `.sidebar__section-body` **drops** its frame — never re-frame a card inside a section.
- A panel maker returns cards and nothing else. `sidebar.js` owns mounting, refreshing and section chrome; makers never touch `.sidebar__*` DOM.
- Every `subscriberID` a maker registers must start with the section's `subscriberPrefix` — `unsubscribe` matches by substring.
- Closed sections build nothing. Refreshes coalesce to one rebuild per animation frame. A section holding live interaction state sets `skipOnRefresh: true`. A rebuild restores **focus and caret**, not only `scrollTop` — prefer updating existing inputs in place over tearing the body down on every publish.
- **(target)** Every row lands on the shared card grid `var(--panel-label-col) minmax(0,1fr)` (§4.5), `min-height: var(--row-h)`, controls at `--control-h-sm`. Paired number inputs use `minmax(0,1fr)`, never bare `1fr`. The container query below still wins under 320px and that is intentional — at the 220px sidebar minimum a fixed 96px label track cannot hold a paired field, which is why the collapse exists. A raw px height in `panels.css` or `sidebar.css` is a review failure.
- Label text goes **directly on the `<label>`** element — never inside a wrapper span, or the universal font-size reset wins and the narrow-sidebar step does nothing.
- Exactly three panel type roles: section title `--fs-md`/`--fw-semibold`/`--text-primary`; **(target)** card eyebrow `--fs-2xs`/uppercase/`--tracking-caps`/`--fw-semibold`/**`--text-secondary`** — the shipped `.panel__card h3` already carries `--fw-semibold` (`sidebar.css:147`) and needs no weight change, but its `color: var(--text-tertiary)` (`sidebar.css:150`) is 2.99:1, the exact pairing §4.4 bans, so migrate that one declaration on any card you touch; row label `--fs-sm`/`--fw-normal`/`--text-secondary`. The eyebrow is an `h3`. **Never `h4` inside a `.panel__card`.**
- Responsiveness inside a sidebar is a **container query** on `container-name: sidebar-body` — never a media query; what matters is the dragged width. Rules inside it carry the full `.sidebar__section-body` prefix, because a container query adds no specificity. Sidebars run 220–520px, defaulting to 280 (left) and 300 (right), so the collapsed single-column state is the *common* case, not the edge case — design the card for it first.
- Full-bleed a list by negative-margining the body padding and re-padding the row, not by removing the body padding.
- **(target)** `.full-width` is the only span-all-columns class you write. The other two still ship — `spanAll` (14 references, all in `menu.js`) and `span-all-columns` (8, all under `app/cross_project_actions/`) — and migrate on the line you touch. New classes are BEM under an existing block (`panel__`, `sidebar__`, `item-link__`, `layer-row__`): no camelCase, no orphan blocks, and all rules for one selector in one contiguous block.
- Panel icons are single-colour `currentColor` SVG coloured from CSS. Never bake an `accentColors`/`uiColors` string into SVG markup; never call `makeIcon()` without an explicit colour. Every icon-only button gets `aria-label`; every `.panel__actions-area` gets a visible eyebrow naming its group.

*Done when:* one label column above 320px · 28px rows · no raw px · no `h4` · focus survives a rebuild · `aria-label` on every icon button.

### 6.3 Shell, hub and non-editor pages

- Every full-window surface is a child of the `#app__wrapper` grid (row 1 `--topbar-h`, row 2 content). Never cancel a grid row with `position: relative; top: -Npx` or `height: 100vh`.
- **(target)** `makeAppTopBar()` renders on **every** full-window page, hub included. The bar adapts its contents; it never disappears. One theme control, one implementation.
- **(target)** Every top-bar control is `--control-h` (28px); `--control-h-sm` belongs inside panels and rows. Today only `.top-bar__theme-toggle` (`app.css:74-76`), `.top-bar__command-search` (`:275-276`, and `:343` in its narrow-window override) and the `.top-bar__menus` container (`:67`) comply — `.menu-entry-point` (`app.css:101`), `.top-bar__bug-contact` (`:129`) and `.breadcrumb__button` (`:399`) are still 24px. Build new bar items at 28px; migrate a 24px one only on the line you touch.
- Keep the shell usable to 640 CSS px. Keep the open project's name and its save state visible at every width. **(target)** Show save state explicitly — "Saved 2m ago" / "Saving…" / "Unsaved changes" — from a real dirty flag, and gate `onbeforeunload` on that flag rather than on a setting. **(target)** Provide a route back to the hub from the Projects menu **and** the command palette.
- Escape closes every menu, dropdown and popover from the single global handler, and returns focus to the trigger. Dropdowns position from the trigger's `getBoundingClientRect()`; nav dropdowns are selected as `nav[id^='nav-dropdown']`, never bare `nav`.
- Hub work reuses the `hub-sidebar__*`, `hub-header__*`, `hub-card__*`, `hub-button(--primary|--large|--icon)`, `hub-panel__*`, `hub-empty__*`, `hub-drop__*` families — never a parallel set, and never `.hub-button` in product dialogs. **Which side of the seam a surface sits on is decided by where it is rendered, not by what it does:** rendered inside a hub view, it is hub chrome and uses the hub families; rendered over the editor, it is product UI and uses `fancy-button`. `.hub-button` has no `--danger` variant — a destructive hub action uses the plain `.hub-button` with `--text-danger` and an explicit verb ("Delete 3 projects"), and is **not** the view's `--primary`. Exactly one `--primary` button per view, it performs the constructive action, and navigation gets the plain `.hub-button`.
- **(target)** Empty states come from a shared `makeEmptyState` exported from `open_project.js` and taking the button variant as an argument. Today it is a non-exported function at `open_project.js:385` that hardcodes `hub-button hub-button--primary` and `hubIcons.plus`. **The first-time-user case already ships:** `makeRecentsView()` calls it at `open_project.js:413` when there are no auto-saves, so a request for a hub empty state is almost always a request to edit that copy, not to add a surface — and §3's `show[A-Z]` grep cannot catch it, because this is a non-exported view helper. Read the view's own builder before you write one. Where a view genuinely has none and already has a primary CTA, imitate this markup (one fragment naming what is missing, one plain `.hub-button`) rather than reusing the helper and shipping two primaries. Never ship an empty container.
- Never instantiate a project or parse project text synchronously inside a view builder. Paint the frame, then fill previews asynchronously.
- Selected state is the bare `selected` attribute toggled with `toggleAttribute`, styled `[selected]` — never `.is-selected`. A tab strip is `role="tablist"` / `role="tab"` with `aria-selected` and arrow keys, placed directly above the panel it controls.
- Settings copy lives in `settings_data.js`; every row comes from `makeOneSettingsRow` and returns the same four cells. Let labels wrap — never substitute `&nbsp;` or non-breaking hyphens to control layout.

### 6.4 Dialogs and overlays

- **(target)** Open with `.showModal()`, scrim on `::backdrop` from `--scrim` (§4.5). **Today** no modal uses it: `showModalDialog()` → `makeModalDialog()` (`dialogs.js:433`, `:446`) appends a `<dialog>` and forces it visible, and fixing that changes behaviour at all eighteen existing `showModalDialog()` call sites, plus the one direct `makeModalDialog()` call at `pop_out_window.js:352` inside the pop-out document. So a new dialog calls `showModalDialog()` like every other, and the parts you *can* deliver without touching shared code you must: an accessible name, focus moved to the first meaningful control on open, focus restored to the opener on close, and Escape wired to `closeEveryTypeOfDialog()`. If your task makes the `.showModal()` migration worth doing, follow §9.3 rather than doing it silently.
- **(target)** The dialog's own header carries the title and the dismissal. Today `makeModalDialog` renders `.modal-dialog__header` as an empty `<span></span>` plus the close button, and all three house dialogs put their title in an `h2` inside the body — match that shape so you do not ship a headerless dialog, and keep it to **one** `h2`, with no per-dialog padding stacked on the body's inset.
- The house dialog-body shell, used verbatim by `icon-font.css`, `anchors.css` and `atlas-export.css`: `display: grid; gap: var(--sp-6); padding: var(--sp-7); max-height: 78vh; overflow-y: auto`.
- Width comes from the sizes the fork surfaces already use — 640, 720, 760 — passed as `DIALOG_W_SM` / `_MD` / `_LG` from `dialog_sizes.js` (§4.5), because `makeModalDialog` applies the width as a JS number (`content.style.maxWidth`) and a CSS custom property cannot reach it. Never introduce a new literal; the legacy 500 / 600 / 800 / 850 call sites are not to be extended.
- Fields are a two-column row — a label cell and a control cell, with the hint stacked *inside* the control cell beneath the control — in your feature's own namespace; see the §5 `makeFieldRow` entry, and `atlas-export.css:42-47` for the shipped `132px minmax(0, 1fr)` grid. A noun-phrase label, then one or two complete sentences saying what the value does and what goes wrong if it is set badly. Select options read `Value — explanation` with an em dash. Every control gets a `<label for>` or an `aria-label` — a styled div is a caption, not a label.
- Reserve `--fs-xs` / `--text-tertiary` for a caption attached to a control. Dialog-level status and warnings are `--fs-sm` / `--text-primary` on a tinted ground.
- Position overlays from the viewport or the anchor's `getBoundingClientRect()` — never a hardcoded `left`/`top`. Apply the measured result as a custom property where you can, or as `style.left` / `style.top` where the existing surfaces do (§6.1 gives the recipe); the gate is that the number came from a measurement.
- Toasts stack, each with its own timer; clear the previous timeout before scheduling a new one; duration from `dialog_sizes.js`, never above `TOAST_LONG` (5000), and use an explicit persistent-toast API for progress.
- Transient feedback containers get `role="status"` / `aria-live="polite"` (or `role="alert"`) **at creation**, not per message.
- One transient layer at a time: never cascade popovers, never stack two alerts, Escape closes only the topmost. To move from one dialog to another — an atlas-export entry point offered inside the icon-font dialog, say — call `closeEveryTypeOfDialog()` and then the other feature's exported entry point, as `pop_out_window.js:310-311` does. Never open the second over the first.
- **Never render another feature's class names.** If two dialogs need the same row, select, textarea, checkbox or actions bar, promote it into a shared module under `src/controls/` with its own namespace and delete every local copy.

*Done when:* focus in and out · one title, in the shipped header shape · named width constant · every control labelled · no borrowed namespace · any `.showModal()` gap reported under §9.3.

### 6.5 Fork feature surfaces — pixel, icon, anchors, metrics, atlas

These five are why the fork exists (`pixel_font/`, `icon_font/`, `anchors/`, `metrics/`, `formats_io/atlas/`). Their logic is the best code in the repo; hold their chrome to the same standard.

- Open each file with an uppercase block comment naming the surface and the one design decision behind it.
- One BEM namespace per feature, and the shipped five are `icon-import__`, `atlas-export__`, `anchors__`, `compose__`, `metric-key__`. **The list is not closed.** A genuinely new surface declares a new namespace in the same kebab-case shape and adds it here. What is banned is rendering an *existing* feature's namespace from another feature: if feature A needs feature B's surface, call B's exported entry point (§3, *Does it already exist?*); if it needs only part of it, promote that part into `src/controls/` under a neutral namespace (§6.4).
- **Plan-then-do:** render a table of exactly what will happen, and let the same function perform the work. Never a second code path. Previews are produced by the export code itself, so what is shown is what is written.
- Containers that can be empty collapse with `:empty { display: none }`. Unbounded lists get `max-height` + `overflow-y: auto`, with the primary action kept reachable.
- Multi-item writes use `addWholeProjectChangePreState` / `PostState`; single-item writes use `addState(title)` with a human-readable title. Both are project-editor scoped — a hub-level action has no history stack, so it runs the two-step confirm (§8) before acting instead of offering undo.
- Every completed action ends in a **counted** toast; failures end in a toast or error — never silence.
- Every feature gets a `collectCommands()` entry with a long lowercase `searchText` string in game-developer vocabulary.
- Engine presets supply `label`, `note`, `steps` and optional `caveat` — any new export target supplies all of them.
- **Never rasterise glyphs synchronously on dialog open or on every change.** Paint first, debounce rebuilds, show the progress indicator, keep the last good preview visible while rebuilding.
- Build panel coordinate and metric fields with `makeSingleInput(…, 'input-number')` and separate paired fields with `dimSplitElement()` — never a local input class or spacer.

*Done when:* own namespace · plan table before any bulk write · history entry (or the two-step confirm of §8 where there is no stack) · counted toast · palette entry · nothing rasterised on open.

---

## 7. The Blue Rain seam

The marketing site (`bluerain_v2`) is dark-only, cinematic and deliberately theatrical. The editor is a precision instrument. **Exactly five things cross the seam.**

**Carries over:** the wordmark · `--brand-tint` (primitive layer, brand chrome only — wordmark fill, splash, About, hub header) · `--brand-paper`, the warm off-white, for dark-theme brand text · the mono-caps label gene · the plain declarative voice. All three brand colour names are **(target)**: author the one you need in `tokens.css` per §4.5 before its first `var()`, and never write the hex into a feature stylesheet — the §2 grep gate rejects it, correctly.

**When the owner asks for "more Blue Rain", these are the legitimate moves** — offer from this list rather than reaching into the ban table: `--brand-tint` on the hub header or a splash · the wordmark rendered larger and given room on About · the mono-caps eyebrow gene on hub section headers · `--brand-black` as the ground of a full-bleed brand surface · the declarative voice tightened in hub and About copy. Each is additive, each stays outside the editor chrome, and none of them touches focus, selection or canvas colour.

**Never enters the tool:**

| Banned | Why |
|---|---|
| `cursor: none`, any pointer-following element, any `mix-blend-mode: difference` overlay | A bezier canvas needs the OS hotspot at the exact pixel; a lerped ring lags a drag and destroys every contextual cursor a font editor depends on |
| Film grain, or any full-viewport `mix-blend-mode` overlay | It alters every pixel the canvas paints, dirties the pixel grid and corrupts atlas previews. Scoping it around the canvas is worse — it creates a visible seam |
| Magnetic buttons, scroll-linked opacity/scale/rotateX, entrance staggers | A control whose position depends on pointer velocity is a Fitts's-law tax paid thousands of times a session |
| `--brand-tint` (`#B0EEFC`) as accent, focus ring, selection or any `--canvas-*` | 1.27:1 on white. Focus stays `--focus-ring` (`--a-50`, dark `--a-40`) at 2px with 1px offset — focus is tool-owned, and the site borrows from the tool, not the reverse |
| Accent-tinted hairlines | A cyan border biases white balance next to the glyph being judged. Hairlines stay neutral |
| 0.3em tracking inside working UI | Breaks word shape at 10–11px and overflows the 220px sidebar minimum. `--tracking-caps` (0.06em) in the app; 0.3em only on full-page brand chrome |
| 12–16px card radius on a control shorter than 32px | Radius is a density signal, and the two products have different densities |

`#0A0A0F` is the canonical brand black, and it ships as `--brand-black` (§4.5) for full-bleed brand surfaces; `--n-93` stays the working shell so panels can still show elevation. There is no `theme-color` meta tag in `src/index.html` today — adding one is a brand decision to raise with the owner, not a side effect of other work. **(target)** Render the wordmark as inline SVG, `currentColor`-filled, following `.top-bar__logo svg { fill: var(--text-primary) }` — never a WebP or PNG, which shows softened stems at 18px inside a product about outline precision. The Blue Rain asset lives in the sibling repo at `bluerain_v2/src/imports/bluerainHorizontal.svg` and has no copy here: bringing it over means copying it to `src/common/graphics/bluerain-wordmark-horizontal.svg` and replacing the `logoHorizontal` import at `menu.js:2`, which currently loads the upstream Glyphr `logo-wordmark-horizontal-small.svg`. That swap is a brand decision — raise it with the owner, do not make it as a side effect. The `[ 0N — Name ]` numbered mono label belongs only on marketing-adjacent app pages; About (`src/pages/about.js`) is the only one that exists today, and What's New and onboarding are hypothetical until built. `bluerain_v2/src/imports/studio-landing-page-directive.md` is **historical intent**: on any conflict, the shipped values in `bluerain_v2/src/styles/theme.css` win.

---

## 8. Language — one product, two audiences

**Terminology, fixed.**

| Term | Means |
|---|---|
| character | the Unicode slot being filled |
| glyph | the drawing that fills it |
| path | one closed outline |
| shape | a path or a component instance |
| item | any glyph / ligature / component / kern group |
| project | the saved file |
| font | the exported binary |

Never "letter" or "outline" in UI copy. Write **sidebearing**, one word, lowercase. Write the design unit as **"em units"** in prose and `Em` in the value-type token — never "1em", which every web-literate reader parses as a full em square; show the pixel equivalent whenever pixel mode or an atlas is in play.

**Teach the game developer at first exposure, in the field hint — not in a manual.**

| Type term | Game-dev equivalent |
|---|---|
| glyph | sprite |
| em square | sprite cell |
| units per em (UPM) | design resolution |
| advance width | xadvance / sprite pitch |
| sidebearing | left/right padding in the cell |
| baseline | text origin row |
| ascender / descender | cell headroom / legroom |
| kern pair | per-pair spacing offset |
| ligature | multi-character sprite |
| component instance | reused sub-sprite (prefab) |
| PUA code point | icon slot |
| contour winding | fill direction |

**Rules**

- Sentence case everywhere — pages, panels, headings, buttons, menu items, field labels, option values, toasts. Capitals only for the first word, proper names and acronyms (Unicode, OpenType, MSDF, PANOSE, Phaser, PixiJS, Godot).
- Never capitalise a domain noun mid-sentence: "the glyph", not "the Glyph".
- Buttons are verb + object, sentence case, no terminal period. Append `…` only when the control opens a dialog before anything happens. Action tooltips stay `"Name\nExplanation."`
- **Every error has three parts: what failed, why, what to do next.** "The atlas could not be built with these settings" is incomplete — name the constraint that blocked it.
- **Never use a toast for a validation error or any blocking condition.** Toasts confirm completed actions. Field errors render next to the field, persist until fixed, and mark the field.
- Every mutating action reports its result with a count, including **undo and redo on success**. Silence on success is a bug. Destructive actions confirm with the count and the item name, or offer undo in the result toast — and where there is no history stack to undo into (anything at hub level), the confirm is mandatory. **A confirm is a two-step swap on the surface that triggered it, not a second dialog:** replace the trigger in place with a sentence naming exactly what will be destroyed ("Delete "Pixel UI 8px"? This cannot be undone.") plus two buttons — a cancel that restores the trigger and takes focus back, and a confirm labelled with the verb and the object ("Delete project"), never "OK" or "Yes". The confirm button carries `--text-danger` on the view's plain button class — `.hub-button` at hub level, `fancy-button` with `secondary` in product UI, never `fancy-button[danger]` (§5) — and it is never the view's `--primary`. Focus moves to cancel; Escape cancels. Nothing in the repo implements this yet, so you are writing the first one: `showDeleteSingleLetterPairDialog` (`kerning.js:399`) is a modal, not a precedent. `beforeunload` is not confirmation.
- No jokes, emoticons, ASCII art, exclamation marks or rhetorical questions in shipped UI. The crash page states what failed, whether project data is safe, and how to recover it.
- Empty states: one fragment naming what is absent, then one sentence with the action, referencing controls by their exact current label.
- US spelling · the `…` character · straight apostrophes · unspaced em dashes (never ` - `) · Oxford comma · one space after a period.
- **Never hardcode the product name, domain or support address.** Route them through the product-identity module (§4.5). Keep upstream attribution only where the licence requires it, clearly marked as the upstream project.

---

## 9. Pre-flight — run before you call a UI change done

### 9.1 Claude verifies these, from the code, every time

1. **Grep gates in §2** return zero new hits over the diff.
2. **No undefined `var()`** — every custom property you wrote has a declaration you can point at.
3. **Contrast computed**, not eyeballed: ≥ 4.5:1 text, ≥ 3:1 non-text, both themes, composited alpha. Show the numbers.
4. **Both theme blocks** — every colour you added exists on bare `:root` and in `:root[data-theme='dark']`, and none was first defined inside a `[data-theme]` or media block.
5. **Keyboard contract, by reading:** a `keydown` handler for Enter and Space on anything with `tabindex`, `event.key` not `keyCode`, exactly one tab stop, no positive `tabindex`, Escape routed to the global handler, and the `:focus-visible` snippet present in any shadow-DOM stylesheet.
6. **Reduced motion:** any JS-driven animation reads `prefers-reduced-motion` itself.
7. **Registered:** new custom element → `registerCustomComponents()` **and** `isFocusedOnInput()`; new `--canvas-*` → `CANVAS_TOKENS`; new command → `collectCommands()` with a `searchText` string in game-developer vocabulary; new dismissible surface → `closeEveryTypeOfDialog()`; new stylesheet → `src/index.html` in order.
8. **Second document:** any new window or shadow root loads `tokens.css` first and mirrors `data-theme`.
9. **Copy read aloud:** sentence case, lowercase domain nouns, fixed terminology, three-part errors, no hardcoded product name — and the nine §1 tests that do not need a browser, answered for this change.

### 9.2 Hand these to the owner before merge — never claim you ran them

Say which of these the change needs, and what specifically to look at.

- Both themes toggled on the surface you changed (§1.6).
- A canvas drag with both sidebars visible: nothing fades, slides, re-enters or shimmers (§1.7).
- A tab pass through the change, seeing the ring at every stop, and focus surviving a panel rebuild.
- Zoom to 200% (≈640 CSS px): nothing clipped, nothing unreachable, identity still visible.
- Windows at 100% zoom — this audience is mostly Windows, and macOS font smoothing renders the same type visibly lighter.
- Any judgement call about chrome-to-content ratio (§2).

### 9.3 When a gate is blocked by shared infrastructure

This happens often and it is not a licence to ship a violation or to expand scope on your own judgement. Stop and report, in the summary, four things: **which gate** is unmet · **which shared file** blocks it · **what the minimal fix would touch**, with the call-site count · **what you shipped instead**. Then let the owner decide. The known blockers, with their counts: `.showModal()` (eighteen `showModalDialog()` call sites plus the one direct `makeModalDialog()` call at `pop_out_window.js:352`) · `makeFieldRow` and `makeEmptyState` (non-exported, one call site each to promote) · `fancy-button[danger]` (one rule, all `danger` buttons) · the `--panel-label-col` migration (three shipped splits). New debt is reported to the owner in the summary — **never** by editing this file, which lives outside the repo and is configuration, not code.

---

## 10. Known debts — do not re-report these as discoveries

§2 already names the systemic ones (three colour systems, the four silent failures, the missing z-index scale, the fake modal, the clipped shell, the three label columns, the shadow aliases). These are the rest. Fix one only when you are already in that file, or when the task *is* that fix.

1. `colors.css` — the "always-dark page is excluded from ramp inversion" comment is false; custom properties inherit, so `#cross-project-actions__page` gets the inverted ramp and renders near-black on near-black in dark theme.
2. `tokens.css` — the `@media (prefers-color-scheme: dark)` block sets only `color-scheme` and redefines no tokens, so system-dark users get a white flash before `theme.js` runs.
3. Eight `--canvas-*` tokens are defined in both themes and read by nothing, while guides, the marquee, kern rules, the add-point preview and the quality-check ring use literals.
4. `drawPoint` / `drawDirectionalityPoint` / `drawHandles` read `uiColors`, so selected vs unselected path points differ by fill alone at ~2.23:1, in light-theme blue, on a dark canvas.
5. Canvas affordances use 7px hit targets (`canvasUIPointSize = 7`); hit testing rasterises an offscreen canvas per mousemove; zoom buttons are unclamped and zoom about the view origin; the zoom readout looks typeable but is disabled; disabled tools still activate; the pixel pen has no cursor and no hovered-cell preview.
6. Nine control stylesheets plus the modal half of `dialogs.css` are still on the pre-token colour layer — the `-l##` ramp (`fancy-button` 15, `dialogs.css` 18, `progress-indicator` 6, `info-bubble-popup` 4, `tab-control` 3, `input-number` 2, `glyph-tile` 1, `fancy-slider` 1) or the `--enabled-*` / `--disabled-*` aliases (`option-chooser` 13, `option-toggle` 11, `input-number` 11). `info-bubble.css` and `command-palette.css` are clean. No control implements error or loading state; tabs use a positive `tabindex` and no `role="tablist"`.
7. `resets.css` sets `font-size` on the universal `*` selector, destroying inheritance — the root cause of ~30 `em` font-sizes (29 in CSS, one in `app/main.js`) and eight off-scale literal font-sizes. **Do not remove it.** The file carries a block comment defending it and §6.2's label rule depends on it staying; the debt is the `em` sizes it caused, and those are what you migrate. Separately, `--font-brand` / FiraGO ships ~250KB for one canvas degree readout.
8. `showToast` keeps no timer handle, so a second toast cuts the first short, and export queues hundreds of ~16-minute timers (`999999`ms). Four operations insert 500ms of deliberate latency purely so a toast can paint: `events_keyboard.js:72`, `global_actions.js:248`, `global_actions_cards.js:919` and `:993`. The other live `setTimeout` delays are 10ms six times (`open_project.js:777`, `events_keyboard.js:65`, `global_actions.js:186` and `:241`, `global_actions_cards.js:909` and `:986` — a seventh is commented out at `pop_out_window.js:152`), 100ms twice (`open_project.js:798`, `fancy_button.js:136`), 170ms once (`open_project.js:764`) and 200ms twice (`actions.js:249` and `:259`).
9. Three entrance animations use accelerating `ease-in` while `--ease-out` sits unused; `animateRemove` uses the Web Animations API, which the reduced-motion CSS block cannot reach.
10. Shortcut truth is duplicated across four hand-maintained places with no registry, and they already disagree.
11. `content-pages.css` (Overview, Settings, Help, About, Global actions) is almost entirely pre-token with hardcoded `white` cards, and `.settings-page__tab-content` uses an invalid `clamp(300px 500px max-content)` the browser drops.
12. `appPageNavigate()` renders no top bar, which is why the hub and cross-project pages cancel a grid row with a negative offset and ship a duplicate theme toggle. No dirty flag, no save-state indicator, no route back to the hub.
13. Upstream Glyphr identity is hardcoded across `menu.js`, `open_project.js`, `about.js`, `help.js` and `pop_out_window.js`, including three dead `glyprstudio.com` links, all in `about.js`.
14. `panels/action_labels.js` is a lookup table keyed on upstream English prose, including a preserved typo (`'Select pervious Path Point'`); new actions show full-sentence labels until registered there.
15. Fork dialogs ship three competing primary buttons, native `<select>` instead of `option-chooser`, raw number inputs instead of `input-number`, and render each other's class names.
16. The sidebar width defaults in CSS are dead values: `editor-pages.css:22-23` sets 260/280, but `applyStoredWidth()` (`sidebar.js:403`, called at `:382-383` on every mount) unconditionally overwrites `--left-sidebar-w` / `--right-sidebar-w` from `DEFAULT_LEFT_WIDTH` 280 / `DEFAULT_RIGHT_WIDTH` 300, so no user ever sees 260/280. **Design to 280 / 300**, as §6.2 says — both below the 320px container breakpoint, so the collapsed single-column card is what ships by default. Align the CSS fallbacks to 280/300 on any line you touch there.

The full inventory behind this section — 194 findings across 13 surfaces, each with file, reason and remedy — is `references/design-audit.md`. Read it when you are picking what to fix next, or to check whether something you just noticed is already recorded. Do not read it to answer a question this file already answers.
