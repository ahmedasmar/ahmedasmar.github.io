---
title: Modern Terraform CI/CD on GitLab
description: Replacing "push to staging and hope" with a five-stage MR-based flow. Validate → Checkov → plan-in-MR → Infracost → auto-apply. Took fleet pipelines from 8:52 to 5:36 — a 37% reduction.
---

> Built and shipped fleet-wide in December 2025. Headline metric: **37% faster pipelines (8:52 → 5:36)** across every Terraform project at Zencity.

## TL;DR

The "push to staging, hope it works, ask someone for prod approval" model is the default Terraform workflow at most companies. It produces three problems: nobody sees the plan before merge, security issues are caught manually if at all, and the cost impact of a change is invisible until the bill lands.

The MR-based flow below replaces that with five pipeline stages that run on every merge request: validate, security scan (**Checkov**), terraform plan, cost estimation (**Infracost**), and — only after merge — auto-apply. The plan and the cost diff are posted as MR comments so reviewers see exactly what is going to change in AWS and how much it will cost. The same flow runs on every Terraform project in the fleet.

The flow is short, opinionated, and easy to extend; the gotchas are mostly around state, locks, and OIDC.

## Why this shape

Three observations:

1. **A Terraform plan is the most useful artifact in a Terraform PR review.** If the plan isn't visible at review time, reviewers are guessing. Posting the plan in the MR is the single highest-leverage change.
2. **Security is a left-shift problem.** Checkov catches public-S3-buckets and unencrypted-RDS in the same step that lints HCL syntax — a Terraform reviewer should not be the line of defence.
3. **Cost is a left-shift problem.** Infracost turns "I'm not sure how much this RDS resize will cost" into a number in the MR. That number changes review behaviour; engineers self-correct.

The right ordering: **validate → security → plan → cost → review → merge → apply.** Every step gates the next.

## Prerequisites

- **GitLab Premium+** or GitHub. Identical pattern on GitHub Actions / Environments.
- **OIDC-to-AWS** configured for the runner. No long-lived AWS keys in CI variables. GitLab's `id_tokens:` block emits a JWT that AWS STS accepts via an IAM identity provider; one role per (project × environment) pattern.
- **Remote state with locking** — S3 + DynamoDB is the standard. The CI flow assumes locking works; without it, two MRs running plans simultaneously will produce stale plans.
- **A pinned Terraform version** in CI. Drift between local Terraform and CI Terraform is a recurrent source of weird diffs.
- **Provider plugin cache directory** set via `TF_PLUGIN_CACHE_DIR` — and a CI cache that backs that dir. The 37% pipeline speedup came mostly from getting this right.

## The MR pipeline — five stages

```yaml
stages:
  - validate
  - security
  - plan
  - cost
  - apply

variables:
  TF_VERSION: "1.9.5"
  TF_PLUGIN_CACHE_DIR: "${CI_PROJECT_DIR}/.terraform.d/plugin-cache"
  TF_IN_AUTOMATION: "true"

.tf_base:
  image: hashicorp/terraform:${TF_VERSION}
  id_tokens:
    AWS_OIDC_TOKEN:
      aud: https://gitlab.example.com
  before_script:
    - mkdir -p "${TF_PLUGIN_CACHE_DIR}"
    - export AWS_WEB_IDENTITY_TOKEN_FILE=$(mktemp)
    - echo "$AWS_OIDC_TOKEN" > "$AWS_WEB_IDENTITY_TOKEN_FILE"
    - export AWS_ROLE_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:role/gitlab-ci-${CI_PROJECT_NAME}"
    - terraform init -backend-config=backend.conf -lockfile=readonly
  cache:
    key:
      files: [.terraform.lock.hcl]
    paths:
      - ${TF_PLUGIN_CACHE_DIR}

tf:validate:
  extends: .tf_base
  stage: validate
  script:
    - terraform fmt -check
    - terraform validate

tf:checkov:
  stage: security
  image: bridgecrew/checkov:latest
  script:
    - checkov -d . --quiet --soft-fail-on LOW --hard-fail-on MEDIUM
  artifacts:
    when: always
    reports:
      sast: checkov-sast.json

tf:plan:
  extends: .tf_base
  stage: plan
  script:
    - terraform plan -out=tfplan -input=false -no-color | tee plan.txt
    - terraform show -json tfplan > plan.json
  artifacts:
    paths: [tfplan, plan.json, plan.txt]
    expire_in: 1 week
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"

tf:cost:
  stage: cost
  image: infracost/infracost:latest
  needs: ["tf:plan"]
  script:
    - infracost breakdown --path=plan.json --format=json --out-file=infracost.json
    - infracost comment gitlab --path=infracost.json --repo=$CI_PROJECT_PATH --merge-request=$CI_MERGE_REQUEST_IID --gitlab-token=$GITLAB_TOKEN
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"

tf:apply:
  extends: .tf_base
  stage: apply
  script:
    - terraform plan -out=tfplan -input=false -detailed-exitcode -no-color
    - terraform apply -input=false -auto-approve tfplan
  rules:
    - if: '$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH'
  resource_group: ${CI_PROJECT_NAME}-${TF_ENV}   # serialize applies per environment
```

A few details worth calling out:

