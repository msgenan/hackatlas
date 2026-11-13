# hackatlas design (v3: "deniz haritası")

v1 (calm aligned table) and v2 (departures board) were rejected. v3 takes the name literally: an atlas, and the
plate is a nautical chart. The material of the product is time, so time becomes geography.

## Thesis
Every not-yet-ended hackathon is an island on one long sea chart (`components/Chart.astro`, `lib/chart.ts`).
- East is later: x is the deadline (start date when there is none). Each day gets a column whose width grows with
  the number of islands on it, a Mercator-like stretch for crowding. The neatline (alternating cells along the top and
  bottom edge, one per day) shows the stretch honestly. North-south has no meaning; islands are packed so names never
  collide.
- Island size is the prize (log scale, no prize = a small rock). The coastline is seeded by the event id, so the same
  island appears on the chart, as the glyph in the list (`components/Isle.astro`) and enlarged on the detail plate.
- Deadline within 7 days: a magenta light flashes on the island (chart light character "Fl(2)").
- Filtered-out islands keep only a dotted coastline. Closed ones are hatched, west of today, in "Kapanan sular".
  Undated ones sit in a dotted fog zone at the east edge; far future (> 120 days) is compressed into "Uzak sular".
- Saved hackathons ("Rotam") are joined by a dashed magenta course line from today.
- West edge: a mainland, a printed compass rose, rhumb lines across the sea and the title cartouche (the hero).

## Type
- Source Serif 4 (opsz variable, roman + italic): chart lettering, page titles, island names, big countdown numbers.
  Italic only for water features and group headings, as on real charts.
- Atkinson Hyperlegible Next (400/700): UI and body. No monospace.
- Fonts are self-hosted from `src/fonts/` (copied from the owner's sample library; both SIL OFL 1.1).

## Color (`styles/tokens.css`, the only place for raw values)
Day chart (light): chart-white sea `--paper`, shoal blue `--shoal`, buff land `--land`, chart ink `--ink`, one accent:
chart magenta `--accent` (used for urgency, today, the route, the primary action). Night chart (dark) follows the ECDIS
night palette: dark sea, dim land, lifted magenta. AA contrast checked for text tokens in both.

## Motion
- Survey reveal: each coastline draws itself (stroke on `pathLength=1`, then the land fills) the first time it scrolls
  into view; staggered west to east. Only after the chart script runs, so no-JS shows everything.
- Pan: native horizontal scroll (touch, trackpad, shift+wheel, keyboard) plus mouse drag with capped inertia; glides use
  one critically damped follower (adapted from the `time-scrubber` library sample).
- Scrubber under the chart: the whole season with a tick per island; the visible window is draggable and is a
  keyboard slider (arrows = week, PageUp/Down = screen, Home = today).
- Iris: opening a hackathon from the chart or the list opens the detail page as a circle growing from the click point
  (cross-document view transition; adapted from the `iris-chapters` sample). Other browsers just navigate.
- Reduced motion: no reveal, no flashing, no glides, no view transitions.

## Generated images
Two copperplate engravings from Higgsfield (Nano Banana Pro, unlimited): sea serpent (`public/img/serpent.webp`,
empty results and 404) and sailing ship (`public/img/ship.webp`, empty route and about page). They are alpha masks,
printed with `--ink` via CSS `mask`, so they follow both themes.

## Still valid from v1
Field order everywhere: Son başvuru, Tarih, Yer, Ödül, Takım, Kimler katılabilir, Organizatör, Kaynak. A missing value
reads "Belirtilmemiş". Deadline wording, groups, filters/URL params and feeds are unchanged (`lib/`).
