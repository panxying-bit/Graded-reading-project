#!/usr/bin/env python3
"""Rebuild config/mastery-words-l0-l2.json from config/wordlists/Level-0-Level-2_wordlist.xlsx (sheets l0, l1, l2; Type = Mastery)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

try:
    import openpyxl
except ImportError:
    print("Install openpyxl: pip install openpyxl", file=sys.stderr)
    raise

ROOT = Path(__file__).resolve().parents[1]
XLSX = ROOT / "config" / "wordlists" / "Level-0-Level-2_wordlist.xlsx"
OUT = ROOT / "config" / "mastery-words-l0-l2.json"


def main() -> None:
    if not XLSX.is_file():
        print(f"Missing: {XLSX}", file=sys.stderr)
        sys.exit(1)
    wb = openpyxl.load_workbook(XLSX, read_only=True, data_only=True)
    per_sheet: dict[str, int] = {"l0": 0, "l1": 0, "l2": 0}
    lower_set: set[str] = set()
    for sname in ("l0", "l1", "l2"):
        ws = wb[sname]
        for row in ws.iter_rows(min_row=3, values_only=True):
            if not row or not row[1]:
                continue
            if str(row[4] or "").strip() != "Mastery":
                continue
            w = str(row[1]).strip()
            if w:
                lower_set.add(w.lower())
                per_sheet[sname] = per_sheet.get(sname, 0) + 1
    data = {
        "version": 1,
        "sourceFile": "config/wordlists/Level-0-Level-2_wordlist.xlsx",
        "sheets": ["l0", "l1", "l2"],
        "tag": "Mastery",
        "rowCountsMastery": per_sheet,
        "uniqueLowercaseCount": len(lower_set),
        "words": sorted(lower_set),
    }
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUT} ({len(lower_set)} unique words)")


if __name__ == "__main__":
    main()
