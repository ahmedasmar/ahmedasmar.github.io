---
title: EKS major-version upgrade — fleet playbook
description: How a 15-cluster, 4-region EKS fleet upgrades from one minor to the next in two working days. Ordering, prerequisites, gotchas.
---

> A playbook honed across six major Kubernetes versions (1.22 → 1.34) on roughly fifteen production EKS clusters in four AWS regions. The 1.33 → 1.34 iteration shipped in **two working days end-to-end**.

## TL;DR

Major-version EKS upgrades are mostly about *ordering*, not the version bump itself. The control-plane upgrade is one API call; the failure modes live in the addons, the node AMI, the IRSA / Pod-Identity wiring, and the GitOps applications that ride on top.

The shape that consistently works:

1. Bump the shared **Terraform modules** (Karpenter, Bottlerocket, addon versions) first; staging branch → staging clusters, master branch → prod clusters.
2. Apply the new module *to existing clusters* before bumping `cluster_version` so addons are pre-staged.
3. Bump GitOps (ArgoCD) component versions in a separate MR so app reconciliation stays in lockstep.
4. Bump `cluster_version` one cluster at a time; verify before promoting to the next.
5. Watch four things during each upgrade: node-rotation pace, PodDisruptionBudgets, addon health, ArgoCD application status.

## Why this is hard at fleet scale

Kubernetes deprecates APIs roughly every minor version. EKS deprecates *addons* on its own cadence, and AWS gives you ~14 months of "standard support" before a paid extended-support tier kicks in (which is meaningful money on a fleet). The pressure is constant; you have to keep moving.

A single-cluster upgrade is a 30-minute exercise. A fifteen-cluster, four-region, multi-account upgrade is a coordination problem. The work that scales it down to two days is *not* automation — it is making sure every cluster is shaped identically and every change rides the same shared module so a single MR moves the whole fleet.

## Prerequisites

Before opening any upgrade MR, confirm:

- **Shared module versions support the target k8s version.** For 1.34 specifically that meant Karpenter `>= 1.12.0` and Bottlerocket `>= 1.59`. Read the Karpenter release notes for breaking CRD changes; read Bottlerocket release notes for kernel / runtime changes.
- **All addons have a published version that supports the target.** Use `aws eks describe-addon-versions --kubernetes-version <target>` for VPC CNI, kube-proxy, EBS CSI, Pod Identity Agent, CoreDNS. If any addon doesn't have a `compatibleClusterVersions` entry that includes your target, you cannot upgrade yet.
- **ArgoCD-managed apps have their chart pins reviewed.** Anything pinned to a chart version that requires an older API group (`extensions/v1beta1`, `policy/v1beta1`, etc.) will silently break.
- **You know the cluster minimum capacity.** PDBs + `ALLOWED_DISRUPTIONS=0` is the single most common cause of a stuck node-group rotation.
- **`before_compute = true` is set on VPC CNI, kube-proxy, and Pod Identity Agent.** These three addons must reconcile before the first node joins; otherwise nodes come up without networking and the upgrade is in the "stuck" state from minute one.

## Step-by-step

### 1. Module bump — shared layer first

Bump Karpenter and Bottlerocket in your shared EKS addons Terraform module. Open MRs against the `staging` branch first; let them merge and propagate to staging clusters via your usual TF pipeline. Only then promote `staging` → `master` so prod clusters pick up the same versions.

```hcl
# eks-addons/variables.tf
variable "karpenter_version" {
  type    = string
  default = "1.12.0"   # was 1.8.3 for k8s 1.33
}

variable "bottlerocket_ami_version" {
  type    = string
  default = "1.59.0"   # was 1.55.0 for k8s 1.33
}
```

The reason you do this *before* `cluster_version` bumps: when you eventually bump the cluster, EKS will rotate node groups. You want the new Bottlerocket AMI and new Karpenter binary already promoted, not promoted-in-the-middle of a rolling upgrade.

### 2. Apply module changes to clusters without bumping the version

Run a prod-branch TF pipeline on each ops repo *before* touching `cluster_version`. This stages the new addon versions, new Karpenter binary, and new AMI in each cluster's state. The cluster keeps running on the old k8s version, but every supporting component is now where it needs to be for the version bump to succeed.

### 3. GitOps component bumps — separate MR

In your GitOps repo (the one that holds the ArgoCD ApplicationSets), open one MR per environment that bumps component versions for compatibility. Typical contents for a k8s 1.34 readiness MR:

- External Secrets Operator chart bump (matching the new CRD versions)
- **Kyverno** chart bump
- Metrics-server chart bump
- ArgoCD controller resource bumps (more on this below)
- Istio component bumps if you run a service mesh

Keep this separate from the cluster-version MR — if the upgrade rolls back, you don't want to revert chart versions too.

### 4. Bump `cluster_version` per cluster

Open per-cluster MRs in each product repo:

```hcl
# ops/<domain>/<region>/eks.tf
module "eks" {
  source          = "terraform-aws-modules/eks/aws"
  cluster_version = "1.34"   # was 1.33
  # ...
}
```

