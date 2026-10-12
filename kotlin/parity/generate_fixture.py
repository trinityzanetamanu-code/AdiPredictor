#!/usr/bin/env python3
"""Regenerate the fast Kotlin-test oracle from original frozen Python, never production."""

import argparse
import json
import sys
import tempfile
from datetime import datetime
from pathlib import Path

from compare import CLOCK, cases, dump, freeze


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    if sys.version_info[:2] != (3, 11):
        parser.error("Use CPython 3.11, matching the production numeric contract")
    if args.output.exists() or "public" in args.output.resolve().parts:
        parser.error("Choose a fresh output file outside production public")
    with tempfile.TemporaryDirectory(prefix="adipredictor-fixture-") as temporary:
        work = Path(temporary)
        manifest, snapshot = freeze(work)
        pe, requests = cases(snapshot, work, quick=True)

        class FrozenDateTime(datetime):
            @classmethod
            def now(cls, tz=None):
                value = datetime.fromisoformat(CLOCK)
                return value.astimezone(tz) if tz else value.replace(tzinfo=None)

        pe.datetime = FrozenDateTime
        pe.ROOT = work / "oracle"
        pe.PRED_DIR = pe.ROOT / "public/predictions"
        rows = json.loads(Path(requests[0]["input"]).read_text())
        config = json.loads(Path(requests[0]["config"]).read_text())
        payload = pe.build_prediction("HK", rows, config)
        fixture = dict(
            origin=f"Live build_prediction() oracle, source {manifest['source_sha']}, CPython 3.11",
            clock=CLOCK,
            market="HK",
            rows=rows,
            config=config,
            prediction=payload,
            model_matrices={
                name: pe.model_matrix(name, rows, details=True)[0] for name in pe.MODELS
            },
            svgs={
                p["image_path"]: (pe.ROOT / "public" / p["image_path"]).read_text(
                    encoding="utf-8"
                )
                for p in payload["visual_patterns"]
            },
        )
        dump(args.output, fixture)


if __name__ == "__main__":
    main()
