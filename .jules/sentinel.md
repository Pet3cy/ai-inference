## 2025-05-15 - Path Traversal Prevention in Action Inputs

**Vulnerability:** Path traversal via `prompt-file` and `file_input` action parameters allowed reading files outside the workspace.
**Learning:** GitHub Actions often rely on relative paths provided by users. Without strict validation against `process.cwd()`, attackers can escape the workspace using `../` or absolute paths.
**Prevention:** Implement a `validatePath` helper that resolves paths and checks if they stay within `process.cwd()` using `path.relative`.

## 2025-05-15 - Enhanced Sensitive Header Masking

**Vulnerability:** Sensitive headers like `Cookie`, `Session`, `Bearer`, and `Credential` were not included in the default masking regex, potentially leaking credentials in debug logs.
**Learning:** Default masking lists are often incomplete. Regular review of sensitive patterns is necessary as new authentication methods or custom headers are introduced.
**Prevention:** Maintain a comprehensive regex for sensitive patterns (e.g., `key|token|secret|password|authorization|cookie|session|bearer|credential`) and apply it consistently during header processing.