Merge them one cluster at a time. Use staging clusters as the canary. Watch the EKS console while the control plane upgrades (~10 minutes); watch Karpenter logs and the ArgoCD UI while node groups roll.

### 5. Verify each cluster before promoting

For each cluster, confirm:

- Control plane API returns the new minor version: `kubectl version --short`
- All managed addons report `ACTIVE` status: `aws eks list-addons --cluster-name <c>`
- All ArgoCD applications are `Synced` and `Healthy`
- All Karpenter NodePools have at least one ready node
- No pods stuck `Pending` or `CrashLoopBackOff`
- Datadog ingest still flowing (or your equivalent metrics pipeline)

Only then merge the next cluster's MR.

## Gotchas

These are the ones that bit me on real fleet upgrades. Build them into your pre-flight script.

**Kyverno PDB blocks managed node group eviction.** Kyverno admission and cleanup controllers each have 1 replica by default, with a PDB `minAvailable=1`. On a managed node group with no headroom, the EKS upgrade can't evict them — `ALLOWED_DISRUPTIONS` sits at 0 forever. *Fix*: scale both Kyverno deployments to 2 replicas before the upgrade pipeline runs. Karpenter-managed nodes don't hit this because they can simply provision more capacity.

**Kyverno CRD labels / annotations drift.** Kyverno's chart renders `labels: {}` / `annotations: {}` on CRDs; Kubernetes normalises them to `null` server-side; ArgoCD then shows permanent `OutOfSync`. *Fix*: broaden `ignoreDifferences` in the Kyverno ApplicationSet for `apiextensions.k8s.io/CustomResourceDefinition` at `/metadata/labels` and `/metadata/annotations`.

**ESO `nullBytePolicy` drift.** External Secrets Operator v2.4.x injects `nullBytePolicy: Ignore` on every `ExternalSecret`. If your GitOps source doesn't declare it, every reconcile shows drift. *Fix*: add `nullBytePolicy: Ignore` to every `remoteRef` in your ApplicationSet.

**ArgoCD controller OOMKill during large syncs.** The default 4 GiB limit on `argocd-application-controller` will OOM when many large chart upgrades land at once (typical of a fleet-wide module bump). *Fix*: pre-emptively bump it to 6 GiB in the ArgoCD ApplicationSet for prod before kicking off the upgrade.

**Terraform state lock after a runner crash mid-apply.** A runner that crashes during a long EKS module apply leaves a DynamoDB lock. *Fix*: re-`init` with the right backend config and `terraform force-unlock -force <LOCK_ID>`. Have the unlock command ready before you start.

**Previous-generation EC2 instances and NLB target groups.** AWS NLB target groups reject EC2 instance families older than gen-4. If Karpenter happens to provision an `m3.*`, every ingress flow that traverses an NLB breaks. *Fix*: pin Karpenter `NodePool` `requirements` to `karpenter.k8s.aws/instance-generation >= 5`. Do this once, fleet-wide.

**`before_compute = true` on three critical addons.** VPC CNI, kube-proxy, and Pod Identity Agent must finish reconciling before the first node attempts to join. If they don't, you get nodes that come up with no networking, no kube-proxy iptables rules, and no IAM credentials. Set this once in your `eks_managed_node_groups` / `aws_eks_addon` config; never untick it.

## Observability during the upgrade

Pre-open these in tabs before you merge the MR:

- AWS EKS console — control plane "Update history"
- Karpenter `NodeClaim` list — `kubectl get nodeclaim -A -w`
- ArgoCD UI filtered to the target cluster
- Datadog (or equivalent) Kubernetes Service Map for the cluster
- A `kubectl get events --all-namespaces --sort-by=.lastTimestamp` tail

You're looking for three signals: (1) the control plane completes within ~10 minutes, (2) nodes drain in a steady rhythm — not a stuck `evict ... waiting for PDB` loop, (3) ArgoCD applications return to `Synced/Healthy` within minutes of each node-rotation batch.

## Rollback considerations

EKS does not support control-plane downgrade. Once the control plane is on 1.34, you cannot revert to 1.33. Plan for *forward rollback*: if a workload fails on 1.34, you fix the workload or you replace the cluster.

That said, you *can* roll back addon versions and Karpenter versions if those become a problem after the control plane upgrade succeeds. Keep the previous shared-module commit in your back pocket — `git revert` of the module-bump MR followed by re-apply.

For each individual cluster, the rollback unit is the cluster itself, not the version. If a staging cluster takes the upgrade poorly, you do not promote to prod that day. The point of doing staging first is to make sure that decision is cheap.

## Cadence

The single biggest takeaway from doing this across a fleet for three years: keep the gap small. A fleet that's one minor behind upgrades in a day; a fleet that's three minors behind takes a sprint and surfaces every accumulated piece of tech debt at once. Run the upgrade as soon as the prerequisites (Karpenter, Bottlerocket, addons) catch up to the new minor — usually 4–8 weeks after the EKS release. **Do not wait for the deprecation email.**
