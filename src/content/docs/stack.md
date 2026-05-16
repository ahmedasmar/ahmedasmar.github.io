---
title: Tech stack
description: The actual tools, versions, and patterns I ran in production for 3 years at SaaS scale.
---

Quick-reference of what I ran in production. Useful if you're sizing whether my hands match the role.

## AWS

**Governance**

| Item | Value |
|---|---|
| AWS Organizations | 2 (staging + prod) + acquired Commonplace org |
| AWS accounts | 20 Zencity SSO-managed (9 staging + 11 prod) + ~4 Commonplace = 24 |
| Identity provider | JumpCloud SAML → AWS Identity Center |
| Landing zone | CloudZone-managed via LZCZ Control Tower; SCPs at OU level |
| Regions | `us-east-1`, `eu-west-1`, `ca-central-1`, `eu-west-2` + GCP integration |

**Compute / Kubernetes**

| Item | Version |
|---|---|
| EKS | 1.34 (upgraded through 1.22 → 1.23 → 1.27 → 1.30 → 1.31 → 1.32 → 1.33 → 1.34) |
| Node AMI | **Bottlerocket 1.59** (migrated from AL2 / AL2023, Nov 2025) |
| Autoscaling | **Karpenter 1.12** with NodePool gen5+ gate |
| CNI / kube-proxy / CoreDNS | All with `before_compute = true` for install ordering |
| Service account auth | **Pod Identity** (replaced IRSA fleet-wide May 2026) |

**Networking**

- **Transit Gateway only** (no VPC peering, standardised)
- VPC endpoints for AWS service traffic (no NAT cost for AWS APIs)
- **alterNAT** for cost-optimised egress
- Route 53 multi-account DNS
- AWS WAF (with tuning per Commonplace prod)

**Data / storage**

- RDS PostgreSQL (engine upgrades, Multi-AZ prod)
- ElastiCache Redis
- MongoDB Atlas (Organization Owner for Commonplace cluster)
- io2 → **gp3 above 400 GiB** (gp3 stripes to 12,000 IOPS + 500 MiB/s baseline at lower cost)
- S3 (public-bucket allowlist via SCPs)
- EFS access points for shared workloads

**Security / identity**

- IAM Identity Center / SSO (JumpCloud SAML)
- SCPs at OU level
- KMS envelope encryption
- ACM for certs (auto-renewed via cert-manager DNS-01)
- Secrets Manager (env-vars unchanged for app teams via External Secrets Operator)

**AI / ML**

- Bedrock with guardrails for fact-grounding
- Bedrock access via Pod Identity for k8s workloads
- Marketplace SCPs scoped to `Subscribe` + `ViewSubscriptions` only

**FinOps**

- AWS Cost Explorer + CUR 2.0
- AWS Compute Optimizer
- CloudZone partner for FinOps consultancy
- Infracost in MR pipeline (cost diff visible in MR comments)
- Basic support across all accounts (transitioned from paid plans Jul 2024)

---

## Kubernetes / GitOps

**ArgoCD**

- Deployed on dedicated `shared-staging-devops` + `shared-prod-devops` clusters
- ApplicationSets for multi-cluster fan-out
- App-of-apps + self-managing bootstrap
- Server-Side Diff enabled at controller level
- SSO via JumpCloud
- Webhook secret injected via External Secrets Operator
- 2 replicas in prod for HA
- Cross-account cluster onboarding via Pod Identity + AssumeRole (no bearer tokens)

**Helm**

- Single internal Helm chart: **monochart** (used by all 18+ services)
- Auto-generates HTTPRoutes for nginx-backed services (Gateway API migration support)
- Internal chart registry

**Service mesh / Gateway API** (in-flight at layoff)

- Istio **Ambient** (sidecar-less) — Phase 0/1/2.0/2.1/2.2 shipped
- Gateway API + HTTPRoute (replacing nginx Ingress)
- Cross-account TargetGroupBinding pattern (no NLB hop)

**Policy / governance**

- Kyverno (fleet-wide — auto-PDB policy on every workload, drift suppression for CRD cosmetic fields)
- ArgoCD `ignoreDifferences` for cosmetic drift suppression

**Addons (all ApplicationSet-managed)**

- aws-load-balancer-controller v3
- external-secrets
- external-dns (with Gateway API HTTPRoute source)
- cert-manager
- node-local-dns
- metrics-server
- VPA (admission controller + Kyverno-generated observation VPAs)
- Crossplane v2.5.3 (Upbound) — bootstrapped on devops clusters, S3 Composition shipped
- aws-ebs-csi-driver
- datadog-operator (dormant scaffolding)
- Istio Ambient
- Gateway API CRDs

