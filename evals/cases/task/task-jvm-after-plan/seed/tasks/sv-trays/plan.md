# Refuse a sowing of no trays

| requirement | section | code |
| --- | --- | --- |
| a sowing needs at least one tray | Iteration 1 | application/src/main/kotlin/org/seedvault/application/usecase/germination/SowLotService.kt:25-34 |

## Iteration 1: SowLotService rejects trays < 1

*Goal*: SowLotService returns Outcome.Rejected for a command with zero or negative trays; today such a command marks the lot Sown and publishes LotSown (SowLotService.kt:30-31).

*Changes*:
- application/src/main/kotlin/org/seedvault/application/usecase/germination/SowLotService.kt:25-28 reject `command.trays < 1` before the lot is saved, with an Outcome.Rejected reason in the style of the neighbouring ones (SowLotService.kt:26, 29); the lot stays Banked.
- application/src/test/kotlin/org/seedvault/application/usecase/germination/SowLotServiceTest.kt:43-47 add `rejectsZeroTrays` next to rejectsUnknownLot, using the same serviceWith helper.

*Accept*: SowLotCommand(lot.id, trays = 0) yields Outcome.Rejected and the repository still holds the lot as Banked.

*Checks*: ./gradlew :application:test.

*Leaves out*: tray capacity (TrayPlanner).
