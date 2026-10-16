# Fix the review findings
Invoke the `ambicode:implementer` subagent with the Agent tool and `run_in_background: false`: a background implementer outlives the turn. Its prompt:
`Implement the work described in {work}. The code is in the checkout.`
The hook prints the touched files and the next step when it returns; follow that.
- Do not edit the code yourself, and do not run tests: the implementer records the green check.
- Keep its `Changed:` list and any `Gaps:` lines for the final report.
