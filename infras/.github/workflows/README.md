# CI/CD Workflows

Automated deployment to K3s cluster via GitHub Actions.

## Workflow Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Push to stage  │────▶│  deploy-stage   │────▶│  K3s namespace  │
│     branch      │     │    workflow     │     │     "stage"     │
└─────────────────┘     └─────────────────┘     └─────────────────┘

┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Push tag v*    │────▶│  deploy-prod    │────▶│  K3s namespace  │
│  (e.g. v1.0.0)  │     │    workflow     │     │     "prod"      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## Triggers

| Workflow | Trigger | Namespace |
|----------|---------|-----------|
| `deploy-stage.yml` | Push to `stage` branch | `stage` |
| `deploy-prod.yml` | Push tag `v*` (e.g. `v1.0.0`) | `prod` |
| Both | Manual `workflow_dispatch` | respective |

## Required GitHub Secrets

Add these secrets in: **Settings → Secrets → Actions**

| Secret | Description |
|--------|-------------|
| `AWS_ACCESS_KEY_ID` | AWS access key with EC2/SSM permissions |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key |
| `DOPPLER_TOKEN_STAGE` | Doppler service token for `stage` config |
| `DOPPLER_TOKEN_PROD` | Doppler service token for `prod` config |

## How It Works

Since K3s nodes are in **private subnets**, GitHub runners can't reach them directly.

We use **AWS SSM (Systems Manager)** to:
1. Connect to a K3s node
2. Run deployment commands on the node
3. Apply manifests using `kubectl`

```
GitHub Runner → AWS SSM → K3s Node → kubectl apply
```

## Getting Doppler Service Tokens

1. Go to [Doppler Dashboard](https://dashboard.doppler.com)
2. Select project `ducsigr`
3. Go to **Access** tab
4. Click **Generate Service Token**
5. Create tokens for `stage` and `prod` configs
6. Add to GitHub Secrets

## Manual Deployment

### Deploy to Stage

```bash
gh workflow run deploy-stage.yml
```

### Deploy to Production

```bash
# Via tag
git tag v1.0.0
git push origin v1.0.0

# Or manual
gh workflow run deploy-prod.yml -f image_tag=v1.0.0
```

## Production Environment Protection

The `deploy-prod.yml` workflow uses GitHub Environment protection:

1. Go to **Settings → Environments**
2. Create environment `production`
3. Enable **Required reviewers**
4. Add approvers

This ensures prod deployments require manual approval.

## Troubleshooting

### SSM Command Failed

```bash
# Check SSM command history in AWS Console
# Systems Manager → Run Command → Command history
```

### Node Not Found

Ensure EC2 instance has tag `Name` containing `stage-server-0` and is running.

### Doppler Token Invalid

Generate a new service token in Doppler dashboard and update GitHub secret.
