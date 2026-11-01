# Workbook specification (sections 1–5 of the implementation brief)

> Copied verbatim from the project brief. Note: per the owner's decision the join date of code 1001523 is corrected on import (see README).

## 1. WORKBOOK OVERVIEW

Domain: a Credit-Risk team leader (Cash Microfinance, Beni Suef & Fayoum governorates, Egypt) tracks risk officers: yearly roster, monthly performance scoring (8 criteria, 1–5), visit counts, leave/permissions log, and an automatic annual grade. All text is Arabic; every sheet is right-to-left (`rightToLeft="1"`). Year = 2026.

16 sheets, in this exact order (names are exact Arabic strings; keep them verbatim, including spacing):

| # | Sheet name | Visible | Tab color | Purpose | Nature |
|---|-----------|---------|-----------|---------|--------|
| 1 | `الاجازات والاذونات` | yes | FFC00000 (dark red) | Leave & permission log 2026 | 100% manual, no formulas |
| 2 | `الزيارات الميدانية` | yes | theme 3 (dk2 `0E2841`) tint 0.5 | Field-visit performance dashboard (by employee × month) | manual numbers + SUM formulas |
| 3 | `التقييم السنوي 2026` | yes (active tab) | theme 6 (accent3 `196B24`) tint 0.4 | **MAIN sheet**: roster + annual totals + automatic grade | mostly formulas |
| 4–15 | `يناير` `فبراير` `مارس` `ابريل` `مايو` `يونيو` `يوليو` `اغسطس` `سبتمبر` `اكتوبر` `نوفمبر` `ديسمبر` | yes | various (see §2.4) | Monthly evaluation sheets (one per month, identical layout) | manual scores + SUM formulas |
| 16 | `Data` | **HIDDEN** | FF00FF00 | Dropdown source lists (sectors, governorates) | static lists |

Important: spelling is as in the file: `ابريل` (not أبريل), `اغسطس`, `اكتوبر`. Month sheets are referenced by name from formulas in the main sheet.

Workbook-level facts:
- No workbook-structure protection. No sheet is actually password/flag-protected (the main sheet has a `<sheetProtection selectLockedCells="1" selectUnlockedCells="1"/>` element but WITHOUT `sheet="1"`, so protection is OFF). Cells do carry `locked` flags (see §2) but they have no effect today. Preserve them as-is on export; do not turn protection on.
- **There are NO Excel Table objects (ListObjects)** anywhere (no `xl/tables/*`). All ranges are plain ranges. Do not create tables on export.
- Defined names: `_xlnm._FilterDatabase` (hidden, sheet 1) = `'الاجازات والاذونات'!$A$2:$F$66`; `_xlnm.Print_Area` and `_xlnm.Print_Titles` for sheet 2 are broken (`#REF!`) in the source. Preserve verbatim (do not "fix" or drop silently).
- Default font family in sheets 3–15 is **Aptos Narrow 11**; sheets 1–2 use **Arial** (various sizes).
- The workbook uses Excel 365 functions that are stored with the `_xlfn.` prefix: `SEQUENCE`, `XLOOKUP`, `LET`, `AGGREGATE`. They must round-trip untouched (see §7).
- Theme colors referenced by styles (theme index → hex): 0 lt1 FFFFFF, 1 dk1 000000, 2 lt2 E8E8E8, 3 dk2 0E2841, 4 accent1 156082, 5 accent2 E97132, 6 accent3 196B24, 7 accent4 0F9ED5, 8 accent5 A02B93, 9 accent6 4EA72E. A "tint" lightens (+) or darkens (−) that color.

---------------------------------------------------------------------
## 2. SHEET-BY-SHEET SPECIFICATION

Legend: **[M]** manual-entry, **[F]** formula/calculated (read-only in the web app), **[V]** value list.

