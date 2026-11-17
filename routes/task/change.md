# Implement the change
Launch the `ambicode:implementer` subagent on {work} in the foreground (`run_in_background: false`; the route waits for it): `Implement the work described in {work}. The code is in the checkout.`
When it returns, run nothing unless the hook tells you to run `route next`: the implementer already ran it, and the next step arrives with its result. The code and the checks are the implementer's, so the record shows one author for each.
