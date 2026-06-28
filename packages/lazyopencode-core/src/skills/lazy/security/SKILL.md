---
name: lazy/security
description: OWASP-bucketed security audit, concrete PoC required per finding
---

# lazy/security

## Process

1. **Scope trust boundaries.** Identify user/API/file inputs, sensitive data, and auth boundaries.
2. **Audit by OWASP.** Check injection, authn, authz, data exposure, input validation.
3. **PoC every finding.** For each: exact attack vector → impact → minimal fix.

## Output format

```
## Security Review: [scope]

### 🔴 Critical (exploitable now)
- [OWASP category]: [finding] → [PoC] → [fix]

### 🟡 Warning (defense-in-depth)
- [OWASP category]: [finding] → [mitigation]

### 🟢 Clean
- [area reviewed]: no issues found
```

Only report real, exploitable issues. 🔴 requires concrete PoC. Mark theoretical risks 🟡.
