#!/usr/bin/env python3
"""
Legacy entry: same as build_cefr_levels_json.py with two args (A1, A2 only).
For A1+A2+B1 use: python3 scripts/build_cefr_levels_json.py <A1> <A2> <B1>
"""
from __future__ import annotations

import json
import sys
from pathlib import Path


def load_col0_words(path: Path) -> set[str]:
    import openpyxl

    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb["Vocabulary"]
    s: set[str] = set()
    first = True
    for row in ws.iter_rows(values_only=True):
        if first:
            first = False
            continue
        w = row[0]
        if w and str(w).strip():
            s.add(str(w).strip().lower())
    wb.close()
    return s


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    out = root / "web" / "src" / "data" / "cefr-a1-a2.json"
    if len(sys.argv) < 3:
        print(
            "Usage: python3 build_cefr_a1_a2_json.py <A1.xlsx> <A2.xlsx>  |  or  build_cefr_levels_json.py <A1> <A2> [B1]",
            file=sys.stderr,
        )
        sys.exit(1)
    a1p = Path(sys.argv[1]).resolve()
    a2p = Path(sys.argv[2]).resolve()
    if not a1p.is_file() or not a2p.is_file():
        print("A1 or A2 xlsx not found.", file=sys.stderr)
        sys.exit(1)
    a1 = load_col0_words(a1p)
    a2 = load_col0_words(a2p)
    data = {
        "version": 1,
        "sourceFiles": [a1p.name, a2p.name],
        "note": "Lookup: trim+lower. A1 if in a1; else A2 if in a2. Overlap: A1 wins.",
        "a1Count": len(a1),
        "a2Count": len(a2),
        "overlapCount": len(a1 & a2),
        "a1": sorted(a1),
        "a2": sorted(a2),
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=0)
    print("Wrote", out, f"({out.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