### 2.1 `Data` (hidden) — dropdown sources
- `J1` = `القطاع` (header), `J2:J4` = `الصعيد`, `القاهره الكبري والجيزة`, `الدلتا`.
- `K1` = `المحافظة` (header), `K2:K19` = 18 governorates (exact strings in Appendix A, note the irregular spacing in `محافظه -   الوادي الجديد` and trailing ` .` on most).
- Used by dropdown validations on Sector (`Data!$J:$J`) and Governorate (`Data!$K:$K`) columns in sheets 3–15. Because the validation points at the entire column, the header cell is also technically selectable — in the web app, offer only the data rows (J2:J4, K2:K19) but allow the user to maintain these lists (add/rename/remove) and write them back to `Data`.

### 2.2 `التقييم السنوي 2026` — MAIN sheet (rows 3–102 = 100 employee slots)
Freeze panes: below row 2 (`ySplit=2`). Row heights: row 1 = 25.2, row 2 = 47.4 (custom), other rows default 14.4. Merged: `H1:K1`, `P2:Q2`. Used range A1:Q102.

Row 1: `A1` = `البيانات الوظيفية` (header band over A–G, fill theme 5 (accent2 E97132) tint +0.4, thin borders); `H1:K1` merged = ` تقييم الاداء السنوي` (leading space is in the source).
Row 2 headers (exact text, incl. trailing/leading spaces as in source):

| Col | Width | Header (row 2) | Type | Content |
|-----|------|----------------|------|---------|
| A | 6.44 | `الرقم` | [F] | `=SEQUENCE(100)` dynamic-array anchored at A3, spilling A3:A102 (stored as array formula `t="array" ref="A3:A102"` with `cm="1"` and `xl/metadata.xml` dynamic-array flag) → 1..100 |
| B | 16.11 | `القطاع` | [F]* | Sector — pulled by Employee Code from the first month sheet where the code appears. Has dropdown validation (Data!J:J) inherited from the old manual design. |
| C | 15.66 | `المحافظة` | [F]* | Governorate — same rule (dropdown Data!K:K) |
| D | 30.22 | `اسم الموظف ` (trailing space) | [F]* | Employee name |
| E | 10.78 | `الكود` | [F]* | Employee code (unique key), consolidated automatically from the 12 monthly sheets |
| F | 13.78 | `تاريخ الالتحاق` | [F]* | Joining date; numeric date serial; number format `dd/mm/yyyy;;` (zero hidden → blank row looks empty) |
| G | 14.66 | `الوظيفة` | [F]* | Job title |
| H | 15.66 | `عدد الزيارات السنوي` | [F] | Annual visits = sum of the code's visits column H in all 12 months |
| I | 15.11 | `اجمالي تقييم الاداء الشهري بالنقاط خلال السنة` | [F] | Annual points = sum of the code's monthly "الاجمالي" (col Q) over all 12 months. Number format `0` |
| J | 14.55 | ` درجة التقيم` (leading space; typo "التقيم" is in the source) | [F] | Annual grade text (see §3.3) |
| K | 14.66 | `عدد اشهرالالتحاق` | [F] | Months since joining `=(TODAY()-F)/30` (volatile). Number format `0` (displays integer; stored fractional) |
| L | 29.22 | `ملاحظات` | [M] | Free-text remarks. Empty in the data. |
| P2:Q2 (merged) | P=12, Q=13.2 | `درجات التقييم السنوي` | legend | fill yellow FFFFFF00, medium border |
| P3:Q6 | | rows: `> 430`→`ممتاز`; `330 : 429`→`جيدجدا`; `280 : 329`→`جيد`; `240 : 279`→`مقبول` | legend [static text] | fill theme 3 tint +0.9. NOTE the legend shows the *unscaled* thresholds and has no row for `ضعيف` (< 240). Keep the legend as-is on export; in the web UI show a corrected/complete legend that also explains the scaling by tenure (§3.3). |

