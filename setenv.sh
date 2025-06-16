#!/bin/bash

set -e  # Exit on any error

# === Validate input ===
if [[ $# -eq 0 ]]; then
  echo "Usage: $0 [--prod|--dev]"
  exit 1
fi

# === Map argument to environment ===
case "$1" in
  --prod)
    AZD_ENV="ava-prod"
    ;;
  --dev)
    AZD_ENV="ava-nonprod"
    ;;
  *)
    echo "❌ Invalid option: $1"
    echo "Usage: $0 [--prod|--dev]"
    exit 1
    ;;
esac

# === Define .env path ===
ENV_PATH=".azure/$AZD_ENV/.env"

# === Ensure .env file exists ===
if [ ! -f "$ENV_PATH" ]; then
  echo "❌ .env file not found at $ENV_PATH"
  exit 1
fi

# === Refresh azd environment ===
echo "🔄 Refreshing azd environment: $AZD_ENV"
azd env refresh -e "$AZD_ENV"
azd env select "$AZD_ENV"

# === Load variables ===
echo "📦 Loading environment variables from $ENV_PATH"
set -a
source "$ENV_PATH"
set +a

echo "✅ Environment loaded: $AZD_ENV"