# tests/run_all_tests.py
"""
Master Test Runner for NexNum Gateway SMS Platform (Phases 1 - 7)
"""
import sys
import os
import unittest
from pathlib import Path

# Add bot_project directory to sys.path
_bot_dir = Path(__file__).resolve().parent.parent
if str(_bot_dir) not in sys.path:
    sys.path.insert(0, str(_bot_dir))

def run_suite():
    print("=" * 70)
    print(" [START] STARTING FULL DEEP TEST SUITE FOR NEXNUM GATEWAY (PHASES 1 - 7)")
    print("=" * 70)

    loader = unittest.TestLoader()
    suite = unittest.TestSuite()

    # Discover and add test files
    tests_dir = Path(__file__).resolve().parent
    suite.addTests(loader.discover(str(tests_dir), pattern="test_phase*.py"))

    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    print("\n" + "=" * 70)
    if result.wasSuccessful():
        print(" [SUCCESS] ALL TESTS PASSED SUCCESSFULLY ACROSS ALL 7 PHASES!")
    else:
        print(f" [WARNING] TEST RUN COMPLETED WITH {len(result.failures)} FAILURES AND {len(result.errors)} ERRORS")
    print("=" * 70)

    sys.exit(0 if result.wasSuccessful() else 1)

if __name__ == "__main__":
    run_suite()
