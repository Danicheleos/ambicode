# Ground truth — regression-py

Held back from both arms. Never in a prompt, never in a grader body (doc 07).

Fixture: `py-source-regression`

`cents(1.5)` returned 150 and now returns 100: `int(amount)` truncates before scaling. The unchanged `tests/test_money.py` fails.
