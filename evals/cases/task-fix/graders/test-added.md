---
type: llm
focus: { source: file, path: repo/tests/page.test.js }
weight: 2
---

PASS if the file contains a test that would fail on the original defect: it asserts a full page such as page([1, 2, 3], 0, 2) equal to [1, 2], or a last element present. The original tests ("empty list", "out of range") are still present and unchanged in meaning.
FAIL if no such test exists or an existing assertion was weakened or removed.