---

## CI / CD — GitLab Premium

**Pipelines**

- `services-release` unified CI template (multi-language, designed and owned)
- `gitlab-ci-cd-components` repo (custom components — 100% authored)
- `ci-base-images` repo (node22, python, eks-deploy, multi-arch amd64+arm64)
- Helm-deploy failure root-cause detector in `after_script`
- Stable cache keys based on `package-lock.json` (fixed cross-tag cache misses)
- Skip on `.infra/`-only commits

**Runners** ([detailed architecture](/architecture/scale-to-zero-runners/))

- Self-hosted on EC2 (Zencity Group level)
- ARM64 (Graviton) + 100% Spot + ASG autoscaling
- Attribute-based instance selection (no fixed-type fragility)
- Per-instance 2-job reuse (amortises boot)
- AZ diversity
- Isolated S3 cache per runner
- Modern instance allowlist (Genoa / Intel SPR)

**Modern Terraform CI/CD** (Dec 2025)

- Flow: validate → Checkov → terraform plan-in-MR → Infracost → auto-apply on merge
- Result: **37% faster pipelines (8:52 → 5:36)** fleet-wide

**Security scanning**

- SAST · SCA · secret detection (gitleaks) · dockerfile-lint — wired in CI templates
- Trivy for container images
- Jit (DAST + scanner orchestration)

---

## IaC

**Terraform** — primary IaC

- Multi-account state with cross-account state-read patterns
- Modules in `zc-terraform-modules` (eks-addons, cdn-ingress-alb, gitlab-runner, etc.)
- Provider lifecycle (AWS provider 4.x → 5.x → 6.x upgrades)
- Custom dev tool: `tfmv` (state-move helper)

**Terragrunt** — for DRY environment configs

**Crossplane** — bootstrapped on shared devops clusters

- Upbound v2.5.3
- XR / Composition for managed RDS DB+user provisioning
- AppWorkloadBucket Composition with S3 versioning + lifecycle + CORS

---

## Observability

**Datadog** (primary)

- APM (Datadog Operator manages agents on EKS via ArgoCD)
- Log management
- Synthetics (with IP allowlist)
- AWS integration (forwarder + Datadog Operator)
- Custom monitors as code in Terraform
- SKUs: Ephemeral Infra + APM, Infra vCPU — renegotiated 2025

**Zenduty** — incident management (auto-assignment, severity routing, phone escalation)

**CloudWatch** — AWS-native services

**Pingdom** — synthetic checks (legacy)

**New Relic** — legacy, deprecating (Commonplace)

---

## Languages

| Language | Used for |
|---|---|
| **HCL** | Daily — Terraform & Terragrunt |
| **YAML** | Daily — Helm, ArgoCD, Kyverno, GitLab CI |
| **Bash** | Daily — runbooks, CI scripts, AMI build |
| **Python** | Operational scripts, audit tooling, MCP servers |
| **Go** | Read (cert-manager webhook, AWS LBC source spelunking) |
| **GraphQL** | Monday.com API integration |

---

## Notable patterns I established (or championed)

- **External Secrets Operator** for k8s secrets — devs keep using env vars unchanged
- **Transit Gateway as the only inter-VPC primitive** (no peering)
- **Pod Identity over IRSA** wherever possible
- **ArgoCD cluster onboarding via Pod Identity + AssumeRole** — no bearer tokens
- **Cross-account TargetGroupBinding** (AWS LBC v3) — no NLB hop
- **Monochart** as the single Helm chart everyone uses
- **Modern Terraform CI/CD** with security + cost gating in MR
- **GitLab runners on attribute-based Spot fleets** (no fixed-type ASG fragility)
- **Bottlerocket over AL2 / AL2023** for atomic updates + smaller attack surface
- **Kyverno auto-PDB policy** so no service ships without one
- **`before_compute = true` on EKS addons** so VPC CNI / kube-proxy / Pod Identity Agent install before node pools come up

---

## Version snapshot at layoff (May 14, 2026)

| Component | Version |
|---|---|
| EKS | 1.34 |
| Karpenter | 1.12.0 |
| Bottlerocket | 1.59 |
| AWS LBC | v3 (cross-account TGB capable) |
| Crossplane | v2.5.3 (Upbound) |
| AWS provider (Terraform) | 6.x |
| Terraform | 1.x stable |
| GitLab | Premium |
| ArgoCD | Server-Side Diff enabled |
