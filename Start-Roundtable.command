#!/bin/bash
cd -- "$(dirname -- "$0")" || exit 1
export PATH="$PATH:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin"
if ! command -v node >/dev/null 2>&1; then
  echo "Install Node.js 22 or newer from https://nodejs.org, then reopen this file."
  read -r -p "Press Enter to close."
  exit 1
fi
ROUNDTABLE_OPEN=1 node server.mjs
read -r -p "Press Enter to close."
