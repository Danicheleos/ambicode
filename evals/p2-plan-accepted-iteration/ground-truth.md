# Ground truth — p2-plan-accepted-iteration

Held back from both arms. Never in a prompt, never in a grader body (doc 07).

Fixture: `ts-no-tests`, reset to its clean committed state.

The request has exactly one reasonable design (two independent exported
functions); there is no material decision to surface. PL09 (doc 07) covers a
truly interactive acceptance round with a human; this unattended eval cannot
simulate that turn, so the grader checks for plan structure and completeness
(ordered iterations, acceptance criteria per iteration) rather than an actual
human "accept" exchange, which is a known, documented limitation of running
this case unattended.
