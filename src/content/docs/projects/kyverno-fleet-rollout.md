---
title: Kyverno fleet rollout — policy-as-code on every cluster
description: Auto-PDB ClusterPolicy on every workload, observation-VPA generation, and CRD drift suppression — Kyverno shipped fleet-wide across every staging and prod EKS cluster.
---

> **Sep 18, 2025 — initial fleet-wide rollout.** **Apr–May 2026 — migration to ArgoCD-managed Kyverno + policy expansion.** Kyverno is the policy engine that catches "no PDB on this Deployment" *and* the engine that generates VPAs.

## The brief

Most platforms ship `kubectl apply` policy as an afterthought: someone writes a checklist; engineers forget; production has services with no PodDisruptionBudgets, no resource requests, no liveness probes. The right answer is to encode the policy and let the cluster enforce it.

I rolled **Kyverno** fleet-wide on **Sep 18, 2025** — announcement to `#rnd-devops`, every EKS cluster. By May 2026 the policy set had grown to include VPA generation, CRD drift suppression, and migrated from Terraform-managed Helm onto ArgoCD ApplicationSets.

## What it enforces

### Auto-generated PodDisruptionBudgets

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: generate-pdb
spec:
  generateExisting: true
  rules:
    - name: generate-pdb-for-deployment
      match:
        any:
          - resources:
              kinds: [Deployment]
      preconditions:
        all:
          - key: "{{ request.object.spec.replicas || `1` }}"
            operator: GreaterThan
            value: 1
      generate:
        apiVersion: policy/v1
        kind: PodDisruptionBudget
        name: "{{ request.object.metadata.name }}-pdb"
        namespace: "{{ request.object.metadata.namespace }}"
        synchronize: true
        data:
          spec:
            minAvailable: 1
            selector:
              matchLabels: "{{ request.object.spec.selector.matchLabels }}"
```

Every multi-replica Deployment that ships without a PDB gets one auto-generated. Eliminated the "we forgot to add a PDB" class of incident across the fleet.

### Generated observation VPAs — the Kyverno × VPA tie-in

This is the more interesting policy. Every Deployment **and** StatefulSet across the fleet gets an `auto-generated observation-mode VPA` so we have right-sizing data without having to author per-workload VPAs.

The design call was to split the rule by kind rather than have one rule mutate both `Deployment` and `StatefulSet`:

```yaml
rules:
  - name: generate-vpa-for-deployment
    match: { any: [{ resources: { kinds: [Deployment] } }] }
    generate: { apiVersion: autoscaling.k8s.io/v1, kind: VerticalPodAutoscaler, ... }

  - name: generate-vpa-for-statefulset   # <-- separate rule
    match: { any: [{ resources: { kinds: [StatefulSet] } }] }
    generate: { apiVersion: autoscaling.k8s.io/v1, kind: VerticalPodAutoscaler, ... }
```

Why two rules instead of one mutating the kind selector? Cleaner, fewer side effects when the controller reconciles, easier to disable per-kind if we hit a regression. The merged-rule version *worked* but it was harder to reason about during the upgrade cycle.

### CRD drift suppression

Kyverno's chart renders `labels: {}` / `annotations: {}` on its CRDs; Kubernetes normalises them to `null` server-side; ArgoCD then shows a permanent `OutOfSync` for the CRD. Fix: broaden `ignoreDifferences` in the Kyverno ApplicationSet for `apiextensions.k8s.io/CustomResourceDefinition` at `/metadata/labels` and `/metadata/annotations`. This is the kind of operational detail that's two lines of YAML and saves you from chasing phantom drift for a week.

## How it's deployed

After the initial Sep 2025 fleet-wide rollout (via Terraform Helm), Kyverno was migrated to an ArgoCD ApplicationSet in April–May 2026. The ApplicationSet fans Kyverno to every workload cluster from a single Helm chart in Git; new clusters get Kyverno automatically.

Webhook HA — 2 replicas in prod for resilience against pod restarts during cert rotations. (The cert-manager / webhook race is its own gotcha; pin the `cert-manager` Application sync wave so the cert is renewed before the webhook reload.)

## Operational notes

- **PDB on Kyverno itself.** Kyverno's admission and cleanup controllers each ship with 1 replica + a PDB `minAvailable=1`. On a managed node group with no headroom, an EKS upgrade can't evict them. Scale both to 2 replicas before upgrade pipelines run. ([Full gotcha walk-through in the EKS upgrade playbook.](/writing/eks-major-version-upgrade/))
- **Policy reports vs admission webhook.** I run policies in `audit` mode for the first week per fleet, then promote to `enforce` once the policy reports show no surprises.
- **The generated-VPA pattern is the link.** This is where Kyverno earns its keep beyond "validation engine" — it becomes the **resource generation engine** for the policy domain. Every workload gets a sidecar policy artifact (PDB, VPA) without any author-side opt-in.

## Related

- **["Automating Pod Disruption Budgets with Kyverno"](https://medium.com/zencity-engineering/automating-pod-disruption-budgets-with-kyverno-0a6bee7bbcca)** — my Zencity Engineering article (Dec 2, 2025) on the auto-PDB ClusterPolicy and why it matters when Karpenter consolidates nodes
- [EKS major-version upgrade playbook](/writing/eks-major-version-upgrade/) — the Kyverno PDB gotcha during upgrades
- [GitOps engine — Terraform → ArgoCD](/writing/gitops-engine/) — the ApplicationSet pattern Kyverno migrated onto
- [Kyverno docs](https://kyverno.io/)
