---
title: EKS Pod Identity — fleet rollout
description: Replacing IRSA with Pod Identity across 10 production + 5 staging EKS clusters in two days. When to choose it, the cross-account variant, and the ordering that matters.
---

> Rolled across all 10 production clusters and 5 staging clusters in May 2026. The fleet-wide rollout took two days; the design work that made it two days took longer.

## TL;DR

EKS Pod Identity is the modern replacement for IRSA. Where IRSA stitched IAM-to-pod through a magic OIDC trust policy on every role plus a Service Account annotation, Pod Identity introduces a managed addon (the Pod Identity Agent) and a first-class `aws_eks_pod_identity_association` API. The role's trust policy becomes a normal `pods.eks.amazonaws.com` principal trust; no more OIDC issuer URLs hard-coded into every role; no more per-cluster role recreation when the OIDC provider rotates; cross-account use is a clean `sts:AssumeRole` instead of a hand-rolled token-exchange.

## Why Pod Identity over IRSA

Both work. The difference is operational:

| Concern | IRSA | Pod Identity |
|---|---|---|
| Trust policy | Per-cluster OIDC provider ARN baked into the role | Generic `pods.eks.amazonaws.com` principal |
| Role reuse across clusters | One role per (cluster × workload) | One role can be associated to many clusters |
| Cluster rebuild | Trust policies must be re-authored against the new OIDC issuer | No-op; associations are created against the new cluster |
| Token delivery | Service Account annotation + projected token volume | DaemonSet agent, no annotation required |
| Cross-account | OIDC federation; sometimes needs explicit OIDC-provider-in-target-account | Normal `sts:AssumeRole` chain |
| Visibility | Federated identities mixed with users in CloudTrail | Distinct event source, easier to query |

For a fleet with many short-lived clusters, the cluster-rebuild story alone is worth the migration. For new workloads, there is no reason to start on IRSA in 2026.

Existing IRSA workloads, though, can stay on IRSA indefinitely. They coexist with Pod Identity on the same cluster. Don't migrate working IRSA workloads for the sake of consistency — migrate them when you're touching the role anyway.

## Prerequisites

- **EKS 1.24+** (Pod Identity Agent supports this and newer)
- **The Pod Identity Agent installed as a managed addon** on every cluster, with `before_compute = true`
- **A Terraform module pattern.** I used `terraform-aws-modules/eks-pod-identity/aws ~> 2.8` — one module call per (cluster, workload) pair
- **A naming convention for associations.** `<cluster>-<namespace>-<sa>` so the association name is greppable across a multi-account audit

## Install the Pod Identity Agent on every cluster

The agent is an EKS managed addon. The single most important detail is the ordering flag:

```hcl
resource "aws_eks_addon" "pod_identity_agent" {
  cluster_name                = module.eks.cluster_name
  addon_name                  = "eks-pod-identity-agent"
  addon_version               = data.aws_eks_addon_version.pod_identity_agent.version
  resolve_conflicts_on_update = "OVERWRITE"
  before_compute              = true
}
```

`before_compute = true` means the addon reconciles before the first node joins. The same flag belongs on `vpc-cni`, `kube-proxy`, and (transitively) `eks-pod-identity-agent`. Without it, you'll get a window where pods scheduling on a brand-new node fail their first AWS API call because the agent hasn't started yet.

## Migrate AWS Load Balancer Controller — the canary

AWS LBC is the right first workload to migrate because (a) it's already deployed everywhere, (b) it has a well-documented IAM policy, (c) it touches every cluster's data plane, so getting it right validates the pattern for everything else.

```hcl
module "lbc_pod_identity" {
  source  = "terraform-aws-modules/eks-pod-identity/aws"
  version = "~> 2.8"

  name = "${module.eks.cluster_name}-aws-lbc"

  attach_aws_lb_controller_policy = true

  associations = {
    cluster = {
      cluster_name    = module.eks.cluster_name
      namespace       = "kube-system"
      service_account = "aws-load-balancer-controller"
    }
  }
}
```

In the AWS LBC Helm values, remove the `serviceAccount.annotations` IRSA stanza. The agent injects credentials transparently; the Service Account doesn't need to know about IAM at all. AWS LBC v3 explicitly supports the Pod-Identity-without-SA-annotation pattern — **required for the cross-account TargetGroupBinding flow.**

## ApplicationSet pattern for fleet rollout

If you're managing Pod Identity associations *for ArgoCD-managed workloads* via Terraform, you've got a layering problem: the Terraform module creates the IAM role and association, but the workload's Service Account is created by ArgoCD. They land in the cluster at different times.

