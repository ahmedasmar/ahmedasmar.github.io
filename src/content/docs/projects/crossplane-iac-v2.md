---
title: Crossplane — IaC v2 bootstrap
description: Crossplane v2.5.3 (Upbound) on the shared devops clusters. AppWorkloadBucket Composition with S3 versioning + lifecycle + CORS. The first step toward declarative cloud resources reconciled by Kubernetes controllers instead of `terraform apply`.
---

> **Q2 2026 · ~3 weeks of focused work.** Crossplane v2.5.3 (Upbound) bootstrapped on dedicated staging and prod devops clusters in Pipeline mode. The first usable Composition — `AppWorkloadBucket` for managed S3 buckets — shipped to prod. The IaC-v2 vision: declarative AWS resources reconciled by k8s controllers instead of `terraform apply`.

## The brief

Terraform is great at provisioning, but the gap is *reconciliation*. Once an `aws_s3_bucket` resource lands in state, Terraform doesn't watch it; if someone adjusts the lifecycle policy in the console, Terraform doesn't know until the next plan. The cloud-controller pattern — a Kubernetes controller continuously reconciling a CR against the cloud API — is structurally better for stateful infra that drifts.

**Crossplane** is the most mature implementation. Define an `XR` (Composite Resource) schema; write a `Composition` that maps the XR to one or more provider resources; the provider reconciles against AWS. The platform team's interface becomes "create this XR" — typed, namespaced, ArgoCD-managed — instead of "open a Terraform PR and wait."

## What I shipped

### Bootstrap to prod

Crossplane v2.5.3 (Upbound) installed on both **staging and prod devops clusters**. Pipeline mode — the modern function-based composition flow. Webhook scaled to **2 replicas in prod** for HA. Provider pods sized with `requests == limits` for predictable footprint (uniform-pressure scheduling — important when Karpenter is deciding what to bin-pack).

### Schema alignment with Upbound provider-aws v2.5.3

Provider AWS v2.5.3 ships new managed-resource CRD shapes; existing Compositions need to align with the new schema. Non-trivial migration:

- `XRD` scope flipped from `Namespaced` to `Cluster` — for resources that don't have a natural namespace owner
- Used `serviceAccountTemplate` instead of `deploymentTemplate` for the function-pipeline service-account name
- Updated all `Composition` patches to the new field paths

### The first usable Composition — `AppWorkloadBucket`

This is the proof point. An `AppWorkloadBucket` XR is a typed, opinionated S3 bucket:

```yaml
apiVersion: storage.platform.io/v1alpha1
kind: AppWorkloadBucket
metadata:
  name: my-service-uploads
spec:
  region: us-east-1
  retentionDays: 30
  cors:
    enabled: true
    allowedOrigins: ["https://app.example.com"]
```

The Composition expands that into a `Bucket`, a `BucketVersioning` (enabled), a `BucketLifecycleConfiguration` with the retention policy, a `BucketCORSConfiguration`, and the IAM policy that wires the workload's Pod Identity role to it.

Three subtle fixes that took the Composition from "demo" to "actually works":

- **Correct S3 IAM action names for CORS + Lifecycle** — the AWS Lifecycle/CORS APIs use action names that don't match what the provider docs suggest verbatim; Composition output had to be hand-validated against an actual `BucketCORSConfiguration` apply.
- **Wire up bucket versioning + lifecycle in `AppWorkloadBucket`** — versioning and lifecycle are separate resources in the AWS provider, each with their own readiness signals; the Composition's `ReadinessCheck` had to wait on the conjunction.
- **Scale webhook to 2 replicas in prod** — Crossplane's webhook is the gate for every XR reconcile; one replica in prod is a single point of failure during pod restarts.

## Why this matters

The IaC-v2 vision (and the reason this got built before going to scope-out) is to give app teams a **typed Kubernetes interface** to the cloud resources they need. No Terraform PR cycle for a new bucket; no `terraform state import` when the structure changes; the same ArgoCD that reconciles their Deployments now reconciles their cloud resources.

It's also the right abstraction for **multi-tenant** patterns. An `AppWorkloadDatabase` Composition can encode "every product team's RDS instance is multi-AZ, has IAM authentication, has automated snapshots, is rightsized via a pre-baked instance class catalogue" without each team having to know Terraform.

## Current state

- **Bootstrap shipped to prod** ✓
- **AppWorkloadBucket Composition real and usable** ✓
- **Broader scope-out paused** — was queued: `AppWorkloadDatabase` (managed RDS DB + user provisioning), `AppWorkloadCache` (ElastiCache Redis), then app-team self-service via these XRs

The IaC-v2 vision was mine. The bootstrap shipped. The scope-out is the unfinished work — but the platform foundation is in place.

## Related

- [Stack reference — Crossplane section](/stack/#iac)
- [Crossplane docs](https://docs.crossplane.io/)
- [Upbound provider-aws](https://github.com/upbound/provider-aws)
