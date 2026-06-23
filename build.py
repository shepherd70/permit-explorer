#!/usr/bin/env python3
"""Build the deployable site for the Calgary permit explorer.

The explorer (src/city_explorer.html) is a single self-contained static page —
it queries the City of Calgary open-data API live in the browser and needs no
build. This script publishes it as dist/index.html, so Cloudflare Pages serves
it at the site root (without an index.html at the output root, "/" 404s), and
copies the static root-level files (Cloudflare _headers, sitemap.xml, robots.txt)
alongside it so each is reachable at the domain root.

No third-party dependencies (standard library only).

Usage:
    python build.py        # or: npm run build
"""
import pathlib
import shutil
import sys

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / "src" / "city_explorer.html"
DIST = ROOT / "dist"
INDEX = DIST / "index.html"

# Root-level files copied verbatim into the deploy output when present. Cloudflare
# Pages serves the output dir (dist/) at the domain root, so anything that must be
# reachable at "/" — HTTP headers, the sitemap, robots rules — has to be copied in;
# a file sitting only at the repo root never reaches the deployed site.
PASSTHROUGH = ["_headers", "sitemap.xml", "robots.txt"]


def main() -> int:
    if not SRC.exists():
        print(f"error: {SRC} not found", file=sys.stderr)
        return 1

    DIST.mkdir(exist_ok=True)
    shutil.copyfile(SRC, INDEX)                      # the explorer IS the site root (index.html)
    built = [INDEX]

    for name in PASSTHROUGH:
        src_file = ROOT / name
        if src_file.exists():
            dest = DIST / name
            shutil.copyfile(src_file, dest)
            built.append(dest)

    # The deploy output must contain index.html at its root, or Cloudflare Pages 404s on "/".
    assert INDEX.exists(), "build did not produce dist/index.html"

    print("built " + ", ".join(str(p.relative_to(ROOT)) for p in built))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
