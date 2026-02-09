#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path


def fix_markdown(path: Path, cutoff_line: int = 0) -> str:
    """
    Fix escaped newlines/quotes after a cutoff line.

    The document was manually fixed up to cutoff_line (1-based).
    Everything after that is treated as a block that may contain
    literal '\\n' and '\\"' sequences that should be unescaped.
    """
    raw = path.read_text(encoding="utf-8")
    lines = raw.splitlines()

    if cutoff_line < 0:
        raise ValueError("cutoff_line must be >= 0")

    prefix = lines[:cutoff_line]
    suffix = "\n".join(lines[cutoff_line:])

    fixed_suffix = suffix.replace("\\n", "\n").replace('\\"', '"')

    # Normalize to a single trailing newline.
    merged = "\n".join(prefix)
    if merged and fixed_suffix:
        merged = f"{merged}\n{fixed_suffix}"
    else:
        merged = merged + fixed_suffix

    return merged.rstrip("\n") + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Fix escaped newlines/quotes in Markdown."
    )
    parser.add_argument("path", type=Path, help="Target markdown path")
    parser.add_argument(
        "--cutoff-line",
        type=int,
        default=0,
        help="1-based line number already fixed (suffix will be repaired)",
    )
    args = parser.parse_args()

    target = args.path
    updated = fix_markdown(target, cutoff_line=args.cutoff_line)
    target.write_text(updated, encoding="utf-8")


if __name__ == "__main__":
    main()
