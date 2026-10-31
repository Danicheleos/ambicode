# Implement the change
Launch the `ambicode:implementer` subagent on {work}, in the foreground (`run_in_background: false`; the route waits for it): `Implement the work described in {work}. The code is in the checkout.`
Run nothing when it returns: the implementer runs `route next` itself and the next step arrives with its result.
- Do not edit the code yourself, and do not run tests: the implementer records the green check.