\* **Important (latest workbook version):** columns B–G of the main sheet are no longer typed by hand. They are formulas that consolidate the 12 monthly sheets (this was the last modification made to the workbook):
- **E3:E102** (each cell stored as a single-cell legacy array formula `{=...}`, NOT a spilling formula): "k-th distinct employee code in month order, then row order". For row r, the formula is a chain of 12 `IFERROR` blocks (January → December), each block:
  `INDEX(<Month>!$E:$E, _xlfn.AGGREGATE(15,6, ROW(<Month>!$E$3:$E$200) / ((<Month>!$E$3:$E$200<>"") * (COUNTIF($E$2:$E{r-1}, <Month>!$E$3:$E$200)=0)), 1))`
  ending with `""` when nothing is left. I.e. first code (in sheet order Jan→Dec, then row order) that is non-empty and not already listed in E above.
- **B, C, D, G (rows 3–102):** `=IF($E{r}="","", IFERROR(INDEX(يناير!$X:$X, MATCH($E{r}, يناير!$E:$E, 0)), IFERROR(INDEX(فبراير!$X:$X, MATCH($E{r}, فبراير!$E:$E,0)), … IFERROR(INDEX(ديسمبر!$X:$X, MATCH(...)), ""))))` with X = B, C, D, G respectively → value from the **first month** (Jan→Dec) in which the code occurs.
- **F (rows 3–102):** same chain from column F but the empty fallbacks return `0` instead of `""` (so that K = (TODAY()-F)/30 keeps working for blank rows); style makes 0 invisible.
- Cell number format of F in rows 3–102: custom `dd/mm/yyyy;;`; alignment center.

Equivalent app logic: **Employee master = distinct codes over all months, ordered by (first month in which the code appears, then row in that month); identity attributes (sector, governorate, name, joining date, job) = those of the first occurrence.** Employee master capacity in the workbook = 100 rows (3–102); scanning range in months = rows 3–200.

H, I, J, K formulas (rows 3–102, same pattern each row; shown for row 3):
- **H3** `=SUM(XLOOKUP(E3,يناير!$E:$E,يناير!$H:$H,0), XLOOKUP(E3,فبراير!$E:$E,فبراير!$H:$H,0), … , XLOOKUP(E3,ديسمبر!$E:$E,ديسمبر!$H:$H,0))` (12 terms, `_xlfn.XLOOKUP`; stored across multiple lines inside the formula)
- **I3** identical but returning column `$Q:$Q` (monthly total) instead of `$H:$H`.
- **K3** `=(TODAY()-F3)/30` (shared formula down to row 102).
- **J3** (shared down the column, `ca="1"`):
```
=IF(OR(K3="",I3=""),"",
  LET(m,INT(K3), n,VALUE(I3),
      p,IF(m<=3,25%,IF(m<=6,50%,IF(m<=9,75%,100%))),
      IF(n<240*p,"ضعيف",
      IF(n<280*p,"مقبول",
      IF(n<330*p,"جيد",
      IF(n<430*p,"جيد جداً","ممتاز"))))))
```
Semantics of XLOOKUP(E, month!E:E, month!H:H, 0): exact match on the whole column (first match wins; header text row included but irrelevant); if the code is absent from that month → 0. If the matched cell is text (e.g. a note typed into a numeric cell), SUM ignores it (treated as 0). If E is blank (`""`), no match → 0.

Conditional formatting on `J1:J1048576` (cellIs equal, priority order): `"ممتاز"` → fill theme 6 tint +0.4 (green, ≈ `66B26F`-ish; derive from accent3 `196B24`); `"جيد جدا"` (**written without the final tanween mark**) → fill theme 6 tint +0.8 (light green); `"جيد"` → FFFFC000 (orange/amber); `"مقبول"` → FFFFFF00 (yellow); `"ضعيف"` → FFFF0000 (red). **Verified quirk:** the formula returns `جيد جداً` (ends with U+064B fathatan) but the CF literal is `جيد جدا` (no U+064B) → the "very good" colour rule most likely never fires in Excel today. Preserve the CF XML verbatim on export; in the web UI, colour "جيد جداً" light green (the evident intent) and mention the discrepancy in the README.

Data validations on this sheet: list from `Data!$J:$J` on `B1:B1048576` and `Data!$K:$K` on `C1:C1048576` (stored in the `x14` extension list, `allowBlank`, error alert on). These exist in an `extLst` block — **they must survive the export** (many libraries drop them → see §7).

