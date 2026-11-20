# Phase 6 — GitHub Release Preparation

**Date:** 2026-11-21  
**Public push / visibility change:** **NOT PERFORMED**

## Prepared

- Apache 2.0 LICENSE + NOTICE
- CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, CHANGELOG
- `.github/workflows/ci.yml`, issue/PR templates
- README license + Community Edition sections
- `/about` page

## Proposed release (when approved)

- Version: `1.0.0` tag `v1.0.0` — **do not create until GO**
- Copyright: Copyright 2026 K G Pramod

## Blockers

1. Initial commit + private remote + Gitleaks
2. Explicit approval to make repository public
3. Do not push release tags without approval

## Suggested publication commands (manual, after approval)

```powershell
git add .
git commit -m "chore: prepare Apache-2.0 Community Edition"
# add private remote, push
# after GO for public: gh repo edit --visibility public
# after GO for tag: git tag v1.0.0; git push origin v1.0.0
```

## GO / NO-GO

**Phase 6 package: Complete** (prep artifacts in repo).  
**NO-GO** for public GitHub release until commit + private remote + Gitleaks + explicit approval.
