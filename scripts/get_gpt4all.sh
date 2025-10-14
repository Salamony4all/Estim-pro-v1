#!/usr/bin/env bash
set -euo pipefail

# Usage:
# ./get_gpt4all.sh [model_url_or_empty]
# If no arg is provided, the script queries the GitHub Releases API for nomic-ai/gpt4all
# and downloads the first asset ending in .bin from the latest release.

REPO="nomic-ai/gpt4all"
OUTDIR="$(dirname "$0")/../models"
mkdir -p "$OUTDIR"

if [ $# -ge 1 ] && [ -n "$1" ]; then
  MODEL_URL="$1"
else
  echo "Querying latest release for $REPO..."
  API_URL="https://api.github.com/repos/$REPO/releases/latest"
  # Prefer jq if available, otherwise use grep/sed as fallback
  if command -v jq >/dev/null 2>&1; then
    MODEL_URL=$(curl -sSf "$API_URL" -A "gpt4all-downloader" | jq -r '.assets[] | select(.name|test("\\.bin$")) | .browser_download_url' | head -n1)
    MODEL_NAME=$(curl -sSf "$API_URL" -A "gpt4all-downloader" | jq -r '.assets[] | select(.name|test("\\.bin$")) | .name' | head -n1)
  else
    resp=$(curl -sSf "$API_URL" -A "gpt4all-downloader")
    MODEL_URL=$(echo "$resp" | grep -o '"browser_download_url": *"[^"]*\.bin"' | head -n1 | sed -E 's/"browser_download_url": *"([^"]*)"/\1/')
    MODEL_NAME=$(echo "$resp" | grep -o '"name": *"[^"]*\.bin"' | head -n1 | sed -E 's/"name": *"([^"]*)"/\1/')
  fi
  if [ -z "${MODEL_URL:-}" ]; then
    echo "Failed to find a .bin asset in the latest release of $REPO" >&2
    exit 2
  fi
  echo "Found model: ${MODEL_NAME:-$(basename "$MODEL_URL")}" 
fi

OUTFILE="$OUTDIR/${MODEL_NAME:-$(basename "$MODEL_URL")}" 
echo "Downloading $MODEL_URL to $OUTFILE"
curl -L --progress-bar "$MODEL_URL" -o "$OUTFILE"
echo "Download finished: $OUTFILE"
echo "To use this model with the Python backend (bash): export PY_LLAMA_MODEL_PATH=\"$OUTFILE\""
#!/usr/bin/env bash
# Simple downloader for GPT4All GGML model (Linux/macOS/WSL)
set -euo pipefail
MODEL_URL=${1:-"https://gpt4all.io/models/ggml/gpt4all-lora-quant-v1.1.bin"}
OUT_DIR="$(dirname "$0")/../models"
OUT_NAME=${2:-"gpt4all-lora-quant.bin"}
mkdir -p "$OUT_DIR"
OUT_PATH="$OUT_DIR/$OUT_NAME"

echo "Downloading GPT4All model from: $MODEL_URL"
echo "Saving to: $OUT_PATH"

if command -v curl >/dev/null 2>&1; then
  curl -L "$MODEL_URL" -o "$OUT_PATH"
elif command -v wget >/dev/null 2>&1; then
  wget -O "$OUT_PATH" "$MODEL_URL"
else
  echo "Please install curl or wget to download the model." >&2
  exit 1
fi

echo "Download completed: $OUT_PATH"
echo "Set PY_LLAMA_MODEL_PATH to point to this file to enable local Llama/GPT4All mode in the backend."
