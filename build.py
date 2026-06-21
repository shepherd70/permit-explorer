#!/usr/bin/env python3
"""Build the deployable site for the Calgary permit explorer.

The explorer (src/city_explorer.html) is a single self-contained static page —
it queries the City of Calgary open-data API live in the browser and needs no
build. This script just publishes it as dist/index.html, so Cloudflare Pages
serves it at the site root (without an index.html at the output root, "/" 404s),
and copies the Cloudflare _headers file alongside it.

No third-party dependencies (standard library only).

Usage:
    python build.py        # or: npm run build
"""
import pathlib
import shutil
import sys

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / "src" / "city_explorer.html"
HEADERS = ROOT / "_headers"
DIST = ROOT / "dist"
INDEX = DIST / "index.html"


def main() -> int:
    if not SRC.exists():
        print(f"error: {SRC} not found", file=sys.stderr)
        return 1

    DIST.mkdir(exist_ok=True)
    shutil.copyfile(SRC, INDEX)                      # the explorer IS the site root (index.html)

    built = [INDEX]
    if HEADERS.exists():
        dist_headers = DIST / "_headers"
        shutil.copyfile(HEADERS, dist_headers)       # Cloudflare reads _headers from the output root
        built.append(dist_headers)

    # The deploy output must contain index.html at its root, or Cloudflare Pages 404s on "/".
    assert INDEX.exists(), "build did not produce dist/index.html"

    print("built " + ", ".join(str(p.relative_to(ROOT)) for p in built))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
