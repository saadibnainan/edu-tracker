# EDU-Tracker style

Dark only, minimal brutalism. A precise instrument: structure comes from 1px borders, a visible grid, alignment and type. No decoration.

Reference mockup: `design/mockups/style.html`
Screenshots: `design/mockups/screenshots/style-1440.png`, `design/mockups/screenshots/style-375.png`

## 1. Color tokens

| Token | Hex | Use |
|---|---|---|
| `bg` | `#0C0C0C` | page background, sidebar |
| `surface` | `#131313` | cells |
| `raised` | `#1A1A1A` | selected segment, inputs, raised surface |
| `line` | `#2B2B2B` | borders, grid lines, chart gridlines, progress track |
| `line-strong` | `#3D3D3D` | button and input borders |
| `text` | `#E9E7E2` | primary text, chart bars, progress fill |
| `muted` | `#8A8883` | labels, secondary text, inactive nav |
| `disabled` | `#55534F` | disabled controls, archived rows; secondary text inside inverted cells |
| `accent` | `#FF5A1F` | running timer, primary action, current-state indicators, focus ring. Nothing else. |

Subject colors (8px squares or 3px left borders only, never fills or text):

| Token | Hex | Name |
|---|---|---|
| `subject-1` | `#7D8CA3` | slate |
| `subject-2` | `#869777` | sage |
| `subject-3` | `#A3866F` | clay |
| `subject-4` | `#9A8298` | mauve |
| `subject-5` | `#6E9895` | teal |
| `subject-6` | `#A39766` | ochre |

Stored in the database as `color_index` 0..5, so the palette can be retuned without a migration.

### Accent usage list (exhaustive)
1. Running timer digits and the 2px left bar on the running timer cell.
2. Primary action button fill (one per view).
3. Current-state indicators: active nav item bar (2px), active mode segment bar (2px), "Running" state square, current period bar in charts.
4. Focus outline.

## 2. Contrast ratios (WCAG 2.x)

Computed by `node design/contrast.mjs` (no dependencies). Output, verbatim:

```
PAIR                                        FG       BG       RATIO  NEED  RESULT KIND
text on bg                                  #E9E7E2  #0C0C0C  15.83  4.5   PASS   text
muted on bg                                 #8A8883  #0C0C0C  5.52   4.5   PASS   text
accent on bg                                #FF5A1F  #0C0C0C  6.27   4.5   PASS   text
disabled on bg                              #55534F  #0C0C0C  2.55   4.5   FAIL   text, exempt (inactive control)
text on surface                             #E9E7E2  #131313  15.04  4.5   PASS   text
muted on surface                            #8A8883  #131313  5.25   4.5   PASS   text
accent on surface                           #FF5A1F  #131313  5.96   4.5   PASS   text
disabled on surface                         #55534F  #131313  2.42   4.5   FAIL   text, exempt (inactive control)
text on raised                              #E9E7E2  #1A1A1A  14.08  4.5   PASS   text
muted on raised                             #8A8883  #1A1A1A  4.91   4.5   PASS   text
accent on raised                            #FF5A1F  #1A1A1A  5.58   4.5   PASS   text
disabled on raised                          #55534F  #1A1A1A  2.27   4.5   FAIL   text, exempt (inactive control)
bg (hover inverted) on text                 #0C0C0C  #E9E7E2  15.83  4.5   PASS   text
surface (hover inverted) on text            #131313  #E9E7E2  15.04  4.5   PASS   text
raised (hover inverted) on text             #1A1A1A  #E9E7E2  14.08  4.5   PASS   text
muted (inverted cell, NOT USED) on text     #8A8883  #E9E7E2  2.87   4.5   FAIL   rejected, see next row
disabled as inverted secondary on text      #55534F  #E9E7E2  6.21   4.5   PASS   text
bg (primary label) on accent                #0C0C0C  #FF5A1F  6.27   4.5   PASS   text
accent focus outline on bg                  #FF5A1F  #0C0C0C  6.27   3     PASS   non-text
accent focus outline on surface             #FF5A1F  #131313  5.96   3     PASS   non-text
accent outline on inverted fill on text     #FF5A1F  #E9E7E2  2.52   3     FAIL   rejected, outline offset 2px onto parent instead
chart bar (text) on surface                 #E9E7E2  #131313  15.04  3     PASS   non-text
borderStrong on surface                     #3D3D3D  #131313  1.71   1     PASS   decorative
subject-1 slate on surface                  #7D8CA3  #131313  5.44   3     PASS   non-text
subject-1 slate on raised                   #7D8CA3  #1A1A1A  5.10   3     PASS   non-text
subject-2 sage on surface                   #869777  #131313  5.93   3     PASS   non-text
subject-2 sage on raised                    #869777  #1A1A1A  5.56   3     PASS   non-text
subject-3 clay on surface                   #A3866F  #131313  5.48   3     PASS   non-text
subject-3 clay on raised                    #A3866F  #1A1A1A  5.14   3     PASS   non-text
subject-4 mauve on surface                  #9A8298  #131313  5.33   3     PASS   non-text
subject-4 mauve on raised                   #9A8298  #1A1A1A  4.99   3     PASS   non-text
subject-5 teal on surface                   #6E9895  #131313  5.83   3     PASS   non-text
subject-5 teal on raised                    #6E9895  #1A1A1A  5.46   3     PASS   non-text
subject-6 ochre on surface                  #A39766  #131313  6.35   3     PASS   non-text
subject-6 ochre on raised                   #A39766  #1A1A1A  5.95   3     PASS   non-text
```

