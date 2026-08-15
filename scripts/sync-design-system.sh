#!/bin/sh
# Mirror the shared KLOD design system into the repo for standalone deploys.
# The source of truth stays ../design-system - never edit vendor/ directly.
set -e
cd "$(dirname "$0")/.."
rsync -a --delete --exclude preview.html --exclude '*.md' ../design-system/ vendor/design-system/
echo "vendor/design-system mirrored"
