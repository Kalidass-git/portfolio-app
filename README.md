# Family Wealth

Personal finance and portfolio tracker built from Portfolio_2026_Lite.xlsx. Plain JavaScript PWA, no build step. Data stored in a Google Drive JSON file through a small Apps Script backend (`backend/Code.gs`).

- Setup: `docs/SETUP.md`
- Run locally: `python3 -m http.server 8765`
- Tests: `node tests/calc.test.mjs path/to/portfolio-data.json`
- Import from Excel: `python3 tools/import_xlsx.py in.xlsx out.json`
