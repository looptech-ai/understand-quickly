# ClusterFuzzLite build environment. Base image is the upstream Python
# fuzzing base (provides atheris, libFuzzer driver, and the standard
# OSS-Fuzz build harness). We copy the repo in at /src/understand-quickly
# so build.sh can `pip install` python-sdk and emit one fuzzer binary per
# harness under /out.
FROM gcr.io/oss-fuzz-base/base-builder-python@sha256:1c10dd0acb1fd0b29cd58e35d3eebb946e88e5a90f3fbd0e2eea4e89c5feb40b

# System tooling we need at build time. Pinned to whatever the base
# image's apt repo currently serves; bumps come for free with base bumps.
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR $SRC
COPY . understand-quickly
WORKDIR $SRC/understand-quickly
COPY .clusterfuzzlite/build.sh $SRC/build.sh
