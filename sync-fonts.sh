#!/bin/sh
# Copy the latest built fonts from the font project, then refresh metrics.json.
cd "$(dirname "$0")"
cp ../pokemon-custom-emerald-font/build/fonts/*.ttf fonts/
python3 gen_metrics.py