- `resource_group:` on `tf:apply` is what makes concurrent merges safe. GitLab serialises any job that shares a resource group name; two MRs that merge in quick succession won't both apply at the same time. Without this, you can race the DynamoDB lock and get either failed pipelines or worse, partial applies.
- `terraform init -lockfile=readonly` means CI cannot accidentally update `.terraform.lock.hcl`. Lockfile changes go through a normal MR.
- The `before_script` is the OIDC dance. The GitLab JWT becomes the AWS WebIdentity token; STS validates it via the IAM IdP; the role is assumed for the rest of the job.

## Plan-in-MR — the visibility win

Post the plan as an MR comment so reviewers can see it without clicking into the job. GitLab's API:

```bash
PLAN=$(cat plan.txt | head -c 50000)   # GitLab comment limit
curl --request POST \
  --header "PRIVATE-TOKEN: $GITLAB_TOKEN" \
  --data-urlencode "body=### Terraform plan

\`\`\`hcl
$PLAN
\`\`\`" \
  "$CI_API_V4_URL/projects/$CI_PROJECT_ID/merge_requests/$CI_MERGE_REQUEST_IID/notes"
```

For larger plans, post a truncated summary with a link to the full artifact. Always include the "Plan: X to add, Y to change, Z to destroy." line — that's the headline reviewers need.

## Security gating — Checkov

Standard Checkov rule set with a custom override for any rules you've explicitly chosen to skip:

- `--soft-fail-on LOW` — surfaces in the MR comment but doesn't block
- `--hard-fail-on MEDIUM` — blocks the merge button
- `HIGH` and `CRITICAL` — also block, by default
- A `.checkov.yml` in the repo for the per-project skip list, with required justifications in PR comments for every skip

## Cost gating — Infracost

Infracost reads the JSON plan and produces a per-resource cost diff. The breakdown comment in the MR is the deliverable — reviewers see "this adds $145/month" or "this saves $30/month" before they hit approve.

## Multi-environment promotion

For multi-environment Terraform, the right shape is one repo per product, one directory per environment (`./staging`, `./prod`), separate state per environment. Promotion is a CI job that:

1. Generates a diff between staging tfvars and prod tfvars (or between staging and prod module versions, if you use module pinning per environment)
2. Posts the diff to a promotion MR template
3. The promotion MR is reviewed by a human; merge fires the prod apply

Critically, do *not* let `auto-apply` cross the staging / prod boundary. Auto-apply on merge to the default branch is fine when the default branch is the staging branch; prod requires a separate, deliberate merge.

## The cache fix that bought the 37%

The original CI had a Terraform plugin cache directory, but the cache key was wrong: it included the commit SHA, so every commit invalidated the cache and re-downloaded every provider. Three providers × 50 MB × every pipeline = the bulk of the time.

The fix:

```yaml
cache:
  key:
    files: [.terraform.lock.hcl]   # invalidate only when lockfile changes
  paths:
    - ${TF_PLUGIN_CACHE_DIR}
```

`.terraform.lock.hcl` only changes when providers are intentionally bumped. The cache now persists across normal commits; providers are pulled from the cache directory in milliseconds. Pipeline time on the slowest project dropped from 8:52 to 5:36 — exactly the speedup you'd predict from removing the provider downloads.

This is the kind of thing you find by reading the actual stage timings, not from the docs. Run a single pipeline with `TF_LOG=DEBUG`; the provider download time is right there.

## Gotchas

**Merge trains and stale plans.** GitLab merge trains rebase each MR against the latest target branch before merging. The plan that was reviewed in the MR was generated against an older base — if another MR has merged since, the auto-applied plan may differ. *Fix*: re-run a fresh plan as the first step of the apply job, and fail if its diff differs from the MR plan.

**Locks left behind by killed runners.** A runner crash mid-apply leaves a DynamoDB lock that no human can release through normal CLI without explicit `-force`. Have a force-unlock runbook ready.

**Provider cache and `-lockfile=readonly` interaction.** `init` with a readonly lockfile won't add providers that aren't already in the lockfile. If a developer adds a provider in a feature branch but doesn't update the lockfile, CI fails. Require lockfile updates through a deliberate "lockfile-update" MR.

**Checkov false positives drown signal.** Tune the rule set, document skips, review the skip list quarterly. A Checkov result with 200 findings is the same as no Checkov result — nobody reads it. Aim for fewer than 10 findings per MR, of which 0 should be unjustified.

**Cost estimates are estimates.** Infracost doesn't catch every cost driver (S3 request pricing, data transfer between AZs, NAT gateway throughput). Use it as a directional signal, not an audit.

**OIDC role scope creep.** Per-project IAM roles drift toward "AdministratorAccess" because every new resource type adds another action. Audit the per-project roles every quarter; trim back to the actual `aws_*` resources the repo manages.

## Validation

For each project after migration:

- A test MR with a no-op change produces: validate ✓, Checkov 0 findings (or expected only), plan shows "0 to add/change/destroy", Infracost shows $0 diff.
- A test MR with a deliberate violation (e.g., a public S3 bucket) blocks at Checkov.
- A test MR with a cost change (e.g., an instance type bump) produces an Infracost comment with the right delta.
- Time the full pipeline; compare against your baseline. The first run is cold-cache; the second should hit the provider cache and be visibly faster.

## Rollback

The flow is entirely additive — if anything breaks, you delete the offending stage and you're back to a normal Terraform CI. The OIDC + state-bucket plumbing is the only thing that needs to stay; everything else is gravy.