The pattern that scales:

1. Define a `pod-identity-associations` module that takes a list of `(namespace, service_account, policy_arns)` tuples per cluster
2. The module creates the IAM role + association by name. It does *not* create the Service Account
3. The ArgoCD application (or ApplicationSet) creates the namespace and Service Account
4. The Pod Identity Agent matches by `(cluster, namespace, service_account)` — order of creation doesn't matter for credential delivery

This means you can `terraform apply` the association *before* the workload exists in the cluster; when the workload eventually comes up, credentials work immediately.

## Cross-account Pod Identity

The Pod Identity Agent gives a pod credentials for *one* role in the *same* account as the cluster. To use a role in *another* account (e.g., a Bedrock role that lives in a centralised AI account, while the workload runs on a product-team cluster), chain it:

1. Local role (created via `aws_eks_pod_identity_association` in the cluster's account) is the pod's effective identity
2. Target role (in the other account) trusts the local role's ARN via a normal `sts:AssumeRole` trust policy
3. The application code (or the SDK with the right configuration) calls `sts:AssumeRole` to obtain target-account credentials

This is how I wired Bedrock access for an AI workload running in a product-team EKS while the Bedrock role lived in a separate AI account. The trust policy on the target role:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::<PRODUCT_ACCT>:role/grand-central-pod-identity"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

The local role's permissions just need `sts:AssumeRole` on the target ARN. This is the canonical cross-account pattern; it replaces the IRSA-cross-account dance of trusting a different account's OIDC provider, which is technically possible but operationally fragile.

## Addon migration order

After AWS LBC, the order I've found works:

1. **AWS LBC** — already covered
2. **External Secrets Operator** — high-value, touches every namespace
3. **External-DNS** — small blast radius, good test of cross-account assume (if your Route 53 lives in a networking account)
4. **Cluster Autoscaler / Karpenter** — sensitive; do this after you trust the pattern
5. **App workloads** — only when you're touching the workload anyway

## Gotchas

**`before_compute = true` is non-optional.** If the agent isn't up when the first node joins, every pod's first AWS call fails. On boot-critical pods (Karpenter, AWS LBC), that means the cluster comes up "broken" and recovers minutes later when you notice.

**Don't put the SA annotation on a Pod-Identity workload.** It doesn't hurt for most charts, but for AWS LBC v3 specifically, the cross-account TargetGroupBinding flow expects no SA annotation. Leaving an IRSA annotation behind makes the LBC try to use the IRSA token instead of the Pod Identity-injected one.

**One association per (cluster, namespace, SA).** Trying to associate two roles to the same Service Account silently picks one and you can't easily tell which. Use a single role with the union of permissions, or split into two Service Accounts.

**Cross-account chains add a token-exchange call.** The pod's effective credentials are still the *local* role; every cross-account call costs an additional `sts:AssumeRole`. STS is cheap, but be aware for high-RPS workloads.

**Associations are eventually consistent.** Creating an association via Terraform is a single API call, but propagation to the agent on a busy cluster has been observed in the 10–30 second range. The SDK retry defaults usually handle this.

**`aws_eks_pod_identity_association` is idempotent but order-sensitive on rebuild.** If you ever destroy and recreate a cluster, the associations must be recreated against the new cluster ARN. Build a TF dependency from the association resource to `aws_eks_cluster` so destroy-then-create works cleanly.

## Validation

Per cluster, after rollout:

```bash
# Agent DaemonSet healthy on every node
kubectl -n kube-system get ds eks-pod-identity-agent
# Expect: DESIRED == READY == UP-TO-DATE

# Workload pods successfully receiving credentials
kubectl exec -n <ns> <pod> -- env | grep AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE
# Expect: env var set to /var/run/secrets/pods.eks.amazonaws.com/serviceaccount/eks-pod-identity-token

# Workload's AWS API calls succeed
kubectl logs -n kube-system aws-load-balancer-controller-...
# Expect: no AccessDenied errors after pod restart
```

CloudTrail filter for any cluster:

```
eventSource = "sts.amazonaws.com" AND eventName = "AssumeRoleWithIdentity"
```

Pod Identity-issued credentials show up as a distinct CloudTrail event from IRSA's `AssumeRoleWithWebIdentity` — useful for audit and for confirming traffic has actually cut over.

## Cadence

This is one of the few platform migrations where there's no rush *and* no penalty for going slow. New workloads on Pod Identity, existing workloads stay on IRSA, opportunistic migration when you're touching the role anyway. Within 6–12 months, the IRSA footprint will be small enough to do a closeout sprint. **Don't make this a forced march.**
