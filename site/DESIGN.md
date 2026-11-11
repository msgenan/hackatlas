# hackatlas design (v2: "kalkış panosu")

v1 (calm aligned table) was rejected by the owner as too plain. v2 direction, owner gave full freedom:

## Thesis
Hackathons are departures; the application deadline is the gate closing. The page is a terminal hall
(cool concrete by day, a dark night hall by night). Two signature objects:
1. **The departures board** (`components/Board.astro`, `scripts/board.ts`, `styles/board.css`): a dark split-flap
   board, dark in both themes, amber/red/dim glyphs in Big Shoulders Display, live seconds countdown, flaps
   flip in on load and when filters change. It is real data, not decoration.
2. **The boarding pass** (`components/EventRow.astro`, `.pass` in `styles/list.css`): every event is a pass with
   the same anatomy, so every fact sits in the same place: main part (name, organizer, "route" = place with a
   format icon, then a fixed 2x2 field grid Tarih / Ödül / Takım / Konu with small uppercase labels and dashed
   rules) and a tear-off stub (perforated dashed edge with notches, urgency-tinted: danger <= 3 days, amber <= 7)
   holding the big countdown number, the deadline date, a generated barcode (`lib/barcode.ts`) and save.
Uppercase is allowed only where it is the material: board glyphs and pass field labels. Everywhere else sentence case.

## Type
- Display: Big Shoulders Display Variable (700-800): hero, page titles, group headings, big numbers, board.
- UI/body: Geist Variable. Mono (Geist Mono) only for codes/ids if ever needed, not for labels.

## Color
Tokens in `styles/tokens.css` (names unchanged from v1, values new, plus `--board*`, `--flap*`, `--r-pass`,
`--shadow-pass*`, `--danger-fill`). One accent: board amber (`--accent` text, `--accent-fill` fills with
`--on-accent` text). Light: cool concrete page `--bg`, paper passes `--surface`. Dark: night hall, dark passes.

## Motion
One orchestrated moment on the list page (GSAP, pinned classic script `public/vendor/gsap-3.14.2.min.js`,
`scripts/motion.ts`): hero lines rise, board settles while its flaps land, passes rise in batches on scroll.
Cross-document view transitions: a pass on the list and the pass on its detail page share
`view-transition-name: pass-<id>`, so the pass grows into the detail page (Chromium/Safari; others just navigate).
Hover: passes lift 2px. Everything honors reduced motion. No smooth-scroll library: native scroll is calmer for a tool.

## v1 notes still valid (subject, field order, wording, filters, feeds, states)
## Subject and job
A list of hackathons for Turkish student developer teams. The one job: scan many events fast and answer
"can we still apply, when, where, and is it worth it?" The material of the product is time, so time is the
visual idea: deadlines are the strongest figure on every row, and a deadline rail opens the page.

## Direction
Calm and exact, like a well-set timetable. Ink-tinted neutrals, generous line height, aligned columns.
One accent, ember (`--accent`), used only for time-critical facts (deadline within 7 days, the rail's ticks,
the "today" marker) and the single primary action on a page. Everything else is neutral.
Signature moment: the deadline rail (see below). Spend boldness there; keep the rest quiet.

Avoid: identical rounded cards with shadows, gradient washes, ALL-CAPS eyebrow labels, monospace meta labels,
"A · B · C" middle-dot meta strings, arrows appended to link text, emoji. Icons: Lucide, 16/18 px, stroke 1.5,
`--text-3` color, 8 px gap to the label.

## Type
- UI and body: IBM Plex Sans (400, 500, 600), self-hosted via @fontsource, `font-variant-numeric: tabular-nums`
  wherever numbers align (deadlines, dates, prizes, counts).
- Display: Bricolage Grotesque Variable, only for the wordmark, page titles and the big countdown number in a row.
- Body 15/24. Sentence case everywhere. Line length <= `--measure`.

## Tokens
`src/styles/tokens.css` is the only place for raw colors, sizes and durations. Components use variables only.
Light and dark both follow the system; the header toggle stores `data-theme` on `<html>` (light/dark/system).

## The fixed field order ("same info in the same place")
Every row and every detail page shows these facts in this order, with these Turkish labels:
1. Son başvuru — countdown + date
2. Tarih — event dates
3. Yer — Online / city, country / Hibrit: city
4. Ödül — prize text (original currency)
5. Takım — "2-5 kişi", "En fazla 4 kişi", "Bireysel"
6. Kimler katılabilir
7. Organizatör
8. Kaynak
A missing value renders as "Belirtilmemiş" in `--text-3`, never as an empty gap and never removed, so columns
never shift.

## Deadline wording
- Deadline today: "Bugün son gün" (danger)
- 1-3 days: "3 gün kaldı" (danger)
- 4-7 days: "6 gün kaldı" (accent)
- 8+ days: "24 gün kaldı" (neutral)
- No deadline but event in future: "Tarih açıklanmadı" (muted)
- Past deadline, event not over: "Başvuru kapandı" (muted)
- Event over: moves to Arşiv.
Dates: Turkish long form, "14 Kasım", add year only when it is not the current year. Ranges: "12-13 Aralık",
"28 Kasım - 2 Aralık".

