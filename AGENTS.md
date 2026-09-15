# AGENTS

## Purpose
This repository hosts a pure vanilla JavaScript widget that fetches and displays the latest 10 library books from an SRU catalog endpoint.

## Agent Defaults (Auto Mode)
- Work in small, reversible patches.
- Search existing code patterns before introducing new structures.
- Keep implementation dependency-free and framework-free.
- Preserve accessibility basics (`aria-live`, semantic headings, keyboard-safe buttons).

## Technical Constraints
- Do not introduce build tools, transpilers, or package dependencies unless explicitly requested.
- Do not use Node.js or run `node` commands in this repository.
- Keep SRU integration in `js/sru-widget.js` and runtime settings in `js/config.js`.
- Parse XML using namespace-safe local-name lookups.
- Keep UI logic and fetch logic separate.

## Done Criteria For Changes
- Browser page loads with no runtime errors.
- Widget handles loading, success, empty state, and error state.
- New behavior is documented in `README.md` when relevant.
- Agent response summarizes what changed and any manual follow-up required.