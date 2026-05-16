---
title: GitOps engine — Terraform → ArgoCD
description: 3-month epic standing up dedicated ArgoCD devops clusters, ApplicationSet multi-cluster fan-out, and cross-account cluster onboarding via Pod Identity + AssumeRole.
---

> **Feb 17 – May 13, 2026 · 299 commits · ~70% of `zc-gitops` authored.** Migrated EKS addon management off Terraform `helm_release` onto ArgoCD ApplicationSets. Self-managing app-of-apps bootstrap. Cluster onboarding **without bearer tokens**.

## The brief

Zencity ran a fleet of ~20 EKS clusters whose addons (cert-manager, external-secrets, external-dns, AWS LBC, metrics-server, Kyverno, datadog-operator, node-local-dns, ...) were all managed by `terraform apply` against Helm. That works at low cluster count. At 16+ clusters across 4 regions, it gives you:

- **State explosion** — each addon × each cluster × each region = its own `helm_release` block + state
- **Drift between clusters** — the version of `external-secrets` in `engage-staging` doesn't always match `platform-staging`
- **Slow rollouts** — bumping an addon version means `terraform plan` + `apply` per cluster, sequentially
- **No real reconciliation loop** — manual drift becomes silent until you next run plan

The fix: **ArgoCD ApplicationSets**, where one ApplicationSet declares an addon and the Generator fans it out to every cluster in the fleet automatically.

## What I built

### Dedicated devops clusters

Stood up `shared-staging-devops` and `shared-prod-devops` — purpose-built EKS clusters that run the ArgoCD controllers (and only the ArgoCD controllers + supporting infra). This isolates the **GitOps engine** from the workload clusters it manages:

- workload-cluster outage doesn't take down the controller
- the engine cluster has its own upgrade cadence
- secrets / RBAC / SSO live in one place

### Cross-account cluster onboarding without bearer tokens

The default `argocd cluster add` flow creates a ServiceAccount in the target cluster, generates a bearer-token Secret, and stores it in ArgoCD. This is operationally bad: tokens don't rotate, they're long-lived, and they're cluster-bound credentials living in another cluster.

I designed the onboarding to use **AWS-native auth instead**:

1. ArgoCD pod in `shared-staging-devops` runs with a **Pod Identity** association.
2. That role has `sts:AssumeRole` on a role in each target workload account.
3. Target account role has an **EKS Access Entry** mapped to a cluster-admin (or namespace-scoped) Kubernetes role.
4. ArgoCD adds the target cluster with the AssumeRole config — **no bearer token written anywhere.**

I packaged this as a [Claude Code skill](/projects/devops-claude-skills/#) (`argocd-eks-cluster-onboard`) so it's repeatable end-to-end.

### ApplicationSet pattern

For each addon — cert-manager, external-secrets, external-dns, AWS LBC, gateway-api-CRDs, node-local-dns, metrics-server, Kyverno, datadog-operator (dormant), cluster-autoscaler — one ApplicationSet with a cluster-list / git-files Generator. New cluster shows up in the Generator → all addons appear automatically.

### Server-Side Diff at the controller level

ArgoCD's classic Diff strategy compares full manifests, which causes spurious `OutOfSync` on CRD-managed fields (admission-webhook injected annotations, controller-managed labels). I enabled **Server-Side Diff** at the controller level — defers diffing to the API server's strategic-merge-patch logic, eliminates the noise, and is the [upstream-recommended](https://argo-cd.readthedocs.io/en/stable/user-guide/diffing/) default going forward.

### Self-managing ArgoCD (app-of-apps bootstrap)

ArgoCD manages its own deployment via an Application pointing at the same Git repo. The Terraform import block used for the very first apply was removed after the first reconcile — from that point onward, **the platform reconciles its own desired state**.

### Webhook HA + cert-rotation race fix

Two-replica webhook in prod (HA against pod restarts during cert rotations). Patched a cert-manager / webhook race that caused webhook 5xx during certificate rotations — pinned `cert-manager` Application sync wave so the cert is renewed before the webhook reload.

## Numbers

| Metric | Number |
|---|---|
| Epic duration | **3 months** (Feb 17 → May 13, 2026) |
| Commits in those 3 months | **299** (29 Feb, 15 Mar, 124 Apr, 131 May) |
| `zc-gitops` authorship | **70% of all-branch commits** (66% on main) |
| ApplicationSets shipped | **44 commits referencing ApplicationSets** Mar 25 → May 13 |
| Bootstrap pattern | Self-managing app-of-apps; Terraform import removed |
| Addons remaining on Terraform Helm | Only `karpenter` + (deprecating) `nginx-ingress` |

## Where it landed

By layoff, only `karpenter` and the deprecating `nginx-ingress` remained on Terraform-managed Helm. Every other EKS addon is reconciled by ArgoCD ApplicationSets from `zc-gitops`. The migration is effectively complete.

## Related

- [GitOps engine architecture walkthrough](/writing/gitops-engine/) — design + bootstrap deep-dive
- [Cross-account TargetGroupBinding](/projects/cross-account-tgb/) — depends on the workload-cluster AWS LBC also being ArgoCD-managed
- [DevOps Claude Skills](/projects/devops-claude-skills/) — `argocd-eks-cluster-onboard` skill packages the cluster registration flow