Rules that follow from the table:
- **All readable text passes AA (4.5:1).** The lowest used text pair is muted on raised at 4.91.
- **Disabled text** (`#55534F`, 2.27 to 2.55) is only used for inactive controls and archived rows. WCAG 1.4.3 exempts inactive UI components. It is never used for information the user needs to read to proceed.
- **Inverted cells**: hover swaps `bg`/`text`. Secondary text inside an inverted cell maps `muted` to `disabled` (6.21:1), because `muted` on `text` is only 2.87.
- **Focus ring** is drawn with `outline-offset: 2px`, so it always sits on the dark parent (5.96 to 6.27), never on an inverted fill (2.52).
- **Subject squares on an inverted row** measure 2.37 to 2.82 against `#E9E7E2`. They are supplementary (the subject name is always adjacent), so WCAG 1.4.11 does not require 3:1 there. On normal surfaces they are 4.99 to 6.35.

## 3. Typography

| Role | Family | Size / line | Weight | Notes |
|---|---|---|---|---|
| Body | IBM Plex Sans | 14 / 24 | 400 | names, notes, copy |
| Page title | IBM Plex Sans | 14 / 24 | 500 | header strip only |
| Section label | IBM Plex Mono | 11 / 16 | 400 | uppercase, `letter-spacing: 0.08em`, index prefix in `text`, name in `muted`: "01 TIMER" |
| Button label | IBM Plex Mono | 11 / 16 | 500 | uppercase, 0.08em |
| Data / numbers | IBM Plex Mono | 14 / 24 | 400 | `font-variant-numeric: tabular-nums` everywhere |
| Stat figure | IBM Plex Mono | 32 / 40 | 500 | tabular |
| Timer display | IBM Plex Mono | 96 / 96 | 500 | tabular, `letter-spacing: -0.02em`; 64/64 below 600px viewport width (see deviations) |

Fonts load through `next/font/google` (self-hosted at build, no runtime request to Google). Durations use `H:MM` (e.g. `2:41`), timers `HH:MM:SS`.

## 4. Space, grid, shape

- 8px base. Allowed spacing: 8, 16, 24, 32, 48, 56, 64. Borders are 1px and sit inside the box.
- Cell padding 24px (16px horizontal below 900px).
- Fixed heights: header strip 56, buttons 40, list rows 48, progress bar 4.
- Layout: 200px sidebar + 12-column content grid. Cells share 1px `line` borders like a spec sheet. Below 900px the sidebar becomes a 3-column bordered nav grid on top and every cell spans 12.
- `border-radius: 0` on everything. No `box-shadow`, `filter`, `backdrop-filter` or gradients. State bars are pseudo-elements, not shadows.

## 5. Interaction

- **Hover**: the hovered cell, row, nav item or button inverts (`background: text`, `color: bg`, border becomes `text`). Primary button hover also inverts to `text`/`bg`.
- **Active**: active nav item gets a 2px accent bar on the left edge. The running timer cell gets a 2px accent bar on its left edge and accent digits. The selected mode segment gets a 2px accent bar on its bottom edge.
- **Focus**: `outline: 2px solid #FF5A1F; outline-offset: 2px` via `:focus-visible`.
- **Disabled**: `surface` fill, `disabled` text, `line` border, `cursor: not-allowed`.
- **Motion**: `transition: background-color, color, border-color 120ms linear`. Nothing else animates. Honor `prefers-reduced-motion` by dropping transitions.

## 6. Components

### Timer card (`01 TIMER`)
Cell head: label left, state right ("Running" with an 8px accent square, "Paused" in muted, nothing when idle). Mode segments (Stopwatch / Countdown / Pomodoro). Display `HH:MM:SS`. Meta row as a `dl`: Subject (8px square + name), Started, Today. Controls: primary (Start / Pause / Resume) + Stop, then a muted shortcut hint "Space pause / S stop". Display has `role="timer"` and an `aria-label` that updates at most once per minute so screen readers are not flooded.

### Button
Default, hover (inverted), focus (ring), primary (accent fill, `bg` label), primary hover (inverted), disabled. See cell `04 BUTTONS` in the mockup.

### Subject list row
Grid `8px | name | week | target | action`, 48px tall, full-bleed to the cell edges so the hover inversion meets the cell borders. Week and target in mono, right aligned. Archived rows use `disabled` and say "Archived". Target column hides below 900px.

### Progress bar
4px track in `line`, fill in `text`. Thin, flat, no rounded ends, no labels inside.

### Charts
Flat rectangular bars in `text`, current period bar in `accent`, 1px `line` gridlines, mono 11px axis labels in `muted`, no legend when there is a single series, no tooltip shadows, no animation.

### Icons
Lucide, 16px, `stroke-width: 1.5`, `currentColor`. Only where a text label alone is unclear. None are needed in the mockup.

## 7. Copy
Plain, short, specific. Commas and periods, never em dashes. Examples: "No sessions yet. Start a timer to log one." "Offline. 2 writes queued." "Link sent. Check your email."

## 8. Deviations from the brief

1. **Timer size on phones**: 96px below a 600px viewport would make `01:24:07` about 461px wide. It drops to 64px there (fits 375px). 96px everywhere else.
2. **Native date and time pickers** (`type="date"`, `type="datetime-local"`) render their value in the browser's locale format (for example `mm/dd/yyyy`, `02:27 AM`). Their box, border and font follow the tokens; the inner text format is the browser's.
3. **Subject squares on hover-inverted rows** measure 2.37 to 2.82:1 against `#E9E7E2` (section 2). Allowed because the name always sits next to the square.
4. **Select chevron** is a small inline SVG data URI, not a gradient, so no gradient appears anywhere.

