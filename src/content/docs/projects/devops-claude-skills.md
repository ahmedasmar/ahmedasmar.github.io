---
title: DevOps Claude Skills marketplace
description: A 158★ Claude Code Skills marketplace for DevOps workflows — ArgoCD onboarding, GitOps migrations, AWS SSO auth recovery, and more.
---

> [github.com/ahmedasmar/devops-claude-skills](https://github.com/ahmedasmar/devops-claude-skills) ·
> **158 ★ · 32 forks** · Launched Oct 26, 2025

A curated marketplace of [Claude Code Skills](https://docs.claude.com/en/docs/claude-code) for DevOps workflows. Real community traction in 7 months — signal that I build developer products people actually adopt.

## What's a skill?

Claude Code Skills are reusable instruction packs that teach the Claude Code CLI a specialised workflow — a Markdown spec + supporting files, invoked on-demand when the user asks for that workflow. Anthropic ships some built-in; the rest of the ecosystem is open-source.

This repository is the curated set I built for **infrastructure / platform engineering** tasks:

| Skill | What it does |
|---|---|
| `aws-sso-auth` | Re-authenticates to AWS SSO when tokens expire. Handles multi-account / multi-org session refresh, picks the right `~/.aws/config` profile, runs `aws sso login` non-interactively. |
| `argocd-eks-cluster-onboard` | End-to-end onboarding of a new EKS target cluster to ArgoCD via **Pod Identity + cross-account AssumeRole** — replaces manual `argocd cluster add` and the long-lived ServiceAccount bearer-token pattern. |
| `gitops-helm-onboard` | Migrate a Helm chart addon from Terraform-managed `helm_release` to ArgoCD with zero downtime. Handles the `terraform state rm` + Application creation + Server-Side-Diff dance. |
| `monday-helper` / `monday-sync` | Connect finished development work back to Monday.com tracking via git history. |
| `claude-md-management` | Audit and improve `CLAUDE.md` files in repositories. |
| `k8s-troubleshooter` | Systematic Kubernetes triage — CrashLoopBackOff, ImagePullBackOff, OOMKilled, Pending, node DiskPressure. |
| `aws-cost-optimization` | FinOps workflows: RI / Savings Plan analysis, Graviton migration, gp2 → gp3, rightsizing. |
| `monitoring-observability` | Four Golden Signals / RED / USE; Datadog ↔ Prometheus comparisons; SLO + error-budget math. |
| `iac-terraform` | Terraform + Terragrunt module scaffolding and review. |
| `ci-cd` | GitLab CI + GitHub Actions pipeline design and DevSecOps wiring. |

## Why it works

Each skill captures **production patterns** that took me time to get right at SaaS scale — not generic tutorials. `argocd-eks-cluster-onboard` is the same Pod-Identity-based cluster-registration flow I built for a multi-cluster GitOps engine; `aws-sso-auth` is the recovery flow I ran multiple times a day across a 20-account AWS estate.

The skills are also **chainable**: when a user says *"a new EKS cluster is ready, hook it up to ArgoCD"*, Claude Code can invoke `aws-sso-auth` (to refresh credentials) then `argocd-eks-cluster-onboard` (to do the work) without the user wiring them together.

## Track record

- **158 stars · 32 forks** as of May 16, 2026
- Actively maintained (as of May 2026)
- Listed in community-curated awesome-claude-code lists

## Related

- [GitHub: devops-claude-skills](https://github.com/ahmedasmar/devops-claude-skills)
- [Claude Code Skills docs](https://docs.claude.com/en/docs/claude-code/skills)