## Pages
### List (`/`)
```
header: [hackatlas]  Liste  Takvim  Kaydedilenler            [Hackathon ekle] [theme]
intro:  Türkiye ve dünyadan 124 hackathon, tek düzende.   Son güncelleme 12 Kasım
rail:   |today ......|....|..||....|.......|....  (next 8 weeks, week labels under)
filters (sticky under header): [search] [Bölge: Tümü|Türkiye|Dünya] [Format] [Konu] [Ödüllü] [Sırala]
group: Bu hafta kapanıyor (3)
  row: [6 gün kaldı / 14 Kasım] [Name / organizer / theme tags] [Tarih] [Yer] [Ödül] [Takım] [save]
group: Bu ay (12)
group: Daha sonra (40)
group: Tarih açıklanmadı (8)
footer: Arşiv, RSS, takvim aboneliği, GitHub, Hackathon ekle
```
- Desktop (>= 1024): rows are a CSS grid with fixed column tracks so every field sits in the same x position
  in every row: `9rem minmax(0,1fr) 9rem 10rem 9rem 6rem 2.5rem`. Hairline between rows, no card boxes.
  Column headers once per group (small, `--text-3`, sentence case).
- Tablet/phone (< 1024): each row becomes a block: line 1 countdown chip + save button; line 2 name (max 2 lines,
  ellipsis); line 3 organizer; then a 2-column definition grid with labels in the fixed order. Same order always.
- Whole row is a link to the detail page (one anchor on the name with a stretched hit area); the save button sits
  above it in the stacking order and is a separate button.
- Theme tags: small neutral pills, max 3, Turkish names (ai: Yapay zekâ, web3: Web3, fintech: Fintech,
  health: Sağlık, sustainability: Sürdürülebilirlik, education: Eğitim, games: Oyun, mobility: Mobilite,
  security: Güvenlik, social-impact: Sosyal etki, hardware: Donanım, open: Serbest konu).
- Groups by deadline horizon: "Bu hafta kapanıyor" (<= 7 days), "Bu ay" (8-31), "Daha sonra" (> 31),
  "Tarih açıklanmadı", then "Başvurusu kapananlar" (deadline passed, event not over) collapsed by default.
  When sorted by something other than deadline, groups are dropped and one flat list shows.

### Deadline rail (signature)
A horizontal band, full content width, ~96 px tall, showing today to +8 weeks. Week ticks with labels
("17 Kas", "24 Kas"...). Each deadline is a short vertical tick (stacked when several share a day, max 4 then
"+n"), ember for <= 7 days, `--text-3` otherwise; a "Bugün" marker at the left. Hover/focus a tick -> tooltip
with the event name(s) and the matching row gets a subtle highlight; click scrolls to the row. It reflects the
current filters. Keyboard reachable (ticks are buttons, arrow keys move between them). Reduced motion: no
animation. One orchestrated motion moment on first load: ticks rise in left to right (stagger 40 ms, max 380 ms
total), nothing else animates on load. On phones the rail scrolls horizontally inside itself (never the page).

### Detail (`/e/<id>/`)
- Breadcrumb "Liste" back link, title (display font, wraps fully), organizer, status chip.
- Actions: primary "Başvuru sayfasına git" (external, accent fill), secondary "Takvime ekle" (.ics download),
  "Kaydet", "Bağlantıyı kopyala" (confirms "Kopyalandı").
- Fact sheet: definition list in the fixed order, two columns on desktop (label 10rem, value), stacked on phone.
- Summary paragraph if present. Themes. Sources list with kind names (Devpost, MLH, Devfolio, Techcareer, Web,
  Instagram, Ekleme formu) and "görüldü" date.
- "Bilgi yanlış ya da eksik mi? Düzeltme öner" -> GitHub new issue with title prefilled.
- If `confidence` < 0.7: a quiet notice "Bu bilgiler otomatik toplandı, başvurmadan önce resmi sayfadan kontrol et."

### Calendar (`/takvim/`)
Month grid (Mon-first, Turkish day names). Each day shows up to 3 compact entries: deadline entries marked with
the ember dot, event-day entries as neutral bars; "+n" opens the day panel. Prev/next month, "Bugün". Same
filters as the list (shared URL params). Phone: agenda list by day instead of the grid.

### Saved (`/kaydedilenler/`)
Same row component, from localStorage ids. Empty: "Henüz kaydettiğin bir hackathon yok. Listede yer imi
simgesine basarak kaydedebilirsin." with a link back to the list.

### Archive (`/arsiv/`)
Ended events, newest first, same rows without countdown (shows "Bitti").

## Filters and URL
`?q=&bolge=tr|dunya&format=online,in_person,hybrid&konu=ai,web3&odul=1&sirala=son-basvuru|odul|tarih|yeni`.
Changing a filter updates the URL (replaceState). Counts update live ("124 sonuçtan 18'i"). Empty result:
"Bu filtrelerle eşleşen hackathon yok." + "Filtreleri temizle" button. Without JS the full list still renders
(server-rendered), filters hide.
Prize sort uses approximate USD from `data/fx.json`; display always shows the original text.

## Feeds
`/events.json` (approved upcoming), `/feed.xml` (RSS, newest added), `/takvim.ics` (subscribe: deadlines as
all-day "Son başvuru: <name>" + event date ranges), `/e/<id>.ics`.

## States to cover
Loading is not needed (static). Cover: populated, empty data set, filter with no result, missing fields,
very long name and organizer, many themes, no deadline, deadline today, closed, ended, saved-empty, JS off,
localStorage unavailable (save button hidden, no crash).

## Accessibility
Contrast AA in both themes, visible focus (`--focus`), 44 px touch targets on phone, rail and filters keyboard
operable, `lang="tr"`, landmarks, skip link "İçeriğe geç".
