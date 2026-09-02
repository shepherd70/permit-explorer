#!/usr/bin/env python3
"""Build the deployable site for the permit explorers.

The Calgary explorer (src/city_explorer.html) is a single self-contained static
page — it queries the City of Calgary open-data API live in the browser and
needs no build. This script publishes it as dist/index.html, so Cloudflare Pages
serves it at the site root (without an index.html at the output root, "/" 404s),
and copies the static root-level files (Cloudflare _headers, sitemap.xml,
robots.txt) alongside it so each is reachable at the domain root.

The Kitimat explorer (src/kitimat_explorer.html) cannot query its sources live
(no CORS; see docs/kitimat-scope.md), so it is published as dist/kitimat/index.html
with the committed snapshot (data/kitimat/snapshot.json + meta.json, produced by
fetch_kitimat.py) embedded into its two JSON <script> blocks.

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
KITIMAT_SRC = ROOT / "src" / "kitimat_explorer.html"
KITIMAT_DATA = ROOT / "data" / "kitimat"
KITIMAT_INDEX = DIST / "kitimat" / "index.html"
# The page carries one placeholder block per snapshot file; build.py swaps the null for the JSON.
KITIMAT_BLOCKS = {
    "snapshot.json": '<script type="application/json" id="snapshot">null</script>',
    "meta.json": '<script type="application/json" id="snapshot-meta">null</script>',
}

# Root-level files copied verbatim into the deploy output when present. Cloudflare
# Pages serves the output dir (dist/) at the domain root, so anything that must be
# reachable at "/" — HTTP headers, the sitemap, robots rules — has to be copied in;
# a file sitting only at the repo root never reaches the deployed site.
PASSTHROUGH = ["_headers", "sitemap.xml", "robots.txt"]


def embed_json(page: str, placeholder: str, raw_json: str) -> str:
    """Inline a JSON document into a <script type="application/json"> block.

    JSON is not HTML-escaped inside <script>, so the only sequences that can end
    the block early are '</' (e.g. '</script>') and, for parsers that treat them as
    line terminators, U+2028/U+2029. A backslash-escaped slash is a valid JSON escape, so the
    embedded text still parses byte-for-byte to the same document.
    """
    if page.count(placeholder) != 1:
        raise ValueError(f"expected exactly one placeholder {placeholder!r} in {KITIMAT_SRC.name}")
    safe = raw_json.strip().replace("</", "<\\/").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
    filled = placeholder.replace(">null<", ">" + safe + "<")
    return page.replace(placeholder, filled)


def build_kitimat() -> list[pathlib.Path]:
    if not KITIMAT_SRC.exists():
        return []                                    # Kitimat page not present in this checkout — nothing to build
    page = KITIMAT_SRC.read_text(encoding="utf-8")
    for fname, placeholder in KITIMAT_BLOCKS.items():
        data_file = KITIMAT_DATA / fname
        if not data_file.exists():
            raise FileNotFoundError(f"{data_file} missing — run: python3 fetch_kitimat.py")
        page = embed_json(page, placeholder, data_file.read_text(encoding="utf-8"))
    KITIMAT_INDEX.parent.mkdir(parents=True, exist_ok=True)
    KITIMAT_INDEX.write_text(page, encoding="utf-8")
    return [KITIMAT_INDEX]


def main() -> int:
    if not SRC.exists():
        print(f"error: {SRC} not found", file=sys.stderr)
        return 1

    DIST.mkdir(exist_ok=True)
    shutil.copyfile(SRC, INDEX)                      # the explorer IS the site root (index.html)
    built = [INDEX]
    try:
        built += build_kitimat()                     # dist/kitimat/index.html with the snapshot embedded
    except (FileNotFoundError, ValueError) as e:
        print(f"error: {e}", file=sys.stderr)
        return 1

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
