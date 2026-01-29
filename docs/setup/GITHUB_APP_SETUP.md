# GitHub App Setup Guide

This guide walks you through setting up a GitHub App for Ducsigr's repository indexing feature.

## Overview

Ducsigr uses a GitHub App to:
- Connect user workspaces to GitHub accounts/organizations
- Access repository metadata and contents for code indexing
- Receive webhook events for push and pull request activities

## Prerequisites

- A GitHub account
- Access to Ducsigr's environment configuration (Doppler or `.env` file)

## Step 1: Create a GitHub App

1. Go to [GitHub Developer Settings](https://github.com/settings/apps)
2. Click **"New GitHub App"**

## Step 2: Configure Basic Information

| Field | Development Value | Production Value |
|-------|-------------------|------------------|
| **GitHub App name** | `your-app-name-dev` | `your-app-name` |
| **Homepage URL** | `http://localhost:3000` | `https://your-domain.com` |

> **Note:** App names must be unique across all of GitHub.

## Step 3: Configure OAuth Settings

### Identifying and authorizing users

| Field | Development Value | Production Value |
|-------|-------------------|------------------|
| **Callback URL** | `http://localhost:3000/github/callback` | `https://your-domain.com/github/callback` |

- ✅ **Expire user authorization tokens** (checked)
- ☐ **Request user authorization (OAuth) during installation** (unchecked)
- ☐ **Enable Device Flow** (unchecked)

### Post installation

| Field | Development Value | Production Value |
|-------|-------------------|------------------|
| **Setup URL (optional)** | `http://localhost:3000/github/callback` | `https://your-domain.com/github/callback` |

- ✅ **Redirect on update** (checked)

## Step 4: Configure Webhook (Optional for Local Development)

For local development, you can **uncheck "Active"** since GitHub cannot reach localhost.

For production or if using a tunnel (ngrok):

| Field | Value |
|-------|-------|
| **Active** | ✅ Checked |
| **Webhook URL** | `https://your-domain.com/api/webhooks/github` |
| **Webhook secret** | Generate with: `openssl rand -hex 32` |

## Step 5: Set Repository Permissions

Expand **"Repository permissions"** and configure:

| Permission | Access Level |
|------------|--------------|
| **Contents** | Read-only |
| **Metadata** | Read-only |
| **Pull requests** | Read-only |

## Step 6: Subscribe to Events

Check the following events:

- ✅ **Push**
- ✅ **Pull request**

## Step 7: Installation Settings

Select where the app can be installed:

| Environment | Setting |
|-------------|---------|
| Development | **Only on this account** |
| Production | **Any account** (if you want others to install) |

## Step 8: Create the App

Click **"Create GitHub App"** at the bottom of the page.

## Step 9: Collect Credentials

After creating the app, you'll be redirected to the app settings page.

### App ID and Client ID

Found at the top of the settings page:
- **App ID**: A numeric ID (e.g., `123456`)
- **Client ID**: Starts with `Iv1.` or `Iv23.` (e.g., `Iv23lixxxxxxxxxx`)

### Client Secret

1. In the **"Client secrets"** section, click **"Generate a new client secret"**
2. **Copy immediately** - it's only shown once!

### Private Key

1. Scroll to **"Private keys"** section at the bottom
2. Click **"Generate a private key"**
3. A `.pem` file will download to your computer

### Convert Private Key Format (Required)

GitHub generates keys in PKCS#1 format, but the Octokit library requires PKCS#8 format.

**Check your key format:**
- PKCS#1 (needs conversion): `-----BEGIN RSA PRIVATE KEY-----`
- PKCS#8 (correct): `-----BEGIN PRIVATE KEY-----`

**Convert using OpenSSL:**

```bash
# Replace with your actual filename
openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt \
  -in ~/Downloads/your-app-name.YYYY-MM-DD.private-key.pem \
  -out ~/Downloads/github-key-pkcs8.pem

# View the converted key
cat ~/Downloads/github-key-pkcs8.pem
```

The output should start with `-----BEGIN PRIVATE KEY-----`. Use this converted key in your environment variables.

## Step 10: Configure Environment Variables

Add the following to your environment (Doppler or `.env`):

```bash
# GitHub App Configuration
GITHUB_APP_ID="<your-app-id>"
GITHUB_APP_NAME="<your-app-name>"
GITHUB_APP_CLIENT_ID="<your-client-id>"
GITHUB_APP_CLIENT_SECRET="<your-client-secret>"
GITHUB_APP_PRIVATE_KEY="<contents-of-pem-file>"

# Webhook secret (if webhooks are enabled)
GITHUB_WEBHOOK_SECRET="<your-webhook-secret>"
```

### Private Key Format

The private key should include the full contents of the `.pem` file:

```
-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA...
... (multiple lines) ...
-----END RSA PRIVATE KEY-----
```

**For `.env` files:** Replace newlines with `\n`:
```bash
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----"
```

**For Doppler:** Paste the multiline key directly - Doppler handles it automatically.

## Step 11: Restart and Test

1. Restart your development server:
   ```bash
   doppler run -- pnpm dev
   ```

2. Navigate to: **Workspace** → **Settings** → **Repositories**

3. Click **"Connect GitHub"**

4. Authorize the app in the popup

5. Verify repositories appear after connection

## Troubleshooting

### "GitHub App not configured" error

Ensure all required environment variables are set:
- `GITHUB_APP_ID`
- `GITHUB_APP_NAME`
- `GITHUB_APP_PRIVATE_KEY`

### Popup doesn't open or is blocked

- Check browser popup blocker settings
- Ensure you're on `http://localhost:3000` (not `127.0.0.1`)

### "Invalid state" error

- The OAuth state token expired (10 minute limit)
- Try connecting again

### Webhook events not received (production)

1. Verify webhook URL is correct and publicly accessible
2. Check webhook secret matches `GITHUB_WEBHOOK_SECRET`
3. View delivery logs in GitHub App settings → **"Advanced"** tab

## Local Development with Webhooks (Optional)

To receive webhook events locally, use a tunnel service:

### Using ngrok

```bash
# Install
brew install ngrok

# Start tunnel
ngrok http 3000
```

Use the generated URL (e.g., `https://abc123.ngrok.io`) for:
- Webhook URL: `https://abc123.ngrok.io/api/webhooks/github`

### Using Cloudflare Tunnel

```bash
# Install
brew install cloudflared

# Start tunnel
cloudflared tunnel --url http://localhost:3000
```

## Security Notes

- **Never commit credentials** to version control
- **Rotate secrets** if accidentally exposed
- **Use separate GitHub Apps** for development and production
- **Private keys** should be stored securely (use Doppler or similar)

## Related Documentation

- [GitHub Apps Documentation](https://docs.github.com/en/apps)
- [Creating a GitHub App](https://docs.github.com/en/apps/creating-github-apps)
- [Authenticating as a GitHub App](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app)
