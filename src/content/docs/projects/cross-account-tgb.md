---
title: Cross-account TargetGroupBinding
description: The signature architecture pattern. ALB in one AWS account, EKS workload in another — no NLB hop. Validated on AWS LBC v3 and rolled to all 6 staging clusters in a single day.
---

> **The headline technical pattern I designed for a multi-account AWS estate.** It removes the NLB that normally sits between an ALB in one AWS account and EKS pods in a different account's cluster.

## The problem this solves

A common AWS-multi-account pattern: a **shared edge account** owns the public ALB / WAF / CloudFront — for governance, ACM cert lifecycle, audit boundaries. The **workload account** owns the EKS cluster running the pods.

You need traffic to go *ALB (account A) → pods (account B's EKS)* with TLS termination at the ALB, real client IPs, and zero per-request hops.

The textbook answer in 2023 was: **deploy an NLB in the workload account**, register the EKS Service against that NLB, and use it as a target type for the ALB in the edge account. That works, but:

- **One NLB per cluster × 16 clusters** = real money plus operational surface.
- **Two LBs in the data path** for every request.
- **Hairpin / SG complexity** because the NLB is in account B but the source is account A.

## The pattern

**AWS Load Balancer Controller v3** (Sep 2024+) supports `TargetGroupBinding` reconciliation where the **TargetGroup lives in the ALB's account** but the **TargetGroupBinding CRD lives in the workload cluster** and the **AWS LBC IAM role in the workload account assumes a role in the ALB account** to register pod IPs as targets.

Net result: **no NLB**. Pod IPs are registered directly into the cross-account ALB target group.

## What you have to thread

This is the non-trivial bit — and the reason this pattern took validation to land:

### 1. IAM trust between accounts

The AWS LBC's IAM role (in the workload account, attached via Pod Identity) needs `sts:AssumeRole` permission on a role in the ALB account. That role in the ALB account needs `elasticloadbalancing:RegisterTargets` / `DeregisterTargets` / `DescribeTargetHealth` on the specific target group(s).

### 2. AWS LBC `--aws-region` and `--cluster-name`

The controller has to be told it can assume into another account. We added the assume-role config via Pod Identity association — no IRSA OIDC fan-out across accounts needed.

### 3. Security groups across accounts

The ALB account's ALB SG needs egress to the workload account's pod IP range. With Transit Gateway-only routing (no peering), the SG references can't be cross-account directly — you reference *CIDRs*, and you authorise the ALB SG egress to the workload VPC CIDR(s).

### 4. Health-check loops

Without care, the ALB health-check probes can race the pod readiness gate and produce flapping target registration. The fix: register pods with the AWS LBC pod readiness gate enabled, so the pod isn't considered Ready until the ALB target health is `healthy`. Side benefit: rolling deploys are now health-aware end-to-end.

## Visual

```
┌──────────────────────────────────┐         ┌──────────────────────────────────┐
│  Edge AWS account                │         │  Workload AWS account             │
│                                  │         │                                   │
│   ALB ──► TargetGroup (TG)       │   AssumeRole   │   EKS cluster              │
│           │                      │ ◄────────────  │     │                      │
│           │                      │                │     ▼                      │
│           │                      │                │   AWS LBC pod (Pod Identity)
│           │                      │                │     │                      │
│           ▼                      │                │     ▼  (TargetGroupBinding)
│   Targets: pod IPs (cross-acct)  │                │   App Service              │
│           ▲                      │                │     │                      │
│           │ Pod IP registration  │                │     ▼                      │
│           └──────────────────────┘                │   App pods (registered as  │
│                                                   │     targets in the edge TG)
│  No NLB anywhere in the data path.                │                            │
└───────────────────────────────────────────────────┴────────────────────────────┘
```

## Result

- **Validated end-to-end on a pilot cluster** ↔ shared-edge account.
- **Rolled to all six staging clusters in a single day** after the pilot.
- Became the upstream enabler for the Gateway API + Istio Ambient migration — Gateway API HTTPRoutes target the cross-account TG without a per-cluster NLB.

## Why it matters

This is a **structural** simplification, not a tuning win. Removing the NLB removes:

- one LB's worth of cost per cluster, every month
- one set of health-check tunings
- one place where TLS / connection-draining behaviour can disagree with the ALB

And it's the kind of architecture call that depends on knowing AWS LBC v3 capabilities the day they ship — not "we'll evaluate next quarter."

## Related

- [Cross-account TGB architecture walkthrough](/writing/cross-account-tgb/) — design deep-dive with the IAM + SG topology
- [GitHub: AWS Load Balancer Controller](https://github.com/kubernetes-sigs/aws-load-balancer-controller) — the upstream project this builds on