Cell lock flags (informational): A–G and L are unlocked, H–K locked, P:Q locked. No effect because the sheet is not protected.

Print: portrait, no print area; defaults (margins 0.7/0.75). Printer-settings part present (`printerSettings2.bin`).

### 2.3 Monthly sheets (4–15) — identical layout, 12 copies
Used range A1:R52 (January has styled/formula cells down to row 198, see below). Freeze panes under row 2. Merged `I1:P1`. Row 1 height 27.6; row 2 height 73.8; row 3 height 41.4. Column widths (Jan): A 8.89, B 13, C 13.66, D 17.55, E 8.89, F 11.11, G 9.89, H 14.11, I 16.66, J 12.78, K 10.44, L 18.44, M 15.66, N 12.55, O 11.11, P 8.89, Q 8.89, **R 100.78** (widths vary slightly per month — copy the template, don't hardcode).

Row 1: `A1` `البيانات الوظيفية` (band A–G, fill theme 7 (accent4 0F9ED5) tint −0.25, white-ish font theme 0); `H1` `عدد الزيارات ` (trailing space); `I1:P1` merged = `تقييم الاداء الشهري من 1 : 5  ( التقييم 5 اكثر اداء فعال للموظف - التقييم 1 اقل اداء للموظف )`.
Row 2 headers:

| Col | Header | Type | Notes |
|-----|--------|------|-------|
| A | `الرقم` | [F] | `=SEQUENCE(50)` array anchored A3 → A3:A52 (1..50) |
| B | `القطاع` | [M] | dropdown `Data!$J:$J` |
| C | `المحافظة` | [M] | dropdown `Data!$K:$K` |
| D | `اسم الموظف ` | [M] | |
| E | `الكود` | [M] | **unique employee key** (numeric, e.g. 1001877) |
| F | `تاريخ الالتحاق` | [M] | date, format `mm-dd-yy` (numFmt 14) |
| G | `الوظيفة` | [M] | |
| H | *month name* (`يناير` … `ديسمبر`) | [M] | **number of visits in that month** (header cell holds the month name) |
| I | ` دقة الفحص والمتابعة واتمام الزيارة من جميع الاركان` | [M] | score 1–5 |
| J | `دقة وجودة التقاريرالمرسلة وسرعة الرد بالتقييم` | [M] | score 1–5 |
| K | `متابعة الفروع والمحاضر اليومية ` | [M] | score 1–5 |
| L | `الالتزام بإتمام الزيارات او الفحص العشوائي و سرعة الرد بالتقيم في الوقت المحدد` | [M] | score 1–5 |
| M | `الالتزام بالسياسات والإجراءات التشغيلية والقرارات الادارية` | [M] | score 1–5 |
| N | `الالتزام بمواعيد الحضور والانصراف` | [M] | score 1–5 |
| O | `التطويرالذاتي و تنمية المهارات` | [M] | score 1–5 |
| P | `التعاون والعمل بروح الفريق` | [M] | score 1–5 |
| Q | `الاجمالي` | [F] | **`=SUM(H{r}:P{r})`** — NOTE: it includes column H (visit count) plus the 8 scores. Do not "fix" this; it is the rule that drives the annual points (verified: Jan, 1001877: 2 visits + 1+5+3+5+5+5+5+5 = 36). Fill yellow FFFFFF00 in header. January has this formula on rows 3–198; the other months on rows 3–52. |
| R | `ملاحظات` | [M] | free text, Arabic, width ≈100, font Aptos Narrow 10, right-aligned, wrapped; may be long (see Appendix A) |

Scores 1–5 are described in the header text but **there is no data validation enforcing 1–5 in the workbook** (and none on H). The web app should validate scores as integers 1–5 (UI-level) but must still import out-of-range/text values without destroying them (flag them).

Monthly sheet tab colors: يناير theme7 +0.4; فبراير theme5 +0.6; مارس FFFFFF00; ابريل theme8 +0.4; مايو FF66FFFF; يونيو theme3 +0.5; يوليو theme5 −0.25; اغسطس theme8 +0.4; سبتمبر FF66FFFF; اكتوبر theme2 −0.5; نوفمبر theme5 −0.25; ديسمبر theme8 −0.25.

Row identity: the identity columns B–G are re-typed in every month where the employee appears. An employee may start mid-year (e.g. code 1001523 first appears in اغسطس; 1007801 has no scores in يناير and, in يناير/فبراير, a text note instead of a visit count — see §5). Within a month the same employee must have ≤ 1 row. Rows 3–52 = 50 slots per month.

### 2.4 `الزيارات الميدانية` — visit dashboard (manual, by NAME, not linked to codes)
Landscape A4, scale 80, horizontally & vertically centered print, margins 0.75/1. Used range B1:R17. One picture (logo; `xl/media/image1.png`, cropped with `srcRect t=30278 b=27889`) anchored from col 6 (G) row 0 to col 10 (K) row 3, `twoCellAnchor editAs="oneCell"`. Must be preserved byte-for-byte.
- Merged `B5:Q5` title: `لوحة متابعة الأداء - محافظة بني سويف والفيوم 2026` (Arial 16 bold, white on 1B3A6B); `B6:Q6`: `المدير المباشر: فادي عادل` (Arial 10, grey 666666); `B7:Q7`: `ملخص زيارات الموظفين` (Arial 12 bold, 1B3A6B).
- Row 8 headers (Arial 10 bold white on 1B3A6B, wrapped, thin border): C `اسم الموظف`, D `المنطقة`, E..P = `يناير` … `ديسمبر`, Q `إجمالي الزيارات`. (B8 is a narrow index column, width 3.)
- Rows 9–16 (8 employees): B = index 1..8 (manual numbers), C name (bold, right-aligned), D area (`الفيوم`, `الفشن`, `الواسطي`, `بني سويف`, `اهناسيا`, `ببا`…), E:P = visits per month [M] (may be empty, 0, or a text such as `مستقيل` in `I16`), **Q{r} `=SUM(E{r}:P{r})`** (fill F5F7E9, bold).
- Row 17: `K17:P17` merged label `اجمالي الزيارات عن العام` (Century Gothic 11, 002060); **`Q17` `=SUM(Q9:Q16)`** (fill FFFFCC, bold) = 197 in the seed data.
- Column widths: A 9.11, B 3, C 21.78, D 9.11, E–K 5.78, L 6.33, M–P 5.78, Q 11.55, R 11, S 35.89.
- This sheet is **not linked** to the monthly sheets (the visit numbers differ from the monthly H columns, and names are spelled differently, e.g. `ابراهيم جمال طلب` vs `إبراهيم جمال طلب` in the roster; `بيتر غالي صدقي` vs `بيتر غالي اسعد`). Do NOT auto-reconcile; keep it as an independent manual table keyed by row. (Optionally show a non-blocking "possible mismatch" hint.)

### 2.5 `الاجازات والاذونات` — leave & permission log
Portrait A4. AutoFilter `A2:F66`. Freeze under row 2. Merged `A1:F1` = `سجل الاجازات والاذونات عام 2026 - يدوي` (Arial 14 bold white on 2E75B6). Used range A1:F150 (rows 3–150 pre-styled; data in rows 3–66). Column widths: A 22.55, B 13.55, C 15.33, D 15.78, E 13.66, F 17.
Row 2 headers (Arial 10 bold white on 2E75B6, wrapped): A `اسم الموظف`, B `النوع`, C `تاريخ البداية`, D `تاريخ النهاية`, E `عدد الأيام`, F `اجمالي اجازات الموظف`.
- A: employee name (text; keyed by NAME not code; spelling differs from roster: e.g. `ابراهيم جمال عبدالتواب`).
- B: **type**, dropdown (inline list, rows 3–150): `اجازه اعتيادي`, `اجازه مرضي`, `اجازه بخصم`, `اذن ساعه`, `اذن ساعتين`, `مامورية`.
- C, D: start/end. **Mixed storage**: some are real Excel dates (format `mm-dd-yy`), others are TEXT strings like `19/4/2026` (dd/m/yyyy). Many real dates are very likely day/month-swapped by Excel locale (e.g. row 3: C3 = 2026-08-04 with D3 = `19/4/2026` — start probably meant 8 April). Do not silently "correct". Import raw values, display them as-is, flag rows where start > end or the type of the cell is text, and offer an explicit, user-approved "normalise dates" helper.
- E: days count or a free text reason (`11`, `1`, `2`, `5`, but also `خميس العهد`, `اذن`, `استلام اللاب`, `مصيف`, `عارضه`, …) — **it is a mixed numeric/text column in practice**. Treat as free input; numeric when numeric.
- F: **manual summary block, not a per-row column.** F3:F15 holds alternating `name, total, name, total, …` pairs (`نجيب عيد نجيب` 12 · `هشام محمد عبدربه` 4 · `ابراهيم جمال عبدالتواب` 6 · `بيتر غالي اسعد` 6 · `ابانوب جرجس نجيب` 1 · `ماهر ماهر فوزي` 2 · `حجازي عبدالرحمن محمد` 5) typed manually (no formulas). Model it as a separate "manual leave totals" table; optionally show a computed comparison (count of rows per employee) but never overwrite the manual numbers.
- Records: 64 rows (rows 3–66) listed in Appendix A.

---------------------------------------------------------------------
## 3. BUSINESS RULES & CALCULATIONS (implement exactly)

### 3.1 Monthly total
`monthTotal(code, month) = visits + s1 + s2 + s3 + s4 + s5 + s6 + s7 + s8` where each value counts only if numeric; blanks/text count as 0 (Excel SUM semantics). Worked example: يناير, code 1001877 → visits 2; scores 1,5,3,5,5,5,5,5 → **36**. (Text in a numeric cell, e.g. `H5='تعيين فبراير'` in يناير for code 1007801, contributes 0.)

### 3.2 Annual aggregates per employee code
- `annualVisits(code) = Σ over 12 months of visits(H)` where code present (first matching row per month; absent→0).
- `annualPoints(code) = Σ over 12 months of monthTotal`.
- The match is by **code only**, first row in each month sheet (duplicates inside a month: only the first row is used — the app must block duplicate codes within a month).
- `monthsSinceJoin = (today − joiningDate in days) / 30` (not calendar months; fractional). `m = INT(monthsSinceJoin)`.

### 3.3 Annual grade (J)
```
p = 0.25 if m <= 3
    0.50 if m <= 6
    0.75 if m <= 9
    1.00 otherwise            # m is INT(K)
n = annualPoints
grade = "ضعيف"      if n <  240*p
        "مقبول"     if n <  280*p
        "جيد"       if n <  330*p
        "جيد جداً"  if n <  430*p      # note: with U+064B
        "ممتاز"     otherwise
if joiningDate empty/invalid, K = (today − 0)/30 ≈ 1500+ → p = 1 (Excel treats blank as 0); the sheet shows ضعيف for blank rows — in the web app do not list blank rows.
```
Never change thresholds or the 30-day month. Use whole-day arithmetic (date at local midnight, like TODAY()). Provide an "as-of date" test override (default = today) so results are reproducible.

Worked examples (as-of 2026-11-01; joining date from the consolidated sheet):
| Code | Name | Join | Annual visits | Annual points | K | m | p | Grade |
|------|------|------|---------------|---------------|---|---|---|-------|
| 1001877 | هشام محمد عبدربه | 2024-01-11 | 36 | 332 | 34.17 | 34 | 1.00 | جيد جداً (330≤332<430) |
| 1007355 | ابانوب جرجس نجيب | 2026-01-01 | 51 | 331 | 10.13 | 10 | 1.00 | جيد جداً |
| 1007801 | حجازي عبدالرحمن محمد | 2026-01-03 | 19 | 288 | 10.07 | 10 | 1.00 | جيد |
| 1006567 | بيتر غالي اسعد | 2025-01-11 | 45 | 371 | 21.97 | 21 | 1.00 | جيد جداً |
| 1002185 | إبراهيم جمال طلب | 2024-01-12 | 21 | 316 | 34.13 | 34 | 1.00 | جيد |
| 1003603 | نجيب عيد نجيب | 2025-01-04 | 23 | 367 | 22.2 | 22 | 1.00 | جيد جداً |
| 1001523 | ماهر ماهر فوزي | 2026-01-08 (as stored in the month sheets) | 7 | 77 | 9.9 | 9 | 0.75 | ضعيف (77 < 180) |
Note for 1001523: the main sheet used to have a hard-typed joining date of 2026-08-01 (→ K≈3.07, p=0.25, grade جيد) but the month sheets say 2026-01-08 (almost certainly a day/month swap; his first month with data is اغسطس). Per the workbook's rule (first occurrence in month sheets) the value is 2026-01-08. **Surface a visible data-quality warning** in the app for this case, let the user correct the date (writes to the monthly sheets' F cells), and never decide silently.

