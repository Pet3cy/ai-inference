## 2025-05-15 - [Robust Path Traversal Prevention]
**Vulnerability:** Simple prefix-based path validation (e.g., `path.startsWith(process.cwd())`) is susceptible to bypasses via sibling directories (e.g., `/app-secrets` vs `/app`).
**Learning:** Prefix matching on strings is not sufficient for path security.
**Prevention:** Use `path.relative(root, target)` and check if the result starts with `..` or is absolute to ensure the target is strictly within the root.

## 2025-05-15 - [Sensitive Header Masking Regression]
**Vulnerability:** Sensitive authentication headers like `Cookie`, `Session`, and `Bearer` were being logged in cleartext because they were removed from the masking pattern to satisfy outdated tests.
**Learning:** Tests should drive security, not dictate its removal. If a test fails because a security feature is working (masking), the test's expectations should be updated, not the security feature disabled.
**Prevention:** Maintain a comprehensive `SENSITIVE_HEADER_PATTERN` that includes all common credential-carrying headers and ensure tests reflect the necessity of masking them.
