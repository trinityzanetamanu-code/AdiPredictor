#!/usr/bin/env python3
"""Build the reproducible owner ZIP; no APK, networking or relay."""
from pathlib import Path
import argparse
import zipfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]


def bookmarklet():
    # Keep block comments; drop line comments before joining physical lines.
    source = ' '.join(line.strip() for line in (HERE / 'capture.js').read_text().splitlines()
                      if not line.lstrip().startswith('//'))
    return 'javascript:' + source + '\n'


def build(output):
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name in ('capture.js', 'hk_diagnostic.py'):
            archive.write(HERE / name, 'AdiPredictor_HK_DiagnosticKit/' + name)
        archive.writestr('AdiPredictor_HK_DiagnosticKit/bookmarklet.txt', bookmarklet())
        archive.write(ROOT / 'docs/hk-android-diagnostic.md', 'AdiPredictor_HK_DiagnosticKit/PETUNJUK.md')
    print(output)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('output', type=Path)
    build(parser.parse_args().output)
