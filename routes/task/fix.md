# Fix the review findings
Launch the `ambicode:implementer` subagent on {work}: `Implement the work described in {work}. The code is in the checkout.`
When it returns, run the Then command.
- Do not edit the code yourself, and do not run tests: the implementer records the green check.
- Keep its `Changed:` list and any `Gaps:` lines for the final report.