### 3.4 Employee master consolidation (main sheet B–G)
As in §2.2: distinct codes, order = first appearance (Jan→Dec, then row), identity = first occurrence. In the app the roster is derived (read-only list); editing an employee's identity must rewrite the identity cells in every month sheet where that code has a row (and the app should ask whether to apply to all months or only the first-occurrence month, defaulting to "all months" so the consolidated view stays consistent).

### 3.5 Capacity rules inherited from the template
Main sheet: 100 employees max (rows 3–102). Each month: 50 rows (rows 3–52) — January additionally has Q formulas to row 198 but A-sequence and styling only to 52. Month scan range for consolidation: rows 3–200. Leave log: rows 3–150 carry styling and the type-dropdown. Visit dashboard: rows 9–16, total in row 17. The app must enforce these limits (or implement safe row insertion — see §7.5) and tell the user clearly.

---------------------------------------------------------------------
## 4. RELATIONSHIPS

```
Data (lists) ──dropdowns──▶ Sector/Governorate columns (months, main)
Month sheets (12) ──code E──▶ MAIN sheet:
     • identity B,C,D,F,G  ← first occurrence (INDEX/MATCH chain)
     • H visits            ← Σ month!H via code
     • I points            ← Σ month!Q via code
     • K months, J grade   ← F (join date) and I
`الزيارات الميدانية` — independent, manual, keyed by row/name
`الاجازات والاذونات` — independent, manual, keyed by name text (NOT code)
```
Employee code is the only cross-sheet key and must be unique per month sheet and across the roster. Names are NOT reliable keys (spelling differs across sheets).

