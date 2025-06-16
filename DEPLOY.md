# 🚀 Deployment Guide

This guide explains how to deploy or run the application locally using the provided helper scripts: `deploy.sh` and `setenv.sh`.

---

## 🔧 Prerequisites

Before you begin, make sure you have the following installed:

- [Azure Developer CLI (azd)](https://learn.microsoft.com/en-us/azure/developer/azure-developer-cli/)
- Bash or PowerShell
- Azure authenticated via `az login`
- Environment files in `.azure/ava-prod/.env` and/or `.azure/ava-nonprod/.env`

---

## 📂 Script Overview

### `deploy.sh`

This is the main script for end-to-end deployment or local execution. It supports the following operations:

| Mode           | Command               | Description                                                  |
|----------------|------------------------|--------------------------------------------------------------|
| **Production** | `./deploy.sh --prod`   | Deploys the app using the `ava-prod` environment             |
| **Non-Prod**   | `./deploy.sh --dev`    | Deploys the app using the `ava-nonprod` environment          |
| **Local Run**  | `./deploy.sh --local`  | Runs the app locally using `start.sh` or `start.ps1`         |

### `setenv.sh`

This script is used to refresh and load environment variables without triggering a deployment or starting the app.

| Mode           | Command               | Description                                                  |
|----------------|------------------------|--------------------------------------------------------------|
| **Production** | `./setenv.sh --prod`   | Loads and exports variables for the `ava-prod` environment   |
| **Non-Prod**   | `./setenv.sh --dev`    | Loads and exports variables for the `ava-nonprod` environment|

---

## 📦 What Each Script Does

### `deploy.sh`

1. Validates the environment argument (`--prod`, `--dev`, or `--local`)
2. Detects your shell (Bash or PowerShell)
3. Refreshes and selects the Azure environment using `azd`
4. Loads environment variables from `.env` into your shell
5. Runs:
   - `azd deploy` for deployment
   - `./app/start.sh` or `./app/start.ps1` for local run

### `setenv.sh`

1. Validates the environment argument (`--prod` or `--dev`)
2. Refreshes and selects the Azure environment using `azd`
3. Loads environment variables from `.env` into your shell session
4. Does **not** deploy or run the app — ideal for debugging or ad hoc script use

---

## 📝 Environment File Format

Each `.env` file should follow this structure:

```env
API_KEY=your-api-key
APP_PORT=3000
DEBUG=true
```

Avoid spaces around `=`. All variables will be exported to your shell.

---

## ❗ Troubleshooting

- `❌ .env file not found`: Make sure `.azure/ava-prod/.env` or `.azure/ava-nonprod/.env` exists.
- `azd: command not found`: Ensure Azure Developer CLI is installed and in your PATH.
- `Permission denied`: Run `chmod +x deploy.sh setenv.sh` to make the scripts executable.
- `pwsh: command not found`: Install PowerShell Core if using `--local` on Windows/Linux in PowerShell mode.

---

## 🧪 Examples

```bash
# Deploy to production
./deploy.sh --prod

# Deploy to non-production
./deploy.sh --dev

# Run locally (auto-detects your shell)
./deploy.sh --local

# Load environment for non-production (without deploying or running)
./setenv.sh --dev

# Load environment for production (without deploying or running)
./setenv.sh --prod
```