#!/bin/bash

set -e  # Exit on any error

# Check for at least one argument
if [[ $# -eq 0 ]]; then
  echo "Usage: $0 [--prod|--dev|--local]"
  exit 1
fi

# Detect shell type
is_powershell=false
if [[ "$SHELL" == *pwsh || "$SHELL" == *powershell ]]; then
  is_powershell=true
fi

# Set environment name based on flag
case "$1" in
  --prod)
    AZD_ENV="ava-prod"
    ;;
  --dev)
    AZD_ENV="ava-nonprod"
    ;;
  --local)
    # Default to non-prod for local unless user overrides logic later
    AZD_ENV="ava-nonprod"
    ;;
  *)
    echo "❌ Invalid option: $1"
    echo "Usage: $0 [--prod|--dev|--local]"
    exit 1
    ;;
esac

# Set path to the appropriate .env file
ENV_PATH=".azure/$AZD_ENV/.env"

# Ensure .env file exists
if [ ! -f "$ENV_PATH" ]; then
  echo "❌ .env file not found at $ENV_PATH"
  exit 1
fi

# Refresh and load environment variables
echo "🔄 Refreshing azd environment: $AZD_ENV"
azd env refresh -e "$AZD_ENV"
azd env select "$AZD_ENV"

echo "📦 Loading environment variables from $ENV_PATH"
set -a
source "$ENV_PATH"
set +a

# If running local, detect and execute the appropriate start script
if [[ "$1" == "--local" ]]; then
  echo "🏃 Running locally using environment: $AZD_ENV"

  if $is_powershell; then
    if [[ -f "./app/start.ps1" ]]; then
      echo "▶️  Starting PowerShell script: ./app/start.ps1"
      pwsh ./app/start.ps1
    else
      echo "❌ PowerShell script ./app/start.ps1 not found."
      exit 1
    fi
  else
    if [[ -f "./app/start.sh" ]]; then
      echo "▶️  Starting Bash script: ./app/start.sh"
      bash ./app/start.sh
    else
      echo "❌ Bash script ./app/start.sh not found."
      exit 1
    fi
  fi

  exit 0
fi

# If not --local, deploy via azd
echo "🚀 Deploying with azd"
azd deploy