---------------------------------------------------------------------
## 5. KNOWN QUIRKS / DATA-QUALITY ITEMS (preserve; surface in UI; never silently fix)
1. Monthly total `Q` includes the visit count (H) — intentional per formula; annual points include visits.
2. Text typed in numeric cells: يناير `H5` = `تعيين فبراير` (hired in Feb) and فبراير `H5` = `تدريب` (training) for code 1007801; SUM treats them as 0. Keep the raw text; show it as a note chip; counts as 0.
3. Visit dashboard: `I16` = `مستقيل` (resigned) as text inside a numeric range; its row total ignores it.
4. Leave log: mixed text/date cells, probable day-month swaps, mixed numeric/text "days" column, names differing from roster, manual F block.
5. Main-sheet CF literal `جيد جدا` ≠ formula output `جيد جداً` (see §2.2).
6. Legend in main sheet lacks the "ضعيف" row and shows unscaled thresholds.
7. `Print_Area`/`Print_Titles` for `الزيارات الميدانية` are `#REF!`.
8. Names across sheets are spelled differently (`ابراهيم`/`إبراهيم`, `صدقي`/`اسعد`); `احمد ايمن كمال` appears only in the visit and leave sheets (resigned) and never in monthly sheets.
9. Nov/Dec monthly sheets are mostly empty (Dec has one visit for 1001877).
10. Blank main rows display `ضعيف` and K≈1544 in Excel; do not replicate in the UI list but keep the formulas in the exported file.

---------------------------------------------------------------------
