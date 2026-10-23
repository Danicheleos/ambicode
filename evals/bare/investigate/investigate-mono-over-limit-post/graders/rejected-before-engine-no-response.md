---
type: llm
focus: last_message
weight: 2
---

PASS if the answer states, in any wording, all three:
- The dashboard rejects the segment itself: checkSegments (isSetpointDc, limit 13_000 in dashboard/src/lib/validate/limits.ts) throws a SetpointError "setpoint 13500 is outside the kiln limits" inside beginFiring, before startFiring, so the engine is never called.
- handleErrors would map a SetpointError to a 422 JSON reply, but the route is an async handler on Express 4 (dashboard/package.json), which does not pass a rejected promise to the error middleware.
- So the client does not get that 422: the request gets no response (it hangs) and the rejection is unhandled.
Equivalent wording counts ("express 4 does not catch async errors", "the error never reaches handleErrors"). Mentioning that the engine has its own copy of the check is fine.
FAIL if it says the engine rejects the segment, says the client receives the 422 JSON reply (or any other response) from handleErrors, or says the request reaches the engine.
