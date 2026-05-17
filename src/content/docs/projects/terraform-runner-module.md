---
title: Terraform GitLab Runner module
description: A scale-to-zero GitLab Runner platform on AWS — 3,767 downloads on the Terraform Registry. Self-authored, 2 years of maintenance, GPL-3.0.
---

> [github.com/ahmedasmar/terraform-aws-gitlab-docker-autoscaler-runner](https://github.com/ahmedasmar/terraform-aws-gitlab-docker-autoscaler-runner) ·
> [registry.terraform.io](https://registry.terraform.io/modules/ahmedasmar/gitlab-docker-autoscaler-runner/aws)
>
> **3,767 downloads · v0.6.8 · 2 years of maintenance · GPL-3.0**

A Terraform module for deploying GitLab Runner with the new **Docker Autoscaler executor** on AWS. The module that powers a SaaS-scale self-service GitLab runner fleet I built in production — and that 3,767 downloads says other organisations had the same problem.

## Why this exists

The default GitLab Runner auto-scaling story — `docker-machine` — was deprecated in 2023 and was always operationally fragile:

- per-job EC2 launch latency (jobs wait minutes for a runner to boot)
- Spot interruption mid-launch left orphaned instances
- complex IAM and Docker-in-Docker behavior
- single-instance-type ASGs caused `UnfulfillableCapacity` when one type was scarce

The **Docker Autoscaler executor** + **AWS Fleeting plugin** is the modern AWS-native answer. But in early 2024 there was no off-the-shelf Terraform option that captured the production knobs. I authored one — and have maintained it for 2 years.

## Design choices

### Literal scale-to-zero

```hcl
asg_min_size           = 0
asg_desired_capacity   = 0
on_demand_base_capacity                    = 0
on_demand_percentage_above_base_capacity   = 0
```

ASG sits at zero between jobs. A CI workload arrives → runner manager triggers scale-up → job runs → ASG scales back to zero. **No idle cost between jobs.**

### Attribute-based instance selection (not fixed types)

```hcl
use_attribute_based_instance_selection = true   # default
vcpu_count_min                          = 2
vcpu_count_max                          = 4
memory_mib_min                          = 8192
memory_mib_max                          = 16384
allowed_instance_types                  = ["c*", "m*", "r*"]
instance_generations                    = ["current"]
local_storage_types                     = ["ssd"]
```

You declare *requirements* (vCPU + memory + architecture). AWS selects from the full pool of matching instance types at launch. Result:

- **Higher Spot availability** — larger capacity pool than a single-type ASG
- **Lower interruption rates** — AWS can shift to whichever pool has slack
- **Better pricing** — accesses the cheapest matching type at launch time

T-series is excluded by default (no CPU throttling). Latest generation only. SSD local storage only.

### Spot allocation strategy: `price-capacity-optimized`

AWS's recommended strategy for production Spot workloads. Balances price against pool capacity — preferred over `lowest-price` (which interrupts more) or `capacity-optimized` (which costs more).

### `capacity_rebalance = false` — deliberate

If `capacity_rebalance = true`, the ASG proactively replaces instances AWS forecasts will be interrupted soon. **For CI runners this is wrong** — it surfaces as "instance unexpectedly removed" mid-job failures. I want the running job to finish; Spot interruption notices handle the next-job-onwards case.

### `protect_from_scale_in = true`

Graceful drain pattern. The ASG can't externally terminate a runner that's still working a job.

### Multi-arch via `cpu_manufacturers`

```hcl
cpu_manufacturers = ["intel", "amd", "amazon-web-services"]
```

x86_64 *and* ARM64 (Graviton) from the same module. In production, the runner fleet ran ARM64 Graviton for ~25% cost reduction over equivalent x86 with no perf regression on CI loads.

### S3 cache with configurable lifecycle

```hcl
enable_s3_cache           = true
s3_cache_expiration_days  = 30
```

Per-runner-pool S3 bucket so cache doesn't bleed across project groups. Lifecycle policy keeps cost bounded.

### IAM hygiene

Manager EC2 has its own IAM role + instance profile. Workers can be granted assume-role across accounts for jobs that need to touch other AWS environments. No long-lived static keys anywhere.

### Bundled Packer AMI builder

`docker-ami.pkr.hcl` builds custom base AMIs with Docker pre-installed — so the runner doesn't pay cold-start cost installing Docker on every boot.

## What it looks like to consumers

```hcl
module "gitlab_runner" {
  source  = "ahmedasmar/gitlab-docker-autoscaler-runner/aws"
  version = "~> 0.6"

  auth_token   = var.gitlab_runner_token
  asg_max_size = 10
  asg_subnets  = ["subnet-xxx", "subnet-yyy"]

  cpu_manufacturers       = ["amazon-web-services"]   # ARM64 / Graviton
  memory_mib_min          = 8192
  memory_mib_max          = 16384

  tags = { Environment = "production" }
}
```

Five required-ish variables; everything else is opinionated defaults that match production Spot best practices.

## Track record

- **Created Feb 25, 2024** · **Latest v0.6.8 — Jan 15, 2026** · **GPL-3.0**
- **3,767 downloads** on the Terraform Registry (adoption well beyond the original use case)
- **2 years of maintenance** — provider compatibility (AWS provider 4.x → 5.x → 6.x), Spot allocation strategy upgrades, lifecycle filter syntax migration
- Real production workhorse — powers a SaaS-scale CI fleet (compute-optimised + memory-optimised pools, multi-arch, multi-account)

## Related

- [Scale-to-zero runner architecture deep-dive](/writing/scale-to-zero-runners/) — design walkthrough
- [GitHub: terraform-aws-gitlab-docker-autoscaler-runner](https://github.com/ahmedasmar/terraform-aws-gitlab-docker-autoscaler-runner)
- [Terraform Registry](https://registry.terraform.io/modules/ahmedasmar/gitlab-docker-autoscaler-runner/aws)
