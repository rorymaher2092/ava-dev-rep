# 🚀 Deployment Guide

This guide explains how to deploy or run the application locally using the `deploy.sh` helper script.

---

## 🔧 Prerequisites

Before you begin, make sure you have the following installed:

- [Azure Developer CLI (azd)](https://learn.microsoft.com/en-us/azure/developer/azure-developer-cli/)
- Bash or PowerShell
- Azure authenticated via `az login`
- Environment files in `.azure/ava-prod/.env` and/or `.azure/ava-nonprod/.env`

---

## 📂 Script Overview

The `deploy.sh` script supports three main operations:

| Mode | Command | Description |
| ---- | ------- | ----------- |
|      |         |             |

| **Production** | `./deploy.sh --prod`  | Deploys the app using the `ava-prod` environment     |
| -------------- | --------------------- | ---------------------------------------------------- |
| **Non-Prod**   | `./deploy.sh --dev`   | Deploys the app using the `ava-nonprod` environment  |
| **Local Run**  | `./deploy.sh --local` | Runs the app locally using `start.sh` or `start.ps1` |

---

## 📦 What the Script Does

1. **Validates the selected environment**
2. **Refreshes environment variables** from Azure using `azd env refresh -e ENV_NAME`
3. **Loads variables** from `.azure/<env>/.env` into the shell session
4. For deployments: runs `azd deploy`
5. For local: runs `./app/start.sh` (bash) or `./app/start.ps1` (PowerShell), depending on your shell

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
- `Permission denied`: Run `chmod +x deploy.sh` to make the script executable.

---

## 🧪 Examples

```bash
# Deploy to production
./deploy.sh --prod

# Deploy to non-production
./deploy.sh --dev

# Run locally (auto-detects your shell)
./deploy.sh --local
```

