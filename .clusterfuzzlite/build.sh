#!/usr/bin/env bash
# ClusterFuzzLite build script. Runs inside the base-builder-python image.
# Installs the python-sdk in editable mode plus its dev deps so the
# harnesses can import understand_quickly.* directly. Then compiles each
# harness in fuzz/*.py into a fuzzer binary under $OUT/.
#
# The base image provides `compile_python_fuzzer` from the OSS-Fuzz
# helpers; it wraps atheris + libFuzzer and emits a self-contained
# binary that ClusterFuzzLite (or OSS-Fuzz) can run.
set -euxo pipefail

cd "$SRC/understand-quickly/python-sdk"
pip install --no-cache-dir -e .

for harness in "$SRC/understand-quickly"/fuzz/fuzz_*.py; do
  compile_python_fuzzer "$harness"
done
