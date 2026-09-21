# Static Site Extractor Boundary

The project-decomposition extractor needs a recognized package/workspace boundary and does not decompose an unmanifested static site.

## What Happened
For the Flores Amarillas static site, JavaScript extraction requires `package.json` plus `src/` or workspace metadata, and Python extraction requires recognized package markers. The repository has neither, so L1 and profile mode returned no modules.

## Takeaway
Do not invent topology groups from directory names when L1 has no modules. Regenerate topology only after the extractor supports static-site boundaries or the project exposes a recognized package structure.

## History
- 2026-09-21 (Flores Amarillas/project-decomposition): initial
