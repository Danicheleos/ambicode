---
status: accepted
---

# Refuse a parcel weight of zero or less

| requirement | section | code |
| --- | --- | --- |
| a non-positive weight has no price | Iteration 1 | internal/rates/lookup.go:10-17 |

## Iteration 1: CentsFor rejects grams <= 0

*Goal*: rates.CentsFor returns core.ErrInvalid for 0 and negative weights; today the first band (350 cents) answers them (internal/rates/lookup.go:11-14), and pricing.Quote (internal/pricing/price.go:10-16) passes the weight through unchecked.

*Changes*:
- internal/rates/lookup.go:10-17 return `fmt.Errorf("rates.CentsFor: %w", core.ErrInvalid)` first when grams <= 0, the wrapping CONTRIBUTING.md asks for.
- internal/rates/rates_test.go:5-13 add a test beside TestCentsForPicksTheFirstBandThatFits: CentsFor(0) and CentsFor(-5) both satisfy errors.Is(err, core.ErrInvalid).

*Accept*: CentsFor(0) and CentsFor(-5) fail with core.ErrInvalid; CentsFor(1200) is still 620.

*Checks*: go test ./internal/rates.

*Leaves out*: the zone surcharge in internal/pricing/surcharge.go.
