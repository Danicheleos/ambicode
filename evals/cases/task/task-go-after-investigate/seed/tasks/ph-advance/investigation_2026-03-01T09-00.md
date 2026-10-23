tracking.Advance accepts any next state for any parcel, including a parcel that is already delivered.

- Advance reads the parcel, appends `core.Scan{State: next, At: s.clock.Now()}` and stores it, with no look at the existing scans: internal/tracking/service.go:28-38.
- The helper that answers "already delivered" exists and is unused here: IsDelivered at internal/tracking/history.go:13-16, built on LastState at internal/tracking/history.go:6-11.
- Errors in this package are wrapped with the function name and carry core.ErrInvalid for bad input: internal/tracking/service.go:31 and internal/core/errors.go:6-7.
- Time comes from the injected clock (internal/tracking/service.go:33), and CONTRIBUTING.md forbids time.Now outside internal/clock.
- Tests: internal/tracking/tracking_test.go:13-28 covers the scan time; nothing covers an Advance after Delivered.
