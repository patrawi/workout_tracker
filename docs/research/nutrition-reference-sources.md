# Nutrition Reference Sources — Expanding Coverage Beyond the 314-Row ThaiFCD Snapshot

**Date**: 2026-09-15
**Question**: Which additional food-composition databases could we import into the local Nutrition Reference Catalog to expand coverage, especially for Thai/Asian cooked dishes (e.g. "ไข่เจียว" currently returns no reference)?

## Question & context

The `nutrition_references` catalog (`backend/src/schema.ts`) is multi-provider by design — `provider` + `provider_food_code` + `version` form the unique key, with `name_en`/`name_th`, per-100 g protein/carbs/fat/alcohol/calories, `extra_nutrients` jsonb, and an optional pgvector embedding — so any number of sources can coexist with attribution retained per record. Today it holds only **314 rows** imported from a ThaiFCD CSV subset via `backend/scripts/import-thaifcd.ts` (provider=`thaifcd`, version=`2026-09-13`). "ไข่เจียว" (Thai omelet) and similar cooked Thai dishes miss; this note evaluates what to import next.

Every claim below was checked against the owning site where possible; counts that no primary page states are marked **unverified**. Dead/moved resources are noted honestly.

## Comparison table

| Source | Thai/Asian cooked-dish coverage | Items | Per-100 g macros | Access | Thai names | License | Import effort |
|---|---|---|---|---|---|---|---|
| **ThaiFCD Online v3, Aug 2025** (INMU Mahidol) | Best-in-class: Thai cooked dishes, mixed foods, Thai snacks | Count not stated on site (unverified; the 2015 print edition is commonly cited at ~1,055 items; ASEAN FCT ~1,740 — both secondary) | Yes (per-100 g, kJ/kcal, macro + micronutrients) | Query-only web tool; **no public bulk download**; CSV/electronic exports appear to be provided by INMU on request (our 314-row file is one) | Yes (+ English) | © INMU, all rights reserved; **non-commercial use free with acknowledgement**; commercial/resale "may incur fees" | S–M *if* an electronic export is obtained (same script as today); web-scraping not advisable under terms |
| **Thai DoH "ตารางแสดงคุณค่าทางโภชนาการอาหารไทย 2561 (2018)"** (สำนักโภชนาการ กรมอนามัย) | Thai cooked menus (อาหารทำเนียบ), Thai snacks, royal-project dishes | Not stated (82 MB PDF; ~117k downloads) | Yes (per-100 g; also per-household-measure in places) | PDF download (official page) + online search `thaifcd.anamai.moph.go.th/nss/` | Yes (Thai primary) | **No explicit reuse license published** — Thai gov works are copyrighted by default; attribution + verify before redistribution | L (PDF table extraction / OCR) |
| **USDA FoodData Central** (SR Legacy + Survey/FNDDS + Foundation + Branded) | Asian-style *generic* dishes in English: FNDDS/WWEIA categories include "Pad Thai with meat", egg rolls/dim sum, omelets, fried rice/lo mein/stir-fry | SR Legacy **7,793**; Survey (FNDDS) **5,432**; Branded **433,403**; Experimental 115 (per FDC food-search page); Foundation Foods count unverified | Yes (per-100 g + per-serving for FNDDS) | Free bulk CSV/JSON downloads + free API (API key required) | No (English only) | US Government work → **public domain** (per data.gov catalog) | S (CSV zip → same upsert pattern; multi-file layout) |
| **Japan MEXT Standard Tables, 8th rev. (2023)** | Japanese cooked dishes (nikujaga, oyakodon, tempura, etc.) — closest analog to ThaiFCD for a neighbor cuisine | ~2,200+ foods (8th rev., commonly cited; **unverified** on fetched pages) | Yes (per-100 g) | Excel files (JP + English edition) on MEXT site | No (Japanese/English) | Japanese gov work (Copyright Act art. 13 → no copyright for ministry edits); MEXT attribution customary | M (Excel parse) |
| **MyFCD Malaysia** (MOH) | Malay/Asian cooked: 2017 edition added **668 prepared foods** + 441 raw/processed (1997 ed. had 783) | ~1,892 per academic citations (secondary; site itself doesn't state a total) | Yes (per-100 g; 29 mandatory nutrients) | Online searchable DB; **bulk Excel download not confirmed** on the site | No (Malay/English) | Malaysian gov site; no explicit open license found | M–L (may need per-food scraping or official request) |
| **TKPI Indonesia 2017** (Kemenkes) | Indonesian cooked dishes (nasi goreng, sambal, etc.) | Book-scale (~1,000s; exact **unverified**) | Yes (per-100 g) | Full book PDF via Kemenkes repository (`repository.kemkes.go.id/book/668`); web DB panganku.org | No (Bahasa Indonesia) | No explicit license; gov publication | M–L (PDF extraction) |
| **PhilFCT / FNRI Philippines** | Filipino dishes | 2019/2020 print; FAO lists a 2025 update | Yes | **Login-required** electronic library (`i.fnri.dost.gov.ph/fct/library`) | No (English/Tagalog) | Publication of DOST-FNRI; request-based | L |
| **Vietnamese FCT** (NIN Hanoi) | Vietnamese dishes | 2007 ed. 567 pp.; 2019 ed. exists | Yes | 2007 PDF floats on mirrors; 2019 not publicly posted | No (Vietnamese/English) | No explicit license | L |
| **FAO/INFOODS uFood / AnFooD** | Compiled analytical data across regions incl. Asia; cooked/composite entries sparse | Not stated (Excel; **unverified**) | Yes | Free Excel from FAO/INFOODS hub | No | FAO encourages use w/ citation (per INFOODS pages) | M |
| **ASEAN Food Composition Tables 2000** (INMU/ASEANFOODS) | Regional dishes incl. Thai | ~1,740 items (secondary citation) | Yes | **PDF only** (via ifct2017.com / ResearchGate); superseded by ThaiFCD v3 | Partial (English) | © publishers (INMU et al.) | L (PDF) + outdated |
| **Open Food Facts** | Poor for cooked dishes — barcode/packaged/branded foods; Thai packaged products sparse | Millions of products (count not stated on data page) | Yes (per-100 g) | Bulk CSV dump (~0.9 GB gzip), JSONL/Parquet; API must not be used for bulk | Product names in local language when contributors add them | **ODbL + DbCL — share-alike**: derived DBs must stay ODbL | S (dump parse) but low relevance |
| **Commercial APIs** (Nutritionix, Edamam, FatSecret, Chomp) | Good cooked/restaurant coverage incl. some Thai | Proprietary | Yes | API-only queries | Mixed | See below — **bulk import into a local DB is contractually blocked** | n/a |

## Per-source notes

### 1. ThaiFCD Online v3 (Institute of Nutrition, Mahidol University) — https://inmu.mahidol.ac.th/thaifcd/
- The official domain is **inmu.mahidol.ac.th/thaifcd/** (not "thaifcd.com" — that name did not resolve to anything official). Current release: **"Online version 3, August 2025"** (Judprasong et al., 2025), confirmed by the [FAO catalog entry](https://www.fao.org/food-composition/tables-and-databases/detail/(thailand--2025)-thai-food-composition-database/en), which lists formats as "Static document (PDF), electronic file and searchable web tool" and access as "Free access".
- **No food count is stated anywhere** on the homepage or the [2015-edition content page](https://inmu.mahidol.ac.th/thaifcd/content/1) (fetched 2026-09-15). Secondary literature commonly cites the 2015 print FCT at ~1,055 food items and the ASEAN tables at ~1,740 — treat as unverified. Our existing 314-row file is a subset, so the full DB is materially larger.
- **Usage terms** (from the site's own pages): © Institute of Nutrition, Mahidol University (INMU), all rights reserved; *non-commercial users may access and use the data free of charge provided proper acknowledgement is given to INMU as source and copyright holder; reproduction for resale or other commercial purposes, including use in educational products or services, may incur fees.* A single-user personal workout tracker with attribution is comfortably in the non-commercial bucket, but bulk redistribution of their data inside an open-source repo would need care (ship as a private snapshot / import-on-demand, as the current script already does: "never copy it into the repo").
- **Import path**: the DB is query-only on the web. The realistic route is requesting a full electronic export from INMU (the FAO entry implies an "electronic file" exists) — that drops straight into the existing `import-thaifcd.ts` pattern with a new `--version` label. Prefer not to scrape the web tool.

### 2. Thai Department of Health, Bureau of Nutrition — "ตารางแสดงคุณค่าทางโภชนาการอาหารไทย 2561" — https://nutrition2.anamai.moph.go.th/th/thai-food-composition-table
- Official download page offers the **2018 "Nutritive Values of Thai Foods"** (82.34 MB PDF, ~117,669 downloads) and the 2001 edition, plus supplementary tables (fatty acids/cholesterol, amino acids, sugar in Thai fruits, calcium). This complements ThaiFCD: the DoH table is organized around **Thai cooked menus (อาหารทำเนียบ)** — exactly the ไข่เจียว / ผัดไทย / แกงจืด tier we're missing.
- The page also links the Bureau's **online search system** at `thaifcd.anamai.moph.go.th/nss/index.php` (the old `nut.dds.in.th` domain no longer resolves — DNS dead as of 2026-09-15).
- **License**: none published on the page. Under the Thai Copyright Act B.E. 2537, official government works are *not* automatically public domain, so treat as attribution-required and confirm redistribution intent before publishing extracted data. For a personal, non-commercial app this is low risk; keep the source citation per row.
- **Import effort: L** — table extraction from a large Thai-script PDF (unlike ThaiFCD, no CSV). Feasible but a real parsing project.

### 3. USDA FoodData Central — https://fdc.nal.usda.gov/download-datasets
- **Counts** (shown on the [FDC food-search page](https://fdc.nal.usda.gov/food-search) and [data.gov catalog](http://catalog.data.gov/dataset/usda-national-nutrient-database-for-standard-reference-legacy-release)): SR Legacy **7,793** foods (final release, SR28-based); Survey Foods (FNDDS 2021–2023) **5,432** food codes; Branded Foods **433,403**; Experimental 115; Foundation Foods count not shown on fetched pages (unverified).
- **Asian/Thai-style dish coverage**: FNDDS/WWEIA food categories include "Pad Thai with meat", egg rolls and dim-sum-type items, and fried rice/lo mein/stir-fry, plus many omelet variants (see [CDC WWEIA category mapping](https://www.cdc.gov/mmwr/preview/mmwrhtml/mm6105-table.htm) and the [FNDDS 2019–2020 documentation](https://www.sciencedirect.com/science/article/am/pii/S0889157523004210)). Coverage is *generic American-English descriptions of Asian-style dishes*, not authentic Thai recipes — good enough as an English-language fallback (an "omelet" fallback for ไข่เจียว, "pad thai" for ผัดไทย), not as a Thai-food source.
- **Access**: free bulk downloads (CSV per data type, JSON for full), free API with signup key (per [FDC FAQ](https://fdc.nal.usda.gov/faq/)).
- **License**: US federal government work → public domain (stated on the [data.gov SR Legacy catalog entry](http://catalog.data.gov/dataset/usda-national-nutrient-database-for-standard-reference-legacy-release)); attribution appreciated, not required.
- **Import effort: S** — zip of CSVs; map survey/legacy food code → `provider_food_code`, per-100 g columns already present. The one wrinkle: FNDDS macro values are per 100 g in the SR-like files, matching our schema directly.

### 4. Singapore HPB "Energy and Nutrient Composition of Food" (ENCF)
- The long-cited portal `focos.hpb.gov.sg/eservices/ENCF/` **no longer resolves (DNS dead, checked 2026-09-15)**. A 2025 medRxiv paper points to a successor at `https://pphtpc.hpb.gov.sg/web/sgfoodid/tools/food`, which loads as a JS app titled **"Food Insights Database Singapore"** — no documented bulk download or API was found on it (page body not crawlable).
- Coverage would have been interesting (hawker cooked dishes, English), but with no stable download and no published license for reuse, this is **not importable** today. Status: monitor.

### 5. MyFCD Malaysia — https://myfcd.moh.gov.my/
- MOH Malaysia's database; history page states the 1997 FCD had **783 foods/19 nutrients**, and the current edition adds **441 raw/processed + 668 prepared foods** (site text). Academic papers cite the 2017 table at **1,892 foods / 29 mandatory nutrients** (secondary). Strong Malay/Asian cooked-dish coverage (nasi lemak, rendang…), reasonably relevant to a Thai/SE-Asian user.
- Site is a searchable web DB; **no confirmed bulk Excel download**. License not explicit (Malaysian government work). **Import: M–L** (scrape or request) — do after Thai sources and USDA.

### 6. Indonesia TKPI 2017 / Vietnam VFCT / Philippines PhilFCT
- **TKPI 2017**: full book PDF mirrored officially at [repository.kemkes.go.id/book/668](https://repository.kemkes.go.id/book/668); community web DB [panganku.org](https://www.panganku.org/). Bahasa Indonesia names only. **M–L** (PDF extraction).
- **Vietnam**: 2007 VFCT (567 pp., NIN Hanoi) circulates as PDF mirrors; the 2019 edition is cited in journals ([PMC9201877](https://pmc.ncbi.nlm.nih.gov/articles/PMC9201877/)) but not publicly posted. **L**.
- **Philippines**: [PhilFCT](https://i.fnri.dost.gov.ph/fct/library) is an electronic library **behind a login** (FAO lists a 2025 update). **L**.

### 7. Japan MEXT Standard Tables (8th rev., 2023) — https://www.mext.go.jp/en/policy/science_technology/policy/title01/detail01/1374030.htm
- Excel files in Japanese and English editions on the official page; FAO confirms "electronic file (Excel) and searchable web tool" formats for the [2023 8th edition](https://www.fao.org/food-composition/tables-and-databases/detail/(japan--2023)-standard-tables-of-food-composition-in-japan---8th-edition/en).
- Japanese-cooked-dish analog of ThaiFCD (per-100 g, cooked composites). License: ministry-edited tables fall under Copyright Act of Japan art. 13 (no copyright in government editorial works); the exact figure of foods per edition was not stated on fetched pages (**unverified**, commonly ~2,200+). **Import: M** (Excel parse). Worth it only if the user logs Japanese dishes.

### 8. FAO/INFOODS compilations — https://www.fao.org/infoods/infoods/tables-and-databases/faoinfoods-databases/en/
- **uFood/AnFooD**: free Excel downloads, compiled from member FCTs with documented provenance; useful as a cross-check, not as primary Thai dish coverage (cooked/composite entries are sparse). FAO pages encourage use with citation; no onerous license.
- **ASEAN Food Composition Tables 2000**: PDF only (per [FAO INFOODS Asia page](https://www.fao.org/infoods/infoods/tables-and-databases/asia/en/)); superseded by ThaiFCD v3 for our purposes. Skip.
- **WorldFood Dietary Assessment System**: legacy DOS-era system; [overview PDF](https://www.fao.org/fileadmin/templates/food_composition/documents/World_food_dietary_assessment_system/Overview_of_the_WorldFood_Dietary_Assessment_System.pdf) exists on fao.org but the data is old — skip.

### 9. Open Food Facts — https://world.openfoodfacts.org/data
- License: **ODbL (database) + DbCL (contents), CC BY-SA for images**; bulk CSV dump (~0.9 GB gzip) provided precisely because scraping/API-bulking is blocked. Share-alike applies to derived databases.
- Relevance: barcode-scanned **packaged/branded** foods. Cooked Thai dishes (ไข่เจียว as prepared) are essentially absent; Thai packaged products exist but are thin. Only worth importing if the user wants packaged-goods scanning (they don't today — input is free text).
- **Verdict: skip for this use case**; the ODbL share-alike would also infect our catalog snapshot if we ever redistributed it.

### 10. Commercial nutrition APIs
- **Edamam**: terms state you *"may not resell, transfer, exchange, or license the Edamam Data to any third parties"* ([edamam.com/terms](https://www.edamam.com/terms/), [API ToS](https://www.edamam.com/terms/api/)) — storing their data in our own DB and serving it from our API is a redistribution breach. API-only use is possible but the app's design is a **local catalog** (offline matcher, pgvector) — incompatible.
- **Nutritionix**: data is licensed, "Licensee may not install or use the API for any other purpose without Nutritionix's prior written consent" ([signup terms](https://developer.nutritionix.com/signup)); bulk DB is a separate paid license ([nutritionix.com/api](https://www.nutritionix.com/api)).
- **FatSecret Platform API**: attribution badge/snippet required (except paid Premier tier); caching beyond 24 h prohibited except explicitly "storable" data ([terms](https://platform.fatsecret.com/terms), [editions](https://platform.fatsecret.com/api-editions)) — rules out a local snapshot.
- **Chomp**: subscription data-licensing vendor; no public open terms permitting local bulk storage were found (unverified exact clause; assume restricted).
- **Verdict: all four are API-usage options, not import sources.** They'd also add a recurring cost and an external dependency the catalog design explicitly avoids.

## Recommendations

### (a) Best next imports for a Thai user searching in Thai
1. **Full ThaiFCD v3 (Aug 2025) export from INMU** — same provider, new `version`, zero new code. Email INMU for the "electronic file" the FAO entry references; non-commercial use + acknowledgement is their stated free tier. This single move likely multiplies coverage 3–5x over the 314-row subset (full size unverified) with native Thai names. *License: © INMU, free non-commercial w/ attribution; keep the snapshot out of git, as the current script does.*
2. **Thai DoH "Nutritive Values of Thai Foods 2018" PDF** — the Thai-menu (อาหารทำเนียบ) complement to ThaiFCD, from the [Bureau of Nutrition page](https://nutrition2.anamai.moph.go.th/th/thai-food-composition-table). Import as `provider="thai-doh-2018"`. Effort L (PDF table extraction), no explicit license → attribute per-row and don't redistribute the extract publicly.
3. If regional dishes matter later: **MyFCD (Malaysia)** prepared-foods section or **TKPI 2017** — both SE-Asian cooked dishes, both non-English names, both web/PDF-gated (M–L). Optional.

### (b) Best English-language fallback
- **USDA FoodData Central, SR Legacy (7,793) + Survey/FNDDS (5,432)** — public domain, free CSV bulk download, per-100 g macros, imports with small effort. FNDDS explicitly contains "Pad Thai with meat", egg rolls/dim sum, omelets and stir-fry categories, so Thai-input → English-generic mapping (e.g. ไข่เจียว → "Egg omelet") has real hits. Import as `provider="usda-srlegacy"` / `provider="usda-fndds"`. Optionally let the existing Gemini pipeline translate/match Thai dish names → USDA codes at parse time, keeping USDA as pure `name_en` rows.

### (c) Sources to avoid, and why
- **Edamam / Nutritionix / FatSecret / Chomp** — contract terms prohibit storing/redistributing their data in your own database (Edamam's explicit no-resale/no-transfer clause; FatSecret's 24-hour cache limit; Nutritionix's consent clause). Only viable as live API features, which contradicts the local-catalog + pgvector design.
- **Open Food Facts** — wrong data shape for cooked dishes (packaged/barcode foods) and ODbL share-alike obligations on derived data.
- **ASEAN Food Composition Tables 2000** — PDF-only, 25 years old, superseded by ThaiFCD v3.
- **Singapore HPB ENCF** — old domain dead, successor portal has no documented bulk export or license; monitor but don't build on it.

## Verified dead/moved links (as of 2026-09-15)
- `focos.hpb.gov.sg` (Singapore ENCF) — DNS dead; successor `pphtpc.hpb.gov.sg/web/sgfoodid/tools/food` (JS app).
- `nut.dds.in.th` (DoH NUT DDS) — DNS dead; the DoH online search now lives at `thaifcd.anamai.moph.go.th/nss/index.php` per the anamai page.
- "thaifcd.com" — not an official domain; use `inmu.mahidol.ac.th/thaifcd/`.
