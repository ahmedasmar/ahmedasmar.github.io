---
title: About
description: Ahmad Asmar — Staff DevOps / Platform Lead. 3 years building Zencity's AWS-native platform. CKA. Open-source maintainer.
---

## Who I am

I'm a **Staff DevOps / Platform Lead** with 3 years of end-to-end ownership of a SaaS-scale AWS platform — built from a hybrid Azure+AWS estate into a 20-account, 4-region, 20-EKS-cluster AWS-native platform serving 25+ microservices to 16+ named government customers across the US and UK.

I was the **sole DevOps engineer at Zencity for the first 18 months** (May 2023 → Nov 2024), then continued as the primary IC + de-facto platform owner for the next 18. When my eventual Team Lead joined, the meeting titles tell the story: *"Ahmad / Roey — Jira tasks"*, *"Ahmad / Roey — Datadog APM"* — I was onboarding *him* onto the stack I'd built.

## What I work on

The shape of my work the last 3 years:

- **Multi-account AWS at scale** — 20 SSO-managed accounts, Transit Gateway-only routing, IAM Identity Center via JumpCloud, SCPs for guardrails
- **EKS as a platform** — 20 clusters, Bottlerocket, Karpenter, Pod Identity, fleet-wide upgrades through 6 k8s versions with zero rollback commits
- **GitOps engine** — Terraform → ArgoCD migration, ApplicationSet multi-cluster fan-out, dedicated devops clusters, cross-account cluster onboarding without bearer tokens
- **CI/CD platform** — `services-release` unified template, self-hosted Spot runner fleet (open-sourced as a Terraform module), Modern Terraform CI/CD with 37% pipeline speedup
- **Service mesh + Gateway API migration** — designed 12-phase Istio Ambient rollout, shipped 5 phases to all staging clusters in a 2-week sprint, validated cross-account TargetGroupBinding pattern that removes NLB hop
- **FinOps** — data-driven sizing decisions, Graviton migrations, Spot fleets, gp3 / gp2 transitions, vendor renegotiation (Datadog SKU restructure)
- **Compliance / security** — SOC 2 2025 (full engineering auditee scope), ISO 27001 lead responder, TanStack supply-chain attack audit (11 repos cleared in hours), WAF tuning, fleet-wide Kyverno policy
- **Open source** — Terraform Registry module (3,767 downloads), 158★ Claude Code skills marketplace

## Style

- **Primary-source bias.** I trust `git log`, AWS API responses, and `kubectl get` over what a doc says it should be. The hardest production problems are always the ones where the doc and reality disagree.
- **Validated rollouts.** New patterns get piloted on `lab-staging` first. Then one staging cluster. Then the rest. Then prod. Each step proves the next. ([Cross-account TGB](/projects/cross-account-tgb/) shipped to 6 staging clusters in one day *after* a 1-day pilot.)
- **Sequencing matters.** Before-compute on EKS addons; cert renewal before webhook reload; pod readiness gate before rolling deploy. Most production bugs are race conditions in disguise.
- **Built for the next engineer.** Every reusable pattern I built at Zencity has either become a [Claude Code skill](https://github.com/ahmedasmar/devops-claude-skills) or a [Terraform module](https://github.com/ahmedasmar/terraform-aws-gitlab-docker-autoscaler-runner) so the *next* engineer doesn't have to re-derive it.

## Certifications

- **CKA — Certified Kubernetes Administrator** (CNCF)

## Now

Open to **Staff / Senior DevOps · Platform Engineering · SRE** roles.

- Remote-friendly · based in GMT+3
- Comfortable across AWS (primary), GCP integration touchpoints, and multi-cloud Kubernetes
- Particularly interested in platform-engineering / IDP work, GitOps platforms, multi-account / multi-tenant infra, and anywhere "build a paved road for the rest of engineering" is the brief

## Reach out

- **LinkedIn:** [linkedin.com/in/ahmadasmar](https://www.linkedin.com/in/ahmadasmar)
- **GitHub:** [@ahmedasmar](https://github.com/ahmedasmar) — also at [@ahmad-asmar](https://github.com/ahmad-asmar) for Commonplace org contributions
- **Medium:** [@ahmed.asmar](https://medium.com/@ahmed.asmar) — including *["Automating Pod Disruption Budgets with Kyverno"](https://medium.com/zencity-engineering/automating-pod-disruption-budgets-with-kyverno-0a6bee7bbcca)* (Zencity Engineering, Dec 2, 2025) and *["Building a Local Dev Platform with Kubernetes, Tilt, and local GitLab pipelines"](https://medium.com/@ahmed.asmar/building-a-local-dev-platform-with-kubernetes-tilt-and-local-gitlab-pipelines-ab534d428c82)* (Apr 9, 2026)
- This site is open source: [github.com/ahmedasmar/ahmedasmar.github.io](https://github.com/ahmedasmar/ahmedasmar.github.io)
