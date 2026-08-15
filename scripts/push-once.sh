#!/bin/sh
# One-time: paste a GitHub token (visible), store it in Keychain, push.
# The token is never echoed back.
set -e
cd "$(dirname "$0")/.."
printf "Paste your GitHub token and press Enter (it will be visible here): "
read -r TOKEN
printf "protocol=https\nhost=github.com\nusername=chocho88\npassword=%s\n" "$TOKEN" | git credential-osxkeychain store
git push -u origin main
echo "Pushed and saved. Future pushes need nothing."
