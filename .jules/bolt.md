# Bolt's Journal

## 2025-05-14 - [RegExp Optimization and findLast Efficiency]

**Learning:** Moving static patterns out of loops and using pre-compiled RegExps provides a measurable boost in frequently called utility functions like header masking. Additionally, replacing `slice().reverse().find()` with `findLast()` avoids unnecessary O(N) memory allocations and O(N) reversal overhead.
**Action:** Always check for repeated array/object creation inside loops and prefer built-in ES2023 methods like `findLast()` for searching from the end of an array.
