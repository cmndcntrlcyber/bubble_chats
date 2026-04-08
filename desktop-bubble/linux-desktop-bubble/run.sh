#!/usr/bin/env bash
set -e

if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "Error: ANTHROPIC_API_KEY is not set."
  echo "  export ANTHROPIC_API_KEY=sk-ant-..."
  exit 1
fi

# Allow the Docker container to connect to the local X11 display
xhost +local:docker >/dev/null 2>&1 || true

docker compose up --build
