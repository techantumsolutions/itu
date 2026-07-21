# Branch protection — MANUAL GitHub configuration (cannot be enforced from YAML alone).
#
# GitHub does not allow repository workflows to enable branch protection rules.
# An org/repo admin must configure these in the GitHub UI (or via the GitHub API
# with an admin token). This file is the source of truth for what MUST be set.
#
# ─────────────────────────────────────────────────────────────────────────────
# VERIFY (run with admin credentials; `gh` CLI):
#
#   gh api repos/techantumsolutions/itu/branches/main/protection
#
# Expected non-404 JSON with:
#   required_pull_request_reviews (or rulesets equivalent)
#   required_status_checks.checks containing context "CI Gate"
#   (recommended) "Analyze (javascript-typescript)"
#
# If the API returns 404 Not Found, protection is NOT enabled — treat as FAIL.
#
# Rulesets (newer):
#   gh api repos/techantumsolutions/itu/rulesets
# ─────────────────────────────────────────────────────────────────────────────
#
# Settings → Branches → Branch protection rule for `main` (or equivalent ruleset):
#   [x] Require a pull request before merging
#   [x] Require status checks to pass before merging
#   [x] Require branches to be up to date before merging
#   [x] Do not allow bypassing the above settings (except emergency break-glass)
#
# Required status checks (exact names):
#   - CI Gate                          # .github/workflows/ci.yml job name
#   - Analyze (javascript-typescript)  # .github/workflows/codeql.yml job name
#
# Mandatory quality gates inside CI Gate (always hard-fail on PRs):
#   - ESLint (lint)
#   - TypeScript (typecheck)
#   - Unit tests + coverage (test)
#   - Secret scanning (Gitleaks)
#   - Build + standalone verify
#   - Docker build (+ Trivy; soft on PRs unless CI_TRIVY_STRICT=true)
#
# Production deploy scanners (.github/workflows/deploy.yml) — ALWAYS hard-fail:
#   - pnpm audit High/Critical
#   - Trivy High/Critical (web + sidecar) before GHCR push
#
# PR / development workflow variables (optional soft-fail ONLY on ci.yml):
#   CI_AUDIT_STRICT=true    # make PR audit hard-fail
#   CI_TRIVY_STRICT=true    # make PR Trivy hard-fail
#
# Also enable (org/repo — also not enforceable from this repository):
#   - Secret scanning + push protection
#   - Dependabot alerts / security updates
#
# Deploy model (VPS):
#   - Immutable SHA tags: ghcr.io/.../web:<sha>, .../sidecar:<sha>
#   - :latest is convenience only — production cutover never uses :latest
#   - Rollback: Actions → "Build and Deploy (Registry)" → Run workflow → action=rollback
#     or on VPS: bash scripts/deploy-rollback.sh [sha]
