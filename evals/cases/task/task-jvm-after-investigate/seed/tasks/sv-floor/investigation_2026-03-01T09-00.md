The viability floor is a constant in the domain, and the stock report repeats it as a literal.

- VIABILITY_FLOOR_PERCENT = 50 is defined at domain/src/main/kotlin/org/seedvault/domain/lot/Viability.kt:3 and used by Viability.isViable at Viability.kt:7; GerminationRules uses isViable at domain/src/main/kotlin/org/seedvault/domain/germination/GerminationRules.kt:13.
- viabilityBands in application/src/main/kotlin/org/seedvault/application/usecase/report/ViabilityBands.kt:5-13 splits lots into excellent (>= 90), viable (>= 50) and weak with the literal 50 at ViabilityBands.kt:11, so moving the floor would leave the report behind.
- viabilityBands has no caller yet and no test: StockReportService counts viable lots with isViable (application/src/main/kotlin/org/seedvault/application/usecase/report/StockReportService.kt:10).
- The only existing test in the application module is application/src/test/kotlin/org/seedvault/application/usecase/germination/SowLotServiceTest.kt.
