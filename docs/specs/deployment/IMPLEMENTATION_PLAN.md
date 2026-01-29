# Implementation Plan: K3s 3-Node Deployment (us-east-1)

This plan details how to implement the K3s deployment in
`docs/specs/deployment/README.md` with Terraform, Doppler, and a stage
deployment workflow.

## Scope and assumptions

- AWS region: us-east-1.
- 3 EC2 nodes running K3s servers with scheduling enabled.
- Instance type: t3.medium (upgrade later if throttled).
- Nginx Ingress in-cluster; ALB in front.
- App DB and Temporal DB are managed Postgres (outside the cluster).
- Redis is managed (outside the cluster).
- Secrets injected via Doppler at deploy time (no secrets in git).
- No .env files or secret tfvars committed; use Doppler or GitHub Secrets.
- Stage and prod share the same K3s cluster (single 3-node footprint) and
  are isolated by Kubernetes namespaces and ingress hostnames.

## Phase 1: Infrastructure as Code (Terraform)

Goal: create a minimal, cost-aware 3-node K3s cluster with ALB, private
subnets, and access to managed databases.

### Terraform layout (single-cluster)

- `infra/terraform/`
  - `envs/stage/` (single cluster; no secrets committed)
  - `modules/vpc/`
  - `modules/compute/` (3 EC2 nodes + SGs + IAM)
  - `modules/alb/`
  - `modules/iam/`

Notes:
- Keep `envs/stage/` limited to non-secret variables only.
- Backend credentials and any sensitive TF vars are provided via GitHub
  Secrets in CI (e.g., `TF_VAR_*`, AWS creds), not stored in the repo.

### Core resources

- VPC with public + private subnets (2-3 AZs).
- Internet gateway + route tables.
- NAT gateway for private subnets (costy but required for egress).
- Security groups:
  - ALB -> NodePort range (e.g., 30000-32767).
  - Nodes -> DB ports (5432, 6379) only.
  - SSH optional (prefer SSM).
- ALB in public subnets targeting the Nginx NodePort on each node.
- 3 EC2 instances (t3.medium) in private subnets.
- Single ALB and target groups for the shared cluster.
- IAM role for EC2 nodes:
  - SSM access (recommended).
  - ECR read only if you switch to ECR later.

### K3s bootstrap (cloud-init/user data)

- Use a shared K3S token generated in Terraform (`random_password`).
- Node 1 runs `server --cluster-init --disable traefik --disable servicelb`.
- Nodes 2-3 join with `K3S_URL=https://<node1-private-ip>:6443` and the same
  token.
- Enable scheduling on server nodes (default in K3s).

Notes:
- Disabling Traefik avoids conflict with Nginx Ingress.
- Store kubeconfig securely after bootstrap (SSM or a protected bastion).

### Deliverables

- `terraform apply` produces:
  - VPC + subnets + routing
  - ALB + SGs
  - 3 EC2 nodes with K3s running

## Phase 2: Cluster add-ons and base services

Goal: install required K8s components and wire ingress.

### Add-ons

- Nginx Ingress (Helm):
  - Expose via NodePort for ALB target group.
  - Use `externalTrafficPolicy: Local` for client IPs if needed.
- metrics-server (for HPA).

### Optional add-ons (later)

- cert-manager for TLS (or use ALB TLS termination with ACM).
- Prometheus + Grafana for metrics.
- Loki or CloudWatch agent for logs.

## Phase 3: Secrets strategy (Doppler + GitHub Secrets)

Goal: keep secrets out of git and Terraform state.

### Doppler setup

- Create Doppler project and configs: `stage`, `prod`.
- Create a Doppler service token for `stage`.
- Create a Doppler service token for `prod`.
- Store tokens in GitHub Secrets:
  - `DOPPLER_TOKEN_STAGE`
  - `DOPPLER_TOKEN_PROD`

### Inject at deploy time

- Keep Kubernetes manifests in `deployment/` with placeholders.
- In CI: `doppler run -- envsubst < deployment/app.yaml | kubectl apply -f -`.

## Phase 4: CI/CD workflow (stage namespace)

Goal: on merge to `stage`, build/push image and deploy to the `stage`
namespace in the shared cluster.

### Build and publish

- Reuse the existing Docker build steps in
  `.github/workflows/docker-publish.yml`.
- For stage, tag images with the short SHA or `stage-<sha>`.

### Deploy workflow (new)

Create a new workflow `deploy-stage.yml`:

1) Trigger: `push` to `stage` branch (merge to stage).
2) Build and push image `ghcr.io/<org>/ducsigr-app:<sha>`.
3) Deploy:
   - Authenticate to the cluster.
   - Run Doppler + envsubst to render manifests.
   - Apply manifests with `kubectl apply -n stage`.
4) Verify rollout:
   - `kubectl rollout status deploy/web -n stage`.
   - `kubectl rollout status deploy/ingest -n stage`.
   - `kubectl rollout status deploy/worker -n stage`.

## Phase 5: CI/CD workflow (prod namespace)

Goal: deploy to prod only on explicit release or manual approval.

### Deploy workflow (new)

Create a new workflow `deploy-prod.yml`:

1) Trigger: `push` of a release tag (`v*`) or `workflow_dispatch`.
2) Build and push image `ghcr.io/<org>/ducsigr-app:<tag>`.
3) Deploy:
   - Authenticate to the cluster.
   - Run Doppler + envsubst to render manifests (use `DOPPLER_TOKEN_PROD`).
   - Apply manifests with `kubectl apply -n prod`.
4) Verify rollout:
   - `kubectl rollout status deploy/web -n prod`.
   - `kubectl rollout status deploy/ingest -n prod`.
   - `kubectl rollout status deploy/worker -n prod`.

## Environment placement (single cluster)

- One K3s cluster with 3 EC2 nodes.
- Namespaces: `stage` and `prod`.
- Single ALB + Nginx Ingress with host-based routing.
- Separate Doppler configs per namespace.
- Stage uses smaller replica counts; prod uses higher replica counts.
- Add ResourceQuota/LimitRange to `stage` to protect prod.

### Cluster access from CI (important)

The K3s nodes are in private subnets. GitHub-hosted runners cannot reach
them directly. Use one of:

- Self-hosted GitHub runner inside the VPC (recommended).
- SSM: run `kubectl` commands on a bastion node via `aws ssm send-command`.
- VPN/peering and locked-down runner with access to the VPC.

## Control plane behavior during deploy

K3s handles rolling updates. Ensure:
- Readiness and liveness probes in deployments.
- `maxUnavailable: 0` for critical services.
- PodDisruptionBudgets for web/ingest/worker.

## Missing items checklist (add as needed)

- DNS: Route53 record to ALB.
- TLS: ACM + ALB termination or cert-manager + Nginx.
- Backups: RDS PITR + snapshot policy.
- Disaster recovery runbook (restore + verification).
- Cost alerts and budget thresholds.
- K3s upgrade plan (node-by-node drain/upgrade).
- Runtime security (image scanning, least-privilege RBAC).
