"""Offline unit tests for fetch_kitimat.py's parsers and geometry helpers.

Run: python3 -m unittest test/test_fetch_kitimat.py   (or: npm run test:kitimat-fetch)
No network: every input below is a canned fixture shaped like the live source.
"""
import json
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import fetch_kitimat as fk  # noqa: E402

# A BC Stats wide CSV, trimmed: title row, units row, header row, regional district, Kitimat.
BPER_FIXTURE = (
    "﻿,,,,,,,\n"
    ",Total Building Permits ($ 000),,,,,,\n"
    "Standard Geographical Classification (SGC) 2021,,Jan 2018,Feb 2018,Mar 2018,Apr 2018,,\n"
    "5949,Kitimat-Stikine,704,\"12,292\",935,\"2,844\",,\n"
    "5949005,Kitimat,x,\"12,139\",81,,,\n"
    "5949013,Terrace,1,2,3,4,,\n"
)

CLOUDPERMIT_ROW = {
    "workspace/municipal-case-id": "BLDG-2026-103",
    "address/full-address": " 1250 KINGFISHER AVE ",
    "category-names": [{"entity/language": "en", "localized-string/text": "Commercial building"}],
    "municipality/number": "5949005",
    "issued-date": "2026-08-27T17:51:23.763Z",
    "created": "2026-08-11T22:47:12.410Z",
    "entity/type": "entity.type/workspace",
    "workspace/permit-type": "permit-type/B",
    "domain/state": "execution.state/permit-issued",
    "id": "CA-5949005-B-2026-156",
    "location": {"type": "Point", "coordinates": [-128.631915875, 54.058125049]},
    "property/id": "012092886",
}

SQUARE = {"type": "Feature", "properties": {"name": "Square"},
          "geometry": {"type": "Polygon", "coordinates": [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
                                                          [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]]}}   # with a hole
MULTI = {"type": "Feature", "properties": {"name": "Multi"},
         "geometry": {"type": "MultiPolygon", "coordinates": [[[[20, 20], [30, 20], [30, 30], [20, 30], [20, 20]]],
                                                              [[[40, 40], [50, 40], [50, 50], [40, 50], [40, 40]]]]}}


class BperParser(unittest.TestCase):
    def test_kitimat_row_by_sgc_code(self):
        s = fk.parse_bper_csv(BPER_FIXTURE, kind="value")
        self.assertEqual([p["m"] for p in s], ["2018-01", "2018-02", "2018-03", "2018-04"])
        self.assertEqual(s[0], {"m": "2018-01", "v": None, "x": True})          # 'x' = suppressed
        self.assertEqual(s[1], {"m": "2018-02", "v": 12_139_000, "x": False})   # $000 → dollars, thousands separator stripped
        self.assertEqual(s[2]["v"], 81_000)
        self.assertEqual(s[3], {"m": "2018-04", "v": None, "x": False})         # blank = not yet reported, not suppressed

    def test_units_are_not_scaled(self):
        s = fk.parse_bper_csv(BPER_FIXTURE, kind="units")
        self.assertEqual(s[1]["v"], 12139)

    def test_matches_code_not_name(self):
        # the regional district row (5949) shares the name prefix; only the exact code matches
        s = fk.parse_bper_csv(BPER_FIXTURE, sgc="5949", kind="value")
        self.assertEqual(s[0]["v"], 704_000)
        with self.assertRaises(ValueError):
            fk.parse_bper_csv(BPER_FIXTURE, sgc="9999999")

    def test_header_required(self):
        with self.assertRaises(ValueError):
            fk.parse_bper_csv("a,b\n1,2\n")

    def test_month_key(self):
        self.assertEqual(fk._month_key("Jan 2018"), "2018-01")
        self.assertEqual(fk._month_key("Dec 2026"), "2026-12")
        self.assertIsNone(fk._month_key(""))
        self.assertIsNone(fk._month_key("Kitimat"))
        self.assertIsNone(fk._month_key("Jan"))


class CloudpermitNormaliser(unittest.TestCase):
    def test_normalise(self):
        p = fk.normalise_permit(CLOUDPERMIT_ROW)
        self.assertEqual(p["permit"], "BLDG-2026-103")
        self.assertEqual(p["address"], "1250 KINGFISHER AVE")
        self.assertEqual(p["category"], "Commercial building")
        self.assertEqual(p["pid"], "012092886")
        self.assertEqual(p["state"], "permit-issued")
        self.assertEqual((p["lon"], p["lat"]), (-128.631916, 54.058125))
        # 2026-08-11 22:47 UTC is 15:47 Pacific → same calendar day; 16 days to issue
        self.assertEqual(p["created"], "2026-08-11")
        self.assertEqual(p["issued"], "2026-08-27")
        self.assertEqual(p["days"], 16)

    def test_missing_pieces(self):
        row = dict(CLOUDPERMIT_ROW, **{"category-names": [], "location": None, "issued-date": None, "address/full-address": ""})
        p = fk.normalise_permit(row)
        self.assertEqual(p["category"], "Uncategorized")
        self.assertIsNone(p["lon"])
        self.assertIsNone(p["issued"])
        self.assertIsNone(p["days"])
        self.assertIsNone(p["address"])

    def test_sort_key_is_natural(self):
        keys = sorted(["BLDG-2026-10", "BLDG-2026-9", "BLDG-2025-2", "BLDG-2026-103"], key=fk.permit_sort_key)
        self.assertEqual(keys, ["BLDG-2025-2", "BLDG-2026-9", "BLDG-2026-10", "BLDG-2026-103"])


