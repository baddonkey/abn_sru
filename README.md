# SRU New Books Widget (Vanilla JS)

This project is a lightweight widget that displays new arrivals from a library catalog exposed via an SRU interface.

## Tech Stack
- HTML
- CSS
- JavaScript (no frameworks)

## Project Structure
- `index.html`: page and widget container
- `styles/main.css`: visual design and responsive layout
- `js/config.js`: SRU endpoint and query settings
- `js/sru-widget.js`: SRU fetch + XML parsing + rendering helpers
- `js/main.js`: app bootstrap and refresh handling
- Embedded `library-data` JSON in `index.html`: ABN scopes, short codes, optional field-filter overrides, and display names
- `.github/copilot-instructions.md`: repository-specific Auto mode guidance for Copilot
- `AGENTS.md`: coding-agent workflow and contribution guardrails

## Configure Your SRU Endpoint
Edit `js/config.js`:
- `endpoint`: your SRU base URL
- `query`: your CQL query for new books when no dynamic local-field filter is active
- `recordSchema`: usually `dc` or the schema your server supports
- `sortBy`: optional Alma CQL sort expression using an index marked sortable by the endpoint
- `searchScope`: optional discovery scope (for ABN for example `ABN_AKB`, `ABN_HFGS`, `ABN_AKS`)
- `tab`: optional discovery tab value, usually same as `searchScope`
- `vid`: optional discovery view ID
- `recentMonthCount`: how many months to include, default `1` (current month)
- `sruPageSize`: how many records to request per page
- `displayLimit`: maximum number of records to render

Default values are preconfigured for swisscovery ABN:
- `endpoint`: `https://swisscovery.slsp.ch/view/sru/41SLSP_ABN`
- `version`: `1.2`
- `searchScope`: empty (all ABN libraries)
- `tab`: empty (all ABN libraries)
- `vid`: `41SLSP_ABN:ABN`
- `recentMonthCount`: `1`
- `sruPageSize`: `50`
- `displayLimit`: `1000`

With the default configuration, the widget queries the current month using the local field 990 code pattern. The timeline slider can extend the period to the preceding 11 months. In July 2026, the default query becomes:

```text
alma.local_field_990 all "NEL*2607"
```

The widget loads matching MARC records in pages of 50 and renders up to 1000 records. Results are grouped by accession month from newest to oldest. Infinite scrolling exhausts all pages for one month before loading the next month, and each month starts with a visible heading.

For records with an ISBN in MARC field `020$a`, the widget loads a cover from Open Library. ISBN qualifiers such as `(hbk.)` are ignored, and the cover area is hidden when Open Library has no image.

The **Bibliothek** filter offers all ABN libraries or one individual library. The **Zeitraum** filter includes the current month plus up to 11 preceding months. In the all-library view, the widget uses the SRU wildcard query `alma.local_field_990 all "NEL*YYMM"` for each selected month. An individual library uses an exact code such as `alma.local_field_990=NELAKBYYMM`.

`searchScope`, `tab`, and `recentMonthCount` define the initial selection. Library options are read from the embedded `library-data` JSON in `index.html`, so no separate JSON request is required when opening the page directly.

Each library uses `short` for its normal abbreviation. If the code in MARC field `990$a` differs, set `filterShort`; for example, a library can keep `short: "KSZ"` but use `filterShort: "BZZ"` to query `NELBZZYYMM`. Without this optional property, the filter uses `short`.

## Run Locally
From the project root:

```bash
python3 -m http.server 5500
```

Then open http://localhost:5500 in your browser.

## Notes
- Some SRU servers block browser-origin requests without CORS headers. If requests fail, verify CORS support on the SRU endpoint.
- XML fields differ across catalogs. If needed, adjust parsing in `js/sru-widget.js`.
- The ABN endpoint supports server-side sorting by `alma.main_pub_date`, `alma.creator`, and `alma.title`. Local field 990 is searchable but not sortable, so the timeline filter cannot be ordered by its 990 accession code on the server.

Test commit.