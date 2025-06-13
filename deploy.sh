#!/bin/bash

set -e  # Exit on any error

# Check for required argument
if [[ "$1" != "prod" && "$1" != "dev" ]]; then
  echo "Usage: $0 [prod|dev]"
  exit 1
fi

# Set environment name and path to .env file
if [ "$1" == "prod" ]; then
  AZD_ENV="ava-prod"
else
  AZD_ENV="ava-nonprod"
fi

ENV_PATH=".azure/$AZD_ENV/.env"

# Check if the .env file exists
if [ ! -f "$ENV_PATH" ]; then
  echo "❌ .env file not found at $ENV_PATH"
  exit 1
fi

# Refresh azd environment
echo "🔄 Refreshing azd environment: $AZD_ENV"
azd env refresh -e "$AZD_ENV"

# Load environment variables from file
echo "📦 Loading environment variables from $ENV_PATH"
set -a
source "$ENV_PATH"
set +a

# Deploy
echo "🚀 Deploying with azd"
azd deploy