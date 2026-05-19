# Sentinel's Journal

## 2025-05-14 - [Path Traversal Mitigation and Enhanced Masking]
**Vulnerability:** Path traversal via user-provided file paths in GitHub Action inputs.
**Learning:** GitHub Actions that read files based on user input are susceptible to path traversal if paths are not validated against a root directory (e.g., `process.cwd()`). Additionally, sensitive headers like `Cookie` and `Session` were previously excluded from masking, creating a risk of credential leakage in logs.
**Prevention:** Always use a `validatePath` helper to resolve and check paths against the workspace root. Maintain a comprehensive `SENSITIVE_HEADER_PATTERN` that includes all common authentication and session-related header names.
