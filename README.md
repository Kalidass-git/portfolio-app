# Family Wealth

Personal finance and portfolio tracker built from a personal Excel workbook. Plain JavaScript PWA, no build step. Data stored in a Google Drive JSON file through a small Apps Script backend (`backend/Code.gs`).

- Setup: `docs/SETUP.md`
- Run locally: `python3 -m http.server 8765`
- Tests: `node tests/allocgoal.test.mjs` runs on made-up numbers; the other tests in `tests/` take a data file as an argument. Tests and tools that contain real figures are kept private and are not in this repository.
- Import from Excel: `python3 tools/import_xlsx.py in.xlsx out.json`