class Geometry(unittest.TestCase):
    def test_point_in_polygon_with_hole(self):
        self.assertTrue(fk.point_in_geometry((1, 1), SQUARE["geometry"]))
        self.assertFalse(fk.point_in_geometry((5, 5), SQUARE["geometry"]))     # inside the hole
        self.assertFalse(fk.point_in_geometry((11, 5), SQUARE["geometry"]))

    def test_multipolygon(self):
        self.assertTrue(fk.point_in_geometry((45, 45), MULTI["geometry"]))
        self.assertTrue(fk.point_in_geometry((25, 25), MULTI["geometry"]))
        self.assertFalse(fk.point_in_geometry((35, 35), MULTI["geometry"]))

    def test_assign_neighbourhood(self):
        feats = [SQUARE, MULTI]
        self.assertEqual(fk.assign_neighbourhood(1, 1, feats), "Square")
        self.assertEqual(fk.assign_neighbourhood(45, 45, feats), "Multi")
        self.assertEqual(fk.assign_neighbourhood(5, 5, feats), fk.OUTSIDE_LABEL)   # hole → outside
        self.assertEqual(fk.assign_neighbourhood(None, None, feats), fk.OUTSIDE_LABEL)

    def test_simplify_ring_drops_collinear_points_and_keeps_closure(self):
        ring = [[0, 0], [5, 0.00001], [10, 0], [10, 10], [0, 10], [0, 0]]
        out = fk.simplify_ring(ring, tol=0.001)
        self.assertEqual(out[0], out[-1])
        self.assertEqual(len(out), 5)                       # 4 corners + closing vertex
        self.assertNotIn([5, 0.00001], out)

    def test_simplify_keeps_tiny_rings(self):
        tri = [[0, 0], [1, 0], [0, 1], [0, 0]]
        self.assertEqual(fk.simplify_ring(tri, tol=5), tri)

    def test_simplified_polygon_still_contains_its_points(self):
        geom = fk.simplify_geometry(SQUARE["geometry"], tol=0.001)
        self.assertTrue(fk.point_in_geometry((1, 1), geom))
        self.assertFalse(fk.point_in_geometry((5, 5), geom))


class Snapshot(unittest.TestCase):
    def test_build_snapshot_assigns_and_sorts(self):
        rows = [
            dict(CLOUDPERMIT_ROW, **{"workspace/municipal-case-id": "BLDG-2026-10", "location": {"type": "Point", "coordinates": [1, 1]}}),
            dict(CLOUDPERMIT_ROW, **{"workspace/municipal-case-id": "BLDG-2026-9", "location": {"type": "Point", "coordinates": [99, 99]}, "property/id": "000000001"}),
        ]
        fc = {"type": "FeatureCollection", "features": [SQUARE]}
        bper = {"sgc": "5949005", "series": {"total": []}, "first": "2018-01", "last": "2018-01"}
        snap = fk.build_snapshot(rows, bper, fc, {"012092886": "C1"})
        self.assertEqual([p["permit"] for p in snap["permits"]], ["BLDG-2026-9", "BLDG-2026-10"])
        by = {p["permit"]: p for p in snap["permits"]}
        self.assertEqual(by["BLDG-2026-10"]["neighbourhood"], "Square")
        self.assertEqual(by["BLDG-2026-10"]["zone"], "C1")
        self.assertEqual(by["BLDG-2026-9"]["neighbourhood"], fk.OUTSIDE_LABEL)
        self.assertIsNone(by["BLDG-2026-9"]["zone"])
        self.assertEqual(snap["neighbourhood_names"], ["Square", fk.OUTSIDE_LABEL])
        json.dumps(snap)   # serialisable

    def test_committed_snapshot_is_consistent(self):
        """The committed snapshot (if present) must satisfy the page's contract."""
        path = pathlib.Path(__file__).resolve().parents[1] / "data" / "kitimat" / "snapshot.json"
        if not path.exists():
            self.skipTest("no committed snapshot")
        s = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(s["version"], 1)
        self.assertEqual(len(s["neighbourhoods"]["features"]), fk.EXPECTED_NEIGHBOURHOODS)
        self.assertEqual(s["neighbourhood_names"][-1], fk.OUTSIDE_LABEL)
        names = set(s["neighbourhood_names"])
        for p in s["permits"]:
            self.assertIn(p["neighbourhood"], names)
            self.assertTrue(p["permit"] and p["created"], p)
        self.assertEqual(sorted(s["bper"]["series"]), sorted(fk.BPER_SERIES))
        months = [pt["m"] for pt in s["bper"]["series"]["total"]]
        self.assertEqual(months[0], "2018-01")
        for k, series in s["bper"]["series"].items():
            self.assertEqual([pt["m"] for pt in series], months, k)   # every series on the same month axis


if __name__ == "__main__":
    unittest.main(verbosity=1)
