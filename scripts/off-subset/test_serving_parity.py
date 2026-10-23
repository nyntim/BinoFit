"""Verify the live mapper/catalog serving contract without catalog dependencies."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
MODULE = Path(__file__).with_name("build_off_subset.py")
spec = importlib.util.spec_from_file_location("build_off_subset", MODULE)
mapper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mapper)
FIXTURES = json.loads((ROOT / "test-utils/fixtures/off-serving-parity.json").read_text())


class ServingParityTests(unittest.TestCase):
    def test_labels(self):
        for case in FIXTURES["labels"]:
            with self.subTest(case=case["name"]):
                self.assertEqual(mapper.clean_serving_size(case["serving_size"] or ""), case["normalized_label"])
                self.assertEqual(mapper.build_serving_units(case["serving_size"], case["quantity"], case["unit"]), case["serving_units"])

    def test_mapping(self):
        for case in FIXTURES["mapping"]:
            with self.subTest(case=case["name"]):
                row = dict.fromkeys(("generic_name", "brands", "unique_scans_n", "popularity_tags", "main_category", "last_modified_t", "creator"))
                row.update(code="036000291452", product_name="Fixture", serving_size=case["serving_size"],
                           serving_quantity=None if case["quantity"] is None else str(case["quantity"]))
                row.update({key: str(value) for key, value in case["nutriments"].items()})
                result = mapper.map_row(row)
                if case["expected"] is None:
                    self.assertIsNone(result)
                else:
                    self.assertIsNotNone(result)
                    for key, value in case["expected"].items():
                        if isinstance(value, (int, float)):
                            self.assertAlmostEqual(result[key], value)
                        else:
                            self.assertEqual(result[key], value)

    def test_import_has_no_cli_or_catalog_side_effects(self):
        result = subprocess.run([sys.executable, "-I", "-c", """
import importlib.util
import sys
from unittest.mock import patch
spec = importlib.util.spec_from_file_location('mapper', sys.argv[1])
module = importlib.util.module_from_spec(spec)
sys.argv = []
with patch('builtins.open', side_effect=AssertionError('unexpected file I/O')):
    spec.loader.exec_module(module)
assert not {'duckdb', 'pyarrow', 'pyarrow.parquet'} & sys.modules.keys()
""", str(MODULE)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "")


if __name__ == "__main__":
    unittest.main()
