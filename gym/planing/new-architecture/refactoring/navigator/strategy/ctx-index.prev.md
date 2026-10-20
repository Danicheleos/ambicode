# Context index (grep target, not for reading whole)
Recipe (generic, built only from the scout context notes, no source reads):
1. features = product capabilities named by screen/wizard/report/dialog words found in module purposes and component names; aka = ticket words, abbreviations as written in the notes, synonyms from the names.
2. modules = one line per module note directory (or group of sibling notes); aka = folder-name abbreviations and what the folder holds per its Purpose.
3. controllers = components, dialogs, services, facades, guards, routes, resolvers, directives that carry behaviour; aka = what they do in user words, derived from the name.
4. models = types, enums, DTOs, form shapes, state, constants named in Key files; aka = domain terms taken from the identifier words.
5. Line = `name | aka: hints | where: path(s) from the notes | ctx: note path(s)`. Grep with a ticket word, then Read only the ctx note or Grep the where path.

## features
risk assessment reports | aka: reports, assessments, report page, ergonomic risk assessment | where: main/screens/report | ctx: modules/main/screens/report/overview.md, modules/main/screens/report/components.md
reports list | aka: assessments list, reports table, list of reports, assessments table, saved views | where: main/screens/reports-list-new | ctx: modules/main/screens/reports-list-new/overview.md, modules/main/screens/reports-list-new/table.md
upload | aka: upload video, video assessment, manual assessment, capture guidelines, upload preview | where: main/screens/upload | ctx: modules/main/screens/upload.md
find right assessment | aka: choose assessment type, assessment finder, rapid screening tool, movement tool | where: main/screens/report/components/find-right-assessment | ctx: modules/main/screens/report/components.md
new assessment type dialog | aka: add assessment type, add score type, tool type filter | where: main/screens/report/components/new-assessment-type-dialog | ctx: modules/main/screens/report/components.md
manual assessment | aka: manual assessment wizard, manual input, manual override wizard, manually override cv values | where: main/screens/report/components/assessment-dialog/manual-assessment-dialog, main/screens/upload/manual-assessment | ctx: modules/main/screens/report/components.md
report export | aka: export report, export excel report, share report | where: main/screens/report/services, main/components/dialogs/export-excel-report-dialog | ctx: modules/main/screens/report/overview.md, modules/main/components/dialogs.md
report comparison | aka: compare reports, compare assessments, comparison queue | where: main/screens/compare, main/screens/report/services, main/screens/reports-list-new/services | ctx: modules/main/screens/overview.md, modules/main/screens/report/overview.md
analytics dashboard | aka: analytics, dashboard, charts, filters, ranked joint scores | where: main/screens/analytics | ctx: modules/main/screens/overview.md
employees | aka: employee page, employees list, employee table, employee dialog, employee notes | where: main/screens/employee, main/screens/employees-list | ctx: modules/main/screens/overview.md, modules/main/components/tables.md
login | aka: sign in, forgot password, okta callback, client auth, auth | where: main/screens/login, main/screens/forgotPassword, main/screens/oktaCallback, main/screens/client-auth | ctx: modules/main/screens/overview.md
help and learn pages | aka: help, learn, dev page, global language settings | where: main/screens/help, main/screens/learn, main/screens/dev | ctx: modules/main/screens/overview.md
app shell | aka: layout, routing, app routes, page not found, gdpr banner, version sync banner, idle logout, loading overlay | where: main/screens/app | ctx: modules/main/screens/app/overview.md
navigation header | aka: nav header, navbar, nav links, breadcrumbs, profile dropdown, language menu, unit system menu, mobile nav, dev org dropdown | where: main/screens/app/nav-header | ctx: modules/main/screens/app/nav-header/overview.md, modules/main/screens/app/nav-header/components.md
organization admin | aka: org admin, org settings, white labeling, hierarchy admin, registered users, threshold settings, tool types, privacy settings, assessment settings | where: main/screens/org-admin | ctx: modules/main/screens/org-admin.md
risk management tasks | aka: tasks, task list, task detail, task wizard, ergo phases, current state report, reassessment, proposal | where: main/features/risk-management | ctx: modules/main/features/risk-management/overview.md, modules/main/features/risk-management/tasks/overview.md
task wizard | aka: create task, edit task, task details, task org context | where: main/features/risk-management/tasks/components/task-wizard | ctx: modules/main/features/risk-management/tasks/components/task-wizard.md
task detail page | aka: task page, reference assessments, current state video, report list for task, ergo phase | where: main/features/risk-management/tasks/pages/task-detail | ctx: modules/main/features/risk-management/tasks/pages/task-detail.md
feature flags | aka: unleash, toggles, feature toggle | where: main/features/feature-flags | ctx: modules/main/features/feature-flags.md
ai custom solutions | aka: chatkit, ai solutions card, solutions chat | where: main/features/ai-custom-solutions | ctx: modules/main/features/overview.md
potential solutions | aka: solutions accordions, top three factors, recommendations | where: main/features/potential-solutions, main/screens/report/components/potential-solutions | ctx: modules/main/features/overview.md, modules/main/screens/report/components.md
vlm | aka: vlm status, vlm pipeline status, vlm effort data | where: main/features/vlm | ctx: modules/main/features/overview.md
bio mechanical data | aka: joint torque, joint detail, biomechanical | where: main/features/bio-mechanical-data | ctx: modules/main/features/overview.md
amplitude analytics | aka: tracking, event properties, telemetry events | where: main/features/amplitude | ctx: modules/main/features/overview.md
jkh export | aka: jkh hand position, jkh export request | where: main/features/exports/jkh | ctx: modules/main/features/overview.md
hal usage report | aka: hal counter, hal user data | where: main/features/hal-counter | ctx: modules/main/features/overview.md
EST | aka: est score, est wizard, est score card, est score detail, est tooltips | where: main/features/score-types/est | ctx: modules/main/features/score-types/est/overview.md
EST wizard | aka: est general data, demographics, job info, hands, material handling, neck, shoulders, compute cv values | where: main/features/score-types/est/components/wizard | ctx: modules/main/features/score-types/est/components/wizard/overview.md
EST score card | aka: est results, recommendations box, body part display, results summary | where: main/features/score-types/est/components/score-card, main/features/score-types/est/components/result-badge | ctx: modules/main/features/score-types/est/components/score-card/overview.md
EST tooltips | aka: hand tooltip, shoulder tooltip, flexion, extension, radial, ulnar, abduction, twisting | where: main/features/score-types/est/components/tooltips | ctx: modules/main/features/score-types/est/components/tooltips/hand.md
GE-ADV | aka: ge adv, geadv, ge-adv wizard, ge-adv score card, ge-adv detail | where: main/features/score-types/ge-adv | ctx: modules/main/features/score-types/ge-adv/overview.md
GE-ADV wizard | aka: geadv wizard, elbows, fingers, hands and wrists, legs, shoulders, back, neck, borg scale, frequency duration, force form | where: main/features/score-types/ge-adv/components/wizard | ctx: modules/main/features/score-types/ge-adv/components/wizard/overview.md
GE-ADV score card | aka: geadv score card, body part score, total score, score detail, contact stress, posture detail, force detail, contributing factors | where: main/features/score-types/ge-adv/components/score-card | ctx: modules/main/features/score-types/ge-adv/components/score-card/overview.md
GM-RFC | aka: gm rfc, gmrfc, gm-rfc wizard, posture step, environment step | where: main/features/score-types/gm-rfc | ctx: modules/main/features/score-types/gm-rfc/overview.md
GM-RFC wizard | aka: tools form, work zone, trunk, neck, distal upper extremities, contact and surface stress, movement, risks and conditions, torque tool | where: main/features/score-types/gm-rfc/components/wizard | ctx: modules/main/features/score-types/gm-rfc/components/wizard/overview.md
HAL | aka: hal score, hal score type, hal pfi, hal manual override | where: main/features/score-types/hal | ctx: modules/main/features/score-types/hal/overview.md, modules/main/features/score-types/hal/components.md
LM carry | aka: lm-carry, carry assessment, carry wizard, carry score card | where: main/features/score-types/lm-carry | ctx: modules/main/features/score-types/lm-carry/overview.md, modules/main/features/score-types/lm-carry/components.md
LM lift | aka: lm-lift, lift assessment, lift wizard, lift score card | where: main/features/score-types/lm-lift | ctx: modules/main/features/score-types/lm-lift/overview.md, modules/main/features/score-types/lm-lift/components.md
LM lower | aka: lm-lower, lower assessment, lower wizard, lower score card | where: main/features/score-types/lm-lower | ctx: modules/main/features/score-types/lm-lower/overview.md, modules/main/features/score-types/lm-lower/components.md
LM push-pull | aka: lm-push-pull, push pull, push/pull assessment, push-pull wizard | where: main/features/score-types/lm-push-pull | ctx: modules/main/features/score-types/lm-push-pull/overview.md, modules/main/features/score-types/lm-push-pull/components.md
NIOSH | aka: niosh score, niosh wizard, birp graph, coupling quality, niosh duration | where: main/features/score-types/niosh | ctx: modules/main/features/score-types/niosh/overview.md, modules/main/features/score-types/niosh/components.md
NOM | aka: nom score, nom wizard, nom score card, nom lift, nom carry, nom push-pull, nom team, nom general data | where: main/features/score-types/nom | ctx: modules/main/features/score-types/nom/overview.md
NOM wizards | aka: nom lift wizard, nom carry wizard, nom push-pull wizard, nom team wizard, nom general data wizard, work conditions, environmental factors, grip | where: main/features/score-types/nom/shared/wizards | ctx: modules/main/features/score-types/nom/shared/wizards/overview.md
NOM score card | aka: nom detail, nom tooltip, color band tooltip, risk count, warning cell | where: main/features/score-types/nom/components | ctx: modules/main/features/score-types/nom/components/score-card.md, modules/main/features/score-types/nom/components/overview.md
RSI | aka: rsi score, rsi wizard, cosi, rsi hand detail, rsi hand graph | where: main/features/score-types/rsi | ctx: modules/main/features/score-types/rsi/overview.md, modules/main/features/score-types/rsi/components.md
RULA | aka: rula score, rula wizard, rula score card, muscle use, upper body effort, lower body effort | where: main/features/score-types/rula-reba/rula | ctx: modules/main/features/score-types/rula-reba/rula/overview.md
REBA | aka: reba score, reba wizard, reba score card, activity, leg position, coupling | where: main/features/score-types/rula-reba/reba | ctx: modules/main/features/score-types/rula-reba/reba/overview.md
RULA and REBA shared | aka: rula-reba, wizard video frame selection, frame analyzed, metrics table, wizard option card | where: main/features/score-types/rula-reba | ctx: modules/main/features/score-types/rula-reba/shared.md, modules/main/features/score-types/rula-reba/overview.md
composite rank | aka: inseer composite, composite rank score, handled loads, joint analysis, composite results | where: main/features/score-types/composite-rank | ctx: modules/main/features/score-types/composite-rank.md
score types shared | aka: score card container, printable accordion, wizard navigation, wizard auto launch, form progress saving, solution factors, lm risk | where: main/features/score-types/shared | ctx: modules/main/features/score-types/shared/overview.md
advanced table | aka: saved views, column manager, manage views, rename view, global search, table filters, view bar | where: main/shared/modules/advanced-table | ctx: modules/main/shared/modules/advanced-table/overview.md, modules/main/shared/modules/advanced-table/components.md
report filters | aka: filters, selected location, date range, job title, task name, score type filter, search query, pagination, sorting, reset filters | where: main/state/filters | ctx: modules/main/state/filters.md
assessments dialog | aka: assessments popup, location assessments dialog, edit assessment modal, delete location dialog | where: main/components/dialogs | ctx: modules/main/components/dialogs.md
body part selector | aka: human body, body part buttons, body part rank, body part picker | where: main/components/ui | ctx: modules/main/components/ui/overview.md
steppers | aka: stepper, accordion stepper, nested steppers, step content, next previous buttons | where: main/components/ui/steppers | ctx: modules/main/components/ui/steppers.md
card button | aka: card radio group, card checkbox group, card readonly group | where: main/components/ui/card-button | ctx: modules/main/components/ui/card-button.md
d3 charts | aka: pie chart, sunburst chart, line graph, risk graph, horizontal metrics, vertical metrics, waveform | where: main/components/datadisplays/D3Components | ctx: modules/main/components/datadisplays/D3Components.md
score gauge and rank | aka: risk gauge, score gauge, score rank, allowable load, detailed data, metric display | where: main/components/datadisplays | ctx: modules/main/components/datadisplays/overview.md
user table | aka: users table, edit user dialog, user columns | where: main/components/tables/user-table | ctx: modules/main/components/tables.md
unit conversion | aka: units, metric imperial, unit system, conversions, length weight force duration angle | where: main/models/units, main/models/conversions.ts | ctx: modules/main/models/units.md, modules/main/models/overview.md
confidence | aka: cv confidence, confident flags, confidence percentage, confidence arrays | where: main/models/confidence, main/state/confidence.facade.ts | ctx: modules/main/models/confidence.md
white labeling | aka: branding, logos, subdomain, landing page, white label | where: main/screens/org-admin/white-labeling-configurator, main/scripts, main/directives/white-labeling-directive.ts | ctx: modules/main/screens/org-admin.md, modules/main/scripts/components.md, modules/main/directives.md
i18n translation | aka: ngx-translate, language, translation keys, i18n loader, language settings | where: main/core/i18n, main/services/language-settings.service.ts | ctx: modules/main/overview.md, modules/main/services.md
storybook stories | aka: component stories, .stories.ts | where: .storybook | ctx: overview.md

## modules
main | aka: source root, app root, bootstrap, validators, constants, providers, environments | where: main | ctx: modules/main/overview.md
main/components | aka: shared components, shared ui, legacy ui | where: main/components | ctx: modules/main/components/overview.md
main/components/buttons | aka: ai values button, modify restore ai | where: main/components/buttons | ctx: modules/main/components/overview.md
main/components/material | aka: material module, mat dialog config, mat form field config, mat icon initializer | where: main/components/material | ctx: modules/main/components/overview.md
main/components/ui | aka: alerts, accordion, help button, hazard level info, video player, hierarchy filter | where: main/components/ui | ctx: modules/main/components/ui/overview.md
main/components/inputs | aka: form inputs, typeahead, borg scale input, measure input, numeric input, search box, chips selector, video frame range input | where: main/components/inputs | ctx: modules/main/components/inputs.md
main/components/tables | aka: report table, scoring table, employee table, organizations table, score display strategy | where: main/components/tables | ctx: modules/main/components/tables.md
main/components/dialogs | aka: shared dialogs, confirmation dialog, countdown dialog, org unit dialog | where: main/components/dialogs | ctx: modules/main/components/dialogs.md
main/components/datadisplays | aka: data displays, gauges, charts | where: main/components/datadisplays | ctx: modules/main/components/datadisplays/overview.md
main/directives | aka: shared directives, sticky, display if, hidden from viewer, shared view | where: main/directives | ctx: modules/main/directives.md
main/features | aka: feature slices, domain features | where: main/features | ctx: modules/main/features/overview.md
main/features/score-types | aka: score types, assessment tools, one slice per score type | where: main/features/score-types | ctx: modules/main/features/score-types/overview.md
main/features/risk-management | aka: tasks, ergo phases | where: main/features/risk-management | ctx: modules/main/features/risk-management/overview.md
main/features/feature-flags | aka: unleash flags | where: main/features/feature-flags | ctx: modules/main/features/feature-flags.md
main/models | aka: global models, dtos, enums, single source of truth for types | where: main/models | ctx: modules/main/models/overview.md
main/pipes | aka: shared pipes, translate pipes, unit pipes, display pipes | where: main/pipes | ctx: modules/main/pipes.md
main/screens | aka: routable pages, pages, screens | where: main/screens | ctx: modules/main/screens/overview.md
main/services | aka: stateless api services, business services, http services | where: main/services | ctx: modules/main/services.md
main/state | aka: facades, signals state, global state | where: main/state | ctx: modules/main/state/overview.md
main/state/filters | aka: filter facades, report filters | where: main/state/filters | ctx: modules/main/state/filters.md
main/shared/modules/advanced-table | aka: advanced table, table module | where: main/shared/modules/advanced-table | ctx: modules/main/shared/modules/advanced-table/overview.md
main/utils | aka: generic helpers, number utils, zoom, queryable, forms utils | where: main/utils | ctx: modules/main/utils/overview.md, modules/main/utils/forms.md
main/scripts | aka: pre-bootstrap scripts, landing page, logos, subdomain | where: main/scripts | ctx: modules/main/scripts/overview.md, modules/main/scripts/components.md
main/core/i18n | aka: i18n provider, http loader | where: main/core/i18n | ctx: modules/main/overview.md
main/validators | aka: number validators, scoring validators, url validators, online image validators | where: main/validators | ctx: modules/main/overview.md
main/providers | aka: cva providers, parent first providers, scoped mat dialog, org scoped providers | where: main/providers | ctx: modules/main/overview.md
main/environments | aka: environment config, web-dev | where: main/environments | ctx: modules/main/overview.md
main/features/score-types/shared | aka: code shared by all score types | where: main/features/score-types/shared | ctx: modules/main/features/score-types/shared/overview.md
main/features/score-types/est/models | aka: est dto, est form, est form data, est score entity | where: main/features/score-types/est/models/est-score | ctx: modules/main/features/score-types/est/models/est-score/overview.md, modules/main/features/score-types/est/models/est-score/entity.md
main/features/score-types/ge-adv/models | aka: ge-adv dto, form, form data, i18n keys, mappers, shared models | where: main/features/score-types/ge-adv/models | ctx: modules/main/features/score-types/ge-adv/models/overview.md
main/features/score-types/ge-adv/services | aka: ge-adv api, scoring, form, telemetry, warnings, wizard navigation, progress saving, auto launch | where: main/features/score-types/ge-adv | ctx: modules/main/features/score-types/ge-adv/services.md
main/features/score-types/gm-rfc/models | aka: gm-rfc enums, ai dto, force, posture, environment, repetition forms | where: main/features/score-types/gm-rfc | ctx: modules/main/features/score-types/gm-rfc/models.md
main/features/score-types/nom/shared | aka: nom constants, nom models, nom validators, nom wizards | where: main/features/score-types/nom/shared | ctx: modules/main/features/score-types/nom/shared/overview.md, modules/main/features/score-types/nom/shared/constants.md

## controllers
AppComponent | aka: root component, app shell | where: main/screens/app/app.component.ts | ctx: modules/main/screens/app/overview.md
APP_ROUTES | aka: app routing, top level routes, routes | where: main/screens/app/app.routes.ts | ctx: modules/main/screens/app/overview.md
sitemap | aka: breadcrumb resolver, site map nodes | where: main/screens/app/constants/site-map.ts | ctx: modules/main/screens/app/overview.md
LayoutComponent | aka: page layout | where: main/screens/app/layout/layout.component.ts | ctx: modules/main/screens/app/overview.md
GdprBannerComponent | aka: gdpr banner, cookie consent | where: main/screens/app/gdpr-banner/gdpr-banner.component.ts | ctx: modules/main/screens/app/overview.md
LogoutIdleDirective | aka: idle logout, session timeout | where: main/screens/app/logout-idle/logout-idle.directive.ts | ctx: modules/main/screens/app/overview.md
VersionSyncBannerComponent | aka: new version banner | where: main/screens/app/version-sync-banner/version-sync-banner.component.ts | ctx: modules/main/screens/app/overview.md
NavHeaderComponent | aka: top navigation bar | where: main/screens/app/nav-header/nav-header.component.ts | ctx: modules/main/screens/app/nav-header/overview.md
NavLinksService | aka: navigation links, menu items | where: main/screens/app/nav-header/services/nav-links.service.ts | ctx: modules/main/screens/app/nav-header/overview.md
BreadcrumbsComponent | aka: breadcrumbs, page trail | where: main/screens/app/nav-header/components/breadcrumbs/breadcrumbs.component.ts | ctx: modules/main/screens/app/nav-header/components.md
ProfileDropdownComponent | aka: profile menu, user menu, language menu item, unit system menu item | where: main/screens/app/nav-header/components/profile-dropdown/profile-dropdown.component.ts | ctx: modules/main/screens/app/nav-header/components.md
ReportComponent | aka: report page | where: main/screens/report/report.component.ts | ctx: modules/main/screens/report/overview.md
REPORT_ROUTES | aka: report routes | where: main/screens/report/report.routes.ts | ctx: modules/main/screens/report/overview.md
reportResolver | aka: load report | where: main/screens/report/report.resolver.ts | ctx: modules/main/screens/report/overview.md
ReportAssessmentsService | aka: report assessments | where: main/screens/report/services/report-assessments.service.ts | ctx: modules/main/screens/report/overview.md
ReportExportService | aka: export report | where: main/screens/report/services/report-export.service.ts | ctx: modules/main/screens/report/overview.md
ReportShareService | aka: share report | where: main/screens/report/services/report-share.service.ts | ctx: modules/main/screens/report/overview.md
ReportScoreTypesService | aka: score types of report | where: main/screens/report/services/report-score-types.service.ts | ctx: modules/main/screens/report/overview.md
ReportComparisonQueueService | aka: comparison queue, compare reports | where: main/screens/report/services/report-comparison-queue.service.ts | ctx: modules/main/screens/report/overview.md
AssessmentDialogService | aka: open assessment dialog, assessment wizard answer | where: main/screens/report/components/assessment-dialog/services/assessment-dialog.service.ts | ctx: modules/main/screens/report/components.md
AssessmentTypeDialogComponent | aka: pick assessment type dialog | where: main/screens/report/components/assessment-dialog/assessment-type-dialog/assessment-type-dialog.component.ts | ctx: modules/main/screens/report/components.md
ManualAssessmentDialogComponent | aka: manual assessment dialog | where: main/screens/report/components/assessment-dialog/manual-assessment-dialog/manual-assessment-dialog.component.ts | ctx: modules/main/screens/report/components.md
FindRightAssessmentComponent | aka: find right assessment, which tool to use | where: main/screens/report/components/find-right-assessment/find-right-assessment.component.ts | ctx: modules/main/screens/report/components.md
AddNewAssessmentTypeDialogComponent | aka: add assessment type dialog | where: main/screens/report/components/new-assessment-type-dialog/new-assessment-type-dialog.component.ts | ctx: modules/main/screens/report/components.md
ToolTypeFilterService | aka: disabled tool types, tool type disabled reason | where: main/screens/report/components/new-assessment-type-dialog/tooltype-filter.service.ts | ctx: modules/main/screens/report/components.md
ReportBodyPartAnalysisComponent | aka: body part analysis | where: main/screens/report/components/body-part-analysis/report-body-part-analysis.component.ts | ctx: modules/main/screens/report/components.md
ReportPotentialSolutionsComponent | aka: potential solutions on report | where: main/screens/report/components/potential-solutions/report-potential-solutions.component.ts | ctx: modules/main/screens/report/components.md
ReportsListComponent | aka: reports list page, assessments list | where: main/screens/reports-list-new/reports-list.component.ts | ctx: modules/main/screens/reports-list-new/overview.md
REPORT_LIST_ROUTES | aka: reports list routes | where: main/screens/reports-list-new/reports-list.routes.ts | ctx: modules/main/screens/reports-list-new/overview.md
AssessmentsPermissionsService | aka: who can edit assessments, permissions | where: main/screens/reports-list-new/services/assessments-permissions.service.ts | ctx: modules/main/screens/reports-list-new/overview.md
AssessmentsEditReportService | aka: edit assessment from list | where: main/screens/reports-list-new/services/assessments-edit-report.service.ts | ctx: modules/main/screens/reports-list-new/overview.md
AssessmentsComparisonQueueService | aka: comparison queue from list | where: main/screens/reports-list-new/services/assessments-comparison-queue.service.ts | ctx: modules/main/screens/reports-list-new/overview.md
AssessmentsRowMapper | aka: row mapping, score columns descriptors | where: main/screens/reports-list-new/table/services/assessments-row.mapper.ts | ctx: modules/main/screens/reports-list-new/table.md
createAssessmentsTableColumns | aka: assessments table columns, est columns, nom columns, score columns, general columns, context columns | where: main/screens/reports-list-new/table/columns | ctx: modules/main/screens/reports-list-new/table.md
createAssessmentsTableViews | aka: assessments table views | where: main/screens/reports-list-new/table/views/assessments-table.views.ts | ctx: modules/main/screens/reports-list-new/table.md
UploadComponent | aka: upload page, upload wizard | where: main/screens/upload/upload.component.ts | ctx: modules/main/screens/upload.md
VideoAssessmentComponent | aka: video assessment, record video | where: main/screens/upload/video-assessment/video-assessment.component.ts | ctx: modules/main/screens/upload.md
ManualAssessmentComponent | aka: manual assessment on upload | where: main/screens/upload/manual-assessment/manual-assessment.component.ts | ctx: modules/main/screens/upload.md
UPLOAD_ROUTES | aka: upload routes | where: main/screens/upload/upload.routes.ts | ctx: modules/main/screens/upload.md
resolveUploadTask | aka: upload task resolver | where: main/screens/upload/resolvers/upload-task.resolver.ts | ctx: modules/main/screens/upload.md
UploadPreviewComponent | aka: video preview | where: main/screens/upload/components/upload-preview/upload-preview.component.ts | ctx: modules/main/screens/upload.md
CaptureGuidelinesComponent | aka: capture guidelines, recording tips | where: main/screens/upload/components/capture-guidelines/capture-guidelines.component.ts | ctx: modules/main/screens/upload.md
AnalyticsDashboard | aka: analytics dashboard component | where: main/screens/analytics/AnalyticsDashboard.component.ts | ctx: modules/main/screens/overview.md
AnalyticsDashboardFacade | aka: analytics dashboard state | where: main/screens/analytics/analytics-dashboard.facade.ts | ctx: modules/main/screens/overview.md
ANALYTICS_DASHBOARD_ROUTES | aka: analytics routes | where: main/screens/analytics/analytics-dashboard.routes.ts | ctx: modules/main/screens/overview.md
CompareComponent | aka: compare page | where: main/screens/compare/compare.component.ts | ctx: modules/main/screens/overview.md
EmployeeComponent | aka: employee page | where: main/screens/employee/employee.component.ts | ctx: modules/main/screens/overview.md
EmployeesListComponent | aka: employees list page | where: main/screens/employees-list/employees-list.component.ts | ctx: modules/main/screens/overview.md
EMPLOYEES_LIST_ROUTES | aka: employees routes | where: main/screens/employees-list/employees-list.routes.ts | ctx: modules/main/screens/overview.md
LoginComponent | aka: login page, sign in | where: main/screens/login/login.component.ts | ctx: modules/main/screens/overview.md
ForgotPasswordComponent | aka: forgot password, reset password | where: main/screens/forgotPassword/forgotPassword.component.ts | ctx: modules/main/screens/overview.md
OktaCallbackComponent | aka: okta sso callback | where: main/screens/oktaCallback/oktaCallback.component.ts | ctx: modules/main/screens/overview.md
ClientAuthComponent | aka: client auth | where: main/screens/client-auth/client-auth.component.ts | ctx: modules/main/screens/overview.md
HelpComponent | aka: help page | where: main/screens/help/help.component.ts | ctx: modules/main/screens/overview.md
LearnComponent | aka: learn page | where: main/screens/learn/learn.component.ts | ctx: modules/main/screens/overview.md
OrgAdminComponent | aka: org admin page | where: main/screens/org-admin/org-admin.component.ts | ctx: modules/main/screens/org-admin.md
OrgSettingsComponent | aka: org settings, assessment settings, ergonomic tools settings, privacy settings, system settings | where: main/screens/org-admin/org-settings | ctx: modules/main/screens/org-admin.md
AdminHierarchyComponent | aka: hierarchy admin, hierarchy level, locations tree | where: main/screens/org-admin/admin-hierarchy | ctx: modules/main/screens/org-admin.md
RegisteredUsersComponent | aka: users admin, registered users | where: main/screens/org-admin/registered-users/registered-users.component.ts | ctx: modules/main/screens/org-admin.md
ThresholdSettingsComponent | aka: threshold settings, adjustable thresholds | where: main/screens/org-admin/threshold-settings/threshold-settings.component.ts | ctx: modules/main/screens/org-admin.md
ToolTypesComponent | aka: tool types admin, enabled tools | where: main/screens/org-admin/tool-types/tool-types.component.ts | ctx: modules/main/screens/org-admin.md
WhiteLabelingFormContextComponent | aka: white labeling form, branding form | where: main/screens/org-admin/white-labeling-configurator/white-labeling-form-context/white-labeling-form-context.component.ts | ctx: modules/main/screens/org-admin.md
TASKS_ROUTES | aka: task routes | where: main/features/risk-management/tasks/tasks.routes.ts | ctx: modules/main/features/risk-management/tasks/overview.md
TaskApiService | aka: task api, create task, update task | where: main/features/risk-management/tasks/services/task-api.service.ts | ctx: modules/main/features/risk-management/tasks/overview.md
TaskFacade | aka: task state | where: main/features/risk-management/tasks/services/task.facade.ts, main/features/risk-management/tasks/pages/task-detail/task.facade.ts | ctx: modules/main/features/risk-management/tasks/overview.md, modules/main/features/risk-management/tasks/pages/task-detail.md
TaskListFacade | aka: task list state | where: main/features/risk-management/tasks/services/task-list.facade.ts | ctx: modules/main/features/risk-management/tasks/overview.md
TaskListPageComponent | aka: task list page, task table | where: main/features/risk-management/tasks/pages/task-list | ctx: modules/main/features/risk-management/tasks/pages/overview.md
TaskDetailPageComponent | aka: task detail page | where: main/features/risk-management/tasks/pages/task-detail/task-detail-page.component.ts | ctx: modules/main/features/risk-management/tasks/pages/task-detail.md
TaskWizardComponent | aka: task wizard, create task wizard | where: main/features/risk-management/tasks/components/task-wizard/task-wizard.component.ts | ctx: modules/main/features/risk-management/tasks/components/task-wizard.md
TaskDialogComponent | aka: task dialog, create task dialog, edit task dialog | where: main/features/risk-management/tasks/components/task-dialog/task-dialog.component.ts | ctx: modules/main/features/risk-management/tasks/components/overview.md
TaskInputComponent | aka: task input, task picker | where: main/features/risk-management/tasks/components/task-input/task-input.component.ts | ctx: modules/main/features/risk-management/tasks/components/overview.md
ErgoPhaseListFacade | aka: ergo phase list state | where: main/features/risk-management/ergo-phases/services/ergo-phase-list.facade.ts | ctx: modules/main/features/risk-management/overview.md
FeatureFlagGuard | aka: route guard by feature flag | where: main/features/feature-flags/guards/feature-flag.guard.ts | ctx: modules/main/features/feature-flags.md
FeatureFlagsFacade | aka: feature flags state | where: main/features/feature-flags/state/feature-flags.facade.ts | ctx: modules/main/features/feature-flags.md
ChatkitEditorComponent | aka: chatkit editor | where: main/features/ai-custom-solutions/components/chatkit-editor/chatkit-editor.component.ts | ctx: modules/main/features/overview.md
SolutionsAccordionsComponent | aka: solutions accordions, top three factors | where: main/features/potential-solutions/components/solutions-accordions/solutions-accordions.component.ts | ctx: modules/main/features/overview.md
HALUsageReportService | aka: hal usage report | where: main/features/hal-counter/components/hal-usage-report/hal-usage-report.service.ts | ctx: modules/main/features/overview.md
ESTWizardComponent | aka: est wizard | where: main/features/score-types/est/components/wizard | ctx: modules/main/features/score-types/est/components/wizard/overview.md
ESTScoreCardComponent | aka: est score card | where: main/features/score-types/est/components/score-card/est-score-card.component.ts | ctx: modules/main/features/score-types/est/components/score-card/overview.md
ESTScoreDetailComponent | aka: est score detail | where: main/features/score-types/est/components/score-card/score-detail/est-score-detail.component.ts | ctx: modules/main/features/score-types/est/components/score-card/score-detail/overview.md
ESTScoringFacade | aka: est scoring state | where: main/features/score-types/est | ctx: modules/main/features/score-types/est/overview.md
ESTApiService | aka: est api, generate est | where: main/features/score-types/est | ctx: modules/main/features/score-types/est/overview.md
ESTWizardNavigationService | aka: est wizard navigation, steps | where: main/features/score-types/est | ctx: modules/main/features/score-types/est/overview.md
GeAdvWizardComponent | aka: ge-adv wizard | where: main/features/score-types/ge-adv/components/wizard | ctx: modules/main/features/score-types/ge-adv/components/wizard/overview.md
GeAdvScoreCardComponent | aka: ge-adv score card | where: main/features/score-types/ge-adv/components/score-card | ctx: modules/main/features/score-types/ge-adv/components/score-card/overview.md
GeAdvFacade | aka: ge-adv state | where: main/features/score-types/ge-adv | ctx: modules/main/features/score-types/ge-adv/overview.md
GeAdvWizardAutoLaunchService | aka: auto launch ge-adv wizard | where: main/features/score-types/ge-adv | ctx: modules/main/features/score-types/ge-adv/services.md
GeAdvWizardProgressSavingService | aka: save wizard progress, draft | where: main/features/score-types/ge-adv | ctx: modules/main/features/score-types/ge-adv/services.md
GeAdvBorgScaleDialogComponent | aka: borg scale dialog, rpe | where: main/features/score-types/ge-adv/components/wizard | ctx: modules/main/features/score-types/ge-adv/components/wizard/shared.md
GeAdvVlmStatusComponent | aka: ge-adv vlm status | where: main/features/score-types/ge-adv/components | ctx: modules/main/features/score-types/ge-adv/components/overview.md
GmRfcForceThresholdsService | aka: force thresholds | where: main/features/score-types/gm-rfc | ctx: modules/main/features/score-types/gm-rfc/overview.md
HalFacade | aka: hal state | where: main/features/score-types/hal | ctx: modules/main/features/score-types/hal/overview.md
HALMathService | aka: hal math, factor contributions | where: main/features/score-types/hal | ctx: modules/main/features/score-types/hal/overview.md
LmCarryDialogsService | aka: carry dialogs | where: main/features/score-types/lm-carry | ctx: modules/main/features/score-types/lm-carry/overview.md
LmLiftDialogsService | aka: lift dialogs | where: main/features/score-types/lm-lift | ctx: modules/main/features/score-types/lm-lift/overview.md
LmLowerDialogsService | aka: lower dialogs | where: main/features/score-types/lm-lower | ctx: modules/main/features/score-types/lm-lower/overview.md
LmPushPullDialogsService | aka: push pull dialogs | where: main/features/score-types/lm-push-pull | ctx: modules/main/features/score-types/lm-push-pull/overview.md
NioshWizardComponent | aka: niosh wizard | where: main/features/score-types/niosh/components | ctx: modules/main/features/score-types/niosh/components.md
NioshScoringService | aka: niosh scoring | where: main/features/score-types/niosh | ctx: modules/main/features/score-types/niosh/overview.md
BirpGraphComponent | aka: birp graph, niosh graph | where: main/features/score-types/niosh/components | ctx: modules/main/features/score-types/niosh/components.md
NomWizardComponent | aka: nom wizard | where: main/features/score-types/nom | ctx: modules/main/features/score-types/nom/overview.md
NomScoringService | aka: nom scoring | where: main/features/score-types/nom | ctx: modules/main/features/score-types/nom/overview.md
NomScoreCardComponent | aka: nom score card | where: main/features/score-types/nom/components | ctx: modules/main/features/score-types/nom/components/score-card.md
RsiWizardComponent | aka: rsi wizard | where: main/features/score-types/rsi/components | ctx: modules/main/features/score-types/rsi/components.md
RebaWizardComponent | aka: reba wizard | where: main/features/score-types/rula-reba/reba/components | ctx: modules/main/features/score-types/rula-reba/reba/components/overview.md
RulaWizardComponent | aka: rula wizard | where: main/features/score-types/rula-reba/rula/components | ctx: modules/main/features/score-types/rula-reba/rula/components/overview.md
CompositeRankWizardComponent | aka: composite rank wizard, handled loads wizard | where: main/features/score-types/composite-rank/components/wizard | ctx: modules/main/features/score-types/composite-rank.md
CompositeRankScoreCardComponent | aka: composite rank score card, joint analysis | where: main/features/score-types/composite-rank/components/score-card | ctx: modules/main/features/score-types/composite-rank.md
CompositeRankFacade | aka: composite rank state | where: main/features/score-types/composite-rank/state/composite-rank.facade.ts | ctx: modules/main/features/score-types/composite-rank.md
ScoreCardContainerComponent | aka: score card container, edit score type button, delete score type button | where: main/features/score-types/shared | ctx: modules/main/features/score-types/shared/components.md
WizardAutoLaunchService | aka: wizard auto launch, wizard redirects | where: main/features/score-types/shared | ctx: modules/main/features/score-types/shared/services.md
FormProgressSavingService | aka: form drafts, save progress | where: main/features/score-types/shared | ctx: modules/main/features/score-types/shared/services.md
WizardNavigationService | aka: wizard map, step navigation | where: main/features/score-types/shared | ctx: modules/main/features/score-types/shared/services.md
ScoreTypeDialogService | aka: open score type dialog | where: main/features/score-types/shared | ctx: modules/main/features/score-types/shared/services.md
AdvancedTableComponent | aka: advanced table, data grid | where: main/shared/modules/advanced-table/advanced-table.component.ts | ctx: modules/main/shared/modules/advanced-table/overview.md
AdvancedTableColumnManagerComponent | aka: column manager, show hide columns | where: main/shared/modules/advanced-table/components/column-manager | ctx: modules/main/shared/modules/advanced-table/components.md
AdvancedTableManageViewsDialogComponent | aka: manage views dialog, saved views | where: main/shared/modules/advanced-table/components/view-dialogs | ctx: modules/main/shared/modules/advanced-table/components.md
AdvancedTableGlobalSearchComponent | aka: table search | where: main/shared/modules/advanced-table/components/global-search | ctx: modules/main/shared/modules/advanced-table/components.md
AdvancedTableFilterService | aka: table filtering | where: main/shared/modules/advanced-table/services/advanced-table-filter | ctx: modules/main/shared/modules/advanced-table/overview.md
ReportTableComponent | aka: report table | where: main/components/tables/report-table/report-table.component.ts | ctx: modules/main/components/tables.md
ScoreDisplayStrategyFactory | aka: score display strategy, score column display | where: main/components/tables/report-table/score-display | ctx: modules/main/components/tables.md
ScoringTableComponent | aka: scoring table, data table help button | where: main/components/tables/scoring-table/scoring-table.component.ts | ctx: modules/main/components/tables.md
UserTableComponent | aka: user table | where: main/components/tables/user-table/user-table.component.ts | ctx: modules/main/components/tables.md
EditUserDialog | aka: edit user dialog | where: main/components/tables/user-table/edit-user-dialog/edit-user-dialog.component.ts | ctx: modules/main/components/tables.md
AssessmentsDialog | aka: assessments dialog | where: main/components/dialogs/AssessmentsDialog/AssessmentsDialog.component.ts | ctx: modules/main/components/dialogs.md
AssessmentsDialogFiltersFacade | aka: assessments dialog filters | where: main/components/dialogs/AssessmentsDialog/report-table-context/assessment-dialog-filters.facade.ts | ctx: modules/main/components/dialogs.md
EditAssessmentModalComponent | aka: edit assessment modal | where: main/components/dialogs/edit-assessment-modal/edit-assessment-modal.component.ts | ctx: modules/main/components/dialogs.md
ExportExcelReportDialog | aka: export excel dialog | where: main/components/dialogs/export-excel-report-dialog/export-excel-report-dialog.component.ts | ctx: modules/main/components/dialogs.md
EmployeeDialogComponent | aka: employee dialog, add employee | where: main/components/dialogs/employee-dialog/employee-dialog.component.ts | ctx: modules/main/components/dialogs.md
OrganizationDialog | aka: organization dialog | where: main/components/dialogs/OrganizationDialog/OrganizationDialog.component.ts | ctx: modules/main/components/dialogs.md
LocationSelectDialog | aka: location picker dialog | where: main/components/dialogs/LocationSelectDialog/LocationSelectDialog.component.ts | ctx: modules/main/components/dialogs.md
DeleteLocationDialog | aka: delete location | where: main/components/dialogs/DeleteLocationDialog/DeleteLocationDialog.component.ts | ctx: modules/main/components/dialogs.md
ConfirmationDialog | aka: confirm dialog | where: main/components/dialogs/ConfirmationDialog/ConfirmationDialog.component.ts | ctx: modules/main/components/dialogs.md
BodyPartSelector | aka: body part selector | where: main/components/ui/BodyPartSelector/BodyPartSelector.component.ts | ctx: modules/main/components/ui/overview.md
HierarchyFilter | aka: hierarchy filter, location filter | where: main/components/ui/HierarchyFilter, main/components/ui/HierarchyFilters | ctx: modules/main/components/ui/overview.md
WizardDialogWrapperComponent | aka: wizard dialog wrapper | where: main/components/ui/wizard-dialog-wrapper/wizard-dialog-wrapper.component.ts | ctx: modules/main/components/ui/overview.md
EditableVideoPlayerComponent | aka: video player, frame timing | where: main/components/ui/video/editable-video-player/editable-video-player.component.ts | ctx: modules/main/components/ui/overview.md
HelpButtonComponent | aka: help button, help icon | where: main/components/ui/help/HelpButton.component.ts | ctx: modules/main/components/ui/overview.md
AlertComponent | aka: alert, banner, notification box | where: main/components/ui/alert/alert.component.ts | ctx: modules/main/components/ui/overview.md
AccordionStepperComponent | aka: accordion stepper | where: main/components/ui/steppers/accordion-stepper | ctx: modules/main/components/ui/steppers.md
StepperSelectionTrackerService | aka: stepper selection | where: main/components/ui/steppers/services/stepper-selection-tracker.service.ts | ctx: modules/main/components/ui/steppers.md
TypeaheadInputComponent | aka: typeahead, autocomplete | where: main/components/inputs/typeahead-input/typeahead-input.component.ts | ctx: modules/main/components/inputs.md
BorgScaleInputComponent | aka: borg scale input | where: main/components/inputs/borg-scale-input/borg-scale-input.component.ts | ctx: modules/main/components/inputs.md
SingleMeasureInputComponent | aka: measure input, unit input | where: main/components/inputs/single-measure-input/single-measure-input.component.ts | ctx: modules/main/components/inputs.md
D3LineGraphComponent | aka: line graph | where: main/components/datadisplays/D3Components/D3LineGraph/D3LineGraph.component.ts | ctx: modules/main/components/datadisplays/D3Components.md
D3PieChartComponent | aka: pie chart | where: main/components/datadisplays/D3Components/D3PieChart/D3PieChart.component.ts | ctx: modules/main/components/datadisplays/D3Components.md
D3SunburstChartComponent | aka: sunburst chart | where: main/components/datadisplays/D3Components/d3-sunburst-chart/d3-sunburst-chart.component.ts | ctx: modules/main/components/datadisplays/D3Components.md
D3RiskGraphComponent | aka: risk graph | where: main/components/datadisplays/D3Components/D3RiskGraph/D3RiskGraph.component.ts | ctx: modules/main/components/datadisplays/D3Components.md
RiskGaugeComponent | aka: risk gauge | where: main/components/datadisplays/RiskGauge/RiskGauge.component.ts | ctx: modules/main/components/datadisplays/overview.md
ScoreGaugeComponent | aka: score gauge | where: main/components/datadisplays/scores/ScoreGauge/ScoreGauge.component.ts | ctx: modules/main/components/datadisplays/overview.md
AuthFacade | aka: auth state, login state | where: main/state/auth.facade.ts | ctx: modules/main/state/overview.md
ReportFacade | aka: report state | where: main/state/report.facade.ts | ctx: modules/main/state/overview.md
ReportListFacade | aka: report list state | where: main/state/report-list.facade.ts | ctx: modules/main/state/overview.md
OrgFacade | aka: organization state, tool type options | where: main/state/org.facade.ts | ctx: modules/main/state/overview.md
OrgStructureFacade | aka: org structure, hierarchy levels state | where: main/state/org-structure.facade.ts | ctx: modules/main/state/overview.md
LocationsFacade | aka: locations state, related assessments | where: main/state/locations.facade.ts | ctx: modules/main/state/overview.md
UserFacade | aka: user state | where: main/state/user.facade.ts | ctx: modules/main/state/overview.md
EmployeeFacade | aka: employee state | where: main/state/employee.facade.ts | ctx: modules/main/state/overview.md
TableViewsFacade | aka: table views state | where: main/state/table-views.facade.ts | ctx: modules/main/state/overview.md
ScoringFacade | aka: scoring state | where: main/state/scoring.facade.ts | ctx: modules/main/state/overview.md
GdprFacade | aka: gdpr consent state | where: main/state/gdpr.facade.ts | ctx: modules/main/state/overview.md
LanguageFacade | aka: language state | where: main/state/language.facade.ts | ctx: modules/main/state/overview.md
AnalyticsFacade | aka: analytics state | where: main/state/analytics.facade.ts | ctx: modules/main/state/overview.md
FilteredReportsFacade | aka: filtered reports | where: main/state/filters/filtered-reports.facade.ts | ctx: modules/main/state/filters.md
ResetFiltersService | aka: reset filters button | where: main/state/filters/reset-filters.service.ts | ctx: modules/main/state/filters.md
AuthService | aka: login api, auth api | where: main/services/auth.service.ts | ctx: modules/main/services.md
ReportService | aka: report api | where: main/services/report.service.ts | ctx: modules/main/services.md
EmployeeService | aka: employee api | where: main/services/employee.service.ts | ctx: modules/main/services.md
OrganizationService | aka: organization api | where: main/services/organization.service.ts | ctx: modules/main/services.md
OrgUnitService | aka: org unit api, location api | where: main/services/orgUnit.service.ts | ctx: modules/main/services.md
HierarchyService | aka: hierarchy api | where: main/services/hierarchy.service.ts | ctx: modules/main/services.md
AnalyticsService | aka: analytics api | where: main/services/analytics.service.ts | ctx: modules/main/services.md
ScoringService | aka: scoring api | where: main/services/scoring.service.ts | ctx: modules/main/services.md
UploadService | aka: upload api, video upload | where: main/services/upload.service.ts | ctx: modules/main/services.md
NotificationService | aka: toast, snackbar, notifications | where: main/services/notification.service.ts | ctx: modules/main/services.md
AppDialogService | aka: open dialog | where: main/services/dialog.service.ts | ctx: modules/main/services.md
NavigationService | aka: breadcrumb matching | where: main/services/navigation.service.ts | ctx: modules/main/services.md
NoteService | aka: notes api | where: main/services/note.service.ts | ctx: modules/main/services.md
TableViewsApiService | aka: saved table views api | where: main/services/table-views-api.service.ts | ctx: modules/main/services.md
CorityService | aka: cority integration | where: main/services/cority.service.ts | ctx: modules/main/services.md
SentryService | aka: error tracking | where: main/services/sentry.service.ts | ctx: modules/main/services.md
VersionService | aka: app version | where: main/services/version.service.ts | ctx: modules/main/services.md
FormattersService | aka: locale formatting | where: main/services/formatters.service.ts | ctx: modules/main/services.md
LanguageSettingsService | aka: language settings | where: main/services/language-settings.service.ts | ctx: modules/main/services.md
SubDomainService | aka: subdomain | where: main/services/sub-domain.service.ts | ctx: modules/main/services.md
ReportEventsService | aka: report status updated event | where: main/services/report-events.service.ts | ctx: modules/main/services.md
IfToolTypeEnabledDirective | aka: show if tool enabled | where: main/directives/if-tooltype-enabled.directive.ts | ctx: modules/main/directives.md
HiddenFromViewerDirective | aka: hide from viewer, read only user | where: main/directives/hidden-from-viewer.directive.ts | ctx: modules/main/directives.md
HiddenInSharedViewDirective | aka: hide in shared view | where: main/directives/hidden-in-shared-view.directive.ts | ctx: modules/main/directives.md
WhiteLabelingDirective | aka: branding directive | where: main/directives/white-labeling-directive.ts | ctx: modules/main/directives.md
DisplayIfDirective | aka: conditional display | where: main/directives/display-if.directive.ts | ctx: modules/main/directives.md
ScoringValidatorService | aka: cycle time validation, frequency validation | where: main/validators/scoring.validators.ts | ctx: modules/main/overview.md
SubdomainService | aka: pre-bootstrap subdomain | where: main/scripts/services/subdomain.service.js | ctx: modules/main/scripts/overview.md
LandingPage | aka: landing page web component | where: main/scripts/components/landing-page/landing-page.js | ctx: modules/main/scripts/components.md

## models
Report | aka: report dto, report id, create report, update report | where: main/models/Report.ts | ctx: modules/main/models/overview.md
Scoring | aka: body side, hand used, yes or no, wizard unit selection | where: main/models/Scoring.ts | ctx: modules/main/models/overview.md
Analytics | aka: ranked joint scores, chart colors, score type, score type translation keys, filter type | where: main/models/Analytics.ts | ctx: modules/main/models/overview.md
OrgUnit | aka: location, hierarchy level, org unit fields | where: main/models/OrgUnit.ts | ctx: modules/main/models/overview.md
Organization | aka: org, ergonomic tools, restrictions, auto launched screening tools, adjustable thresholds, blur type, unit system | where: main/models/Organization.ts | ctx: modules/main/models/overview.md
Auth | aka: role, reset method, password credentials, login model | where: main/models/Auth.ts | ctx: modules/main/models/overview.md
Employee | aka: employee fields, employee report counts, employee table columns | where: main/models/Employee.ts | ctx: modules/main/models/overview.md
User | aka: user dto, user setting | where: main/models/User.ts | ctx: modules/main/models/overview.md
table-settings | aka: sorting, page size, pagination | where: main/models/table-settings.ts | ctx: modules/main/models/overview.md
time | aka: date ranges | where: main/models/time.ts | ctx: modules/main/models/overview.md
threshold-cutpoints | aka: thresholds, cut points, angle selection, plane of motion, color from threshold | where: main/models/json-structures/thresholds-cutpoints/threshold-cutpoints.model.ts | ctx: modules/main/models/overview.md
ml-data json | aka: angles json, torque json, speed json, angle keys, muscle translation keys | where: main/models/json-structures/ml-data | ctx: modules/main/models/overview.md
conversions | aka: pounds per kilo, feet per meter, cm per inch | where: main/models/conversions.ts | ctx: modules/main/models/overview.md
Confidence types | aka: confident flag, binary confidence, confidence percentage, confidence key, MIN_CONFIDENCE_PERCENTAGE | where: main/models/confidence | ctx: modules/main/models/confidence.md
LengthUnit | aka: length units, weight unit, force unit, duration unit, frequency unit, angle unit, speed unit, percentage unit | where: main/models/units | ctx: modules/main/models/units.md
UnitConverter | aka: unit conversion rule, compound measure | where: main/models/units | ctx: modules/main/models/units.md
TaskDto | aka: task payload, task id, task model | where: main/features/risk-management/tasks/models | ctx: modules/main/features/risk-management/tasks/overview.md
TaskForm | aka: task form data, task details form, task org context form | where: main/features/risk-management/tasks/components/task-wizard | ctx: modules/main/features/risk-management/tasks/components/task-wizard.md
ErgoPhase | aka: ergo phase id, initial phase, reassessment phase | where: main/features/risk-management/ergo-phases/models/ergo-phase.model.ts | ctx: modules/main/features/risk-management/overview.md
Task events | aka: task current state report updated, task ergo phase updated | where: main/features/risk-management/tasks/events | ctx: modules/main/features/risk-management/tasks/overview.md
FeatureFlag | aka: feature flags list, flag names | where: main/features/feature-flags/models/feature-flag.ts | ctx: modules/main/features/feature-flags.md
VlmScoreTypesData | aka: vlm effort, vlm status | where: main/features/vlm/models/vlm-data.model.ts | ctx: modules/main/features/overview.md
BioMechanicalDataDTO | aka: joint keys, joint torque | where: main/features/bio-mechanical-data/models/bio-mechanical-data.model.ts | ctx: modules/main/features/overview.md
JkhExportRequest | aka: jkh export form, jkh hand position | where: main/features/exports/jkh/models/jkh-export.model.ts | ctx: modules/main/features/overview.md
ReportScoreType | aka: score type of report | where: main/screens/report/models/report-score-type.model.ts | ctx: modules/main/screens/report/overview.md
AssessmentRow | aka: assessments table row, assessment status, assessment badge | where: main/screens/reports-list-new/table/models/assessments-row.model.ts | ctx: modules/main/screens/reports-list-new/table.md
AdvancedTableView | aka: table view, view payload, view settings, view draft | where: main/shared/modules/advanced-table/models/advanced-table-view.model.ts | ctx: modules/main/shared/modules/advanced-table/overview.md
AdvancedTableFilter | aka: filter variant, sort direction, selection state, date range value | where: main/shared/modules/advanced-table/models/advanced-table-filter.model.ts | ctx: modules/main/shared/modules/advanced-table/overview.md
AdvancedTableColumn | aka: column meta, column layout, column manager entry | where: main/shared/modules/advanced-table/models/advanced-table-column.model.ts | ctx: modules/main/shared/modules/advanced-table/overview.md
ColumnSpec | aka: column spec, value column, display column | where: main/shared/modules/advanced-table/factories/models/advanced-table-column-spec.model.ts | ctx: modules/main/shared/modules/advanced-table/overview.md
Filter state | aka: IFilter, IReportFilter, report pagination state, report sorting state | where: main/state/filters | ctx: modules/main/state/filters.md
ESTScore | aka: est score entity, est score dto, est demographics, est hands, est neck, est lift task, est material handling | where: main/features/score-types/est/models/est-score | ctx: modules/main/features/score-types/est/models/est-score/overview.md
ESTPostureScale | aka: posture scale, body part, movement type, magnitude | where: main/features/score-types/est/models/est-score | ctx: modules/main/features/score-types/est/models/est-score/overview.md
GeAdvDto | aka: ge-adv dto, scoring data, precomputed, submitted, processed, ai data | where: main/features/score-types/ge-adv/models/dto | ctx: modules/main/features/score-types/ge-adv/models/dto.md
GeAdvFormData | aka: ge-adv form data, ge-adv form | where: main/features/score-types/ge-adv/models | ctx: modules/main/features/score-types/ge-adv/models/form-data.md, modules/main/features/score-types/ge-adv/models/form.md
GeAdv i18n keys | aka: i18n key definitions, translation keys for ge-adv | where: main/features/score-types/ge-adv/models | ctx: modules/main/features/score-types/ge-adv/models/i18n.md
GeAdv mappers | aka: dto to form mapping, form to dto | where: main/features/score-types/ge-adv/models | ctx: modules/main/features/score-types/ge-adv/models/mappers.md
GeAdv shared models | aka: ai value state, concern level, force data, borg scale, body parts side keys | where: main/features/score-types/ge-adv/models | ctx: modules/main/features/score-types/ge-adv/models/shared.md
GM-RFC enums | aka: rfc region, time on job, initial analysis reason, body region of concern, power source, contact stress | where: main/features/score-types/gm-rfc | ctx: modules/main/features/score-types/gm-rfc/models.md
GM-RFC forms | aka: force form, posture form, environment form, repetition form, ai dto | where: main/features/score-types/gm-rfc | ctx: modules/main/features/score-types/gm-rfc/models.md
HALInputs | aka: hal score, hal manual override form, hal scoring data | where: main/features/score-types/hal | ctx: modules/main/features/score-types/hal/overview.md
LmCarry | aka: carry data, carry fields, carry inputs | where: main/features/score-types/lm-carry | ctx: modules/main/features/score-types/lm-carry/overview.md
LmLift | aka: lift data, lift fields, lift inputs | where: main/features/score-types/lm-lift | ctx: modules/main/features/score-types/lm-lift/overview.md
LmLower | aka: lower data, lower fields, lower inputs | where: main/features/score-types/lm-lower | ctx: modules/main/features/score-types/lm-lower/overview.md
LmPushPull | aka: push pull data, push pull effort inputs | where: main/features/score-types/lm-push-pull | ctx: modules/main/features/score-types/lm-push-pull/overview.md
NioshData | aka: niosh score model, niosh payload, niosh effort inputs, birp organization settings | where: main/features/score-types/niosh | ctx: modules/main/features/score-types/niosh/overview.md
NOM data | aka: nom general data, nom tasks, nom lift data, nom carry data, nom push pull data, nom factor score, nom score card | where: main/features/score-types/nom/shared | ctx: modules/main/features/score-types/nom/shared/models.md
NOM constants | aka: nom thresholds, work conditions, wizard step names, risk level, push pull types, general data age group, sex | where: main/features/score-types/nom/shared | ctx: modules/main/features/score-types/nom/shared/constants.md
Rsi | aka: rsi inputs, rsi score, cosi data, hand inputs | where: main/features/score-types/rsi | ctx: modules/main/features/score-types/rsi/overview.md
Reba | aka: reba model, reba flexion, user inputs, effort data | where: main/features/score-types/rula-reba/reba | ctx: modules/main/features/score-types/rula-reba/reba/overview.md
Rula | aka: rula model, muscle use option, wrist controls | where: main/features/score-types/rula-reba/rula | ctx: modules/main/features/score-types/rula-reba/rula/overview.md
RulaReba | aka: rula reba model, computed pose data, pose type, body movement | where: main/features/score-types/rula-reba | ctx: modules/main/features/score-types/rula-reba/shared.md
CompositeRankData | aka: composite results, trunk ranks, shoulder ranks, neck ranks, inseer scores | where: main/features/score-types/composite-rank/models | ctx: modules/main/features/score-types/composite-rank.md
StepDetail | aka: step details, score card section | where: main/features/score-types/shared | ctx: modules/main/features/score-types/shared/overview.md
Facade | aka: state facade, signals state | where: main/state | ctx: modules/main/state/overview.md, navigation.md
Errors | aka: not found error, abort error | where: main/errors.ts | ctx: modules/main/overview.md
Number validators | aka: greater than, less than, percentage, integer, max decimal places | where: main/validators/number.validators.ts | ctx: modules/main/overview.md
Forms utils types | aka: checkbox like, expandable checkbox, checkbox set, form controls, form values, control accessor | where: main/utils/forms | ctx: modules/main/utils/forms.md

## literals
SCORE_NOT_APPLIED | aka: not applied score | where: main/constants/scoring.constants.ts | ctx: modules/main/overview.md
SCORE_NOT_APPLICABLE | aka: not applicable score, n/a | where: main/constants/scoring.constants.ts | ctx: modules/main/overview.md
NOT_AVAILABLE | aka: not available | where: main/constants/scoring.constants.ts | ctx: modules/main/overview.md
MAX_EFFORT_COUNT | aka: max efforts, effort limit | where: main/constants/scoring.constants.ts | ctx: modules/main/overview.md
MAX_DECIMAL_POINTS | aka: decimal places | where: main/constants/scoring.constants.ts | ctx: modules/main/overview.md
MIN_CYCLE_TIME_SECONDS | aka: cycle time min | where: main/validators/scoring.validators.ts | ctx: modules/main/overview.md
MAX_CYCLE_TIME_SECONDS | aka: cycle time max | where: main/validators/scoring.validators.ts | ctx: modules/main/overview.md
ASSESSMENT_DIALOG_WIDTH | aka: dialog width | where: main/constants/style.constants.ts | ctx: modules/main/overview.md
INSEER_DESIGN_SYSTEM | aka: design system | where: main/constants/style.constants.ts | ctx: modules/main/overview.md
AUTH_SUCCESS | aka: notification messages, toast text | where: main/constants/notifications.constants.ts | ctx: modules/main/overview.md
TASK_NAME_MAX_LENGTH | aka: task name length | where: main/features/risk-management/tasks/task.constants.ts | ctx: modules/main/features/risk-management/tasks/overview.md
CORITY_RESTRICTED_ROUTES | aka: cority routes, nav restricted | where: main/screens/app/nav-header/models/nav-header.constants.ts | ctx: modules/main/screens/app/nav-header/overview.md
CREATE_ROUTE | aka: create link in nav | where: main/screens/app/nav-header/models/nav-header.constants.ts | ctx: modules/main/screens/app/nav-header/overview.md
GE_ADV_WIZARD_URL_SEGMENT | aka: ge-adv wizard url | where: main/features/score-types/ge-adv | ctx: modules/main/features/score-types/ge-adv/overview.md
DEFAULT_FREQUENCY_THRESHOLD_PER_MINUTE | aka: frequency threshold, duration threshold | where: main/features/score-types/ge-adv | ctx: modules/main/features/score-types/ge-adv/overview.md
CYCLE_TIME_MAX_VALUE_MINUTES | aka: ge-adv cycle time max | where: main/features/score-types/ge-adv | ctx: modules/main/features/score-types/ge-adv/overview.md
LM_CARRY_THRESHOLDS | aka: carry thresholds, imperial | where: main/features/score-types/lm-carry | ctx: modules/main/features/score-types/lm-carry/overview.md
LM_LIFT_THRESHOLDS | aka: lift thresholds, imperial | where: main/features/score-types/lm-lift | ctx: modules/main/features/score-types/lm-lift/overview.md
LM_LOWER_THRESHOLDS | aka: lower thresholds, imperial | where: main/features/score-types/lm-lower | ctx: modules/main/features/score-types/lm-lower/overview.md
PUSH_PULL_THRESHOLDS | aka: push pull thresholds, imperial | where: main/features/score-types/lm-push-pull | ctx: modules/main/features/score-types/lm-push-pull/overview.md
NIOSH_DETAILS_THRESHOLDS | aka: niosh thresholds, imperial | where: main/features/score-types/niosh | ctx: modules/main/features/score-types/niosh/overview.md
MIN_ANALYSTS | aka: analysts count, gm-rfc validation | where: main/features/score-types/gm-rfc | ctx: modules/main/features/score-types/gm-rfc/overview.md
GMIN_PATTERN | aka: gmin pattern, license number pattern | where: main/features/score-types/gm-rfc | ctx: modules/main/features/score-types/gm-rfc/overview.md
LICENSE_NUMBER_PATTERN | aka: license number | where: main/features/score-types/gm-rfc | ctx: modules/main/features/score-types/gm-rfc/overview.md
NOM_LIFT_STEP_NAMES | aka: nom wizard step names | where: main/features/score-types/nom/shared | ctx: modules/main/features/score-types/nom/shared/constants.md
MAX_EFFORTS | aka: rula reba max efforts | where: main/features/score-types/rula-reba | ctx: modules/main/features/score-types/rula-reba/shared.md
RULA_REBA_ILLUSTRATIONS | aka: illustrations | where: main/features/score-types/rula-reba | ctx: modules/main/features/score-types/rula-reba/shared.md
ASSESSMENTS_COLUMN_GROUP | aka: table column groups | where: main/screens/reports-list-new/table/models/assessments-columns.constants.ts | ctx: modules/main/screens/reports-list-new/table.md
ADVANCED_TABLE_PAGE_SIZES | aka: page sizes | where: main/shared/modules/advanced-table/advanced-table.features.ts | ctx: modules/main/shared/modules/advanced-table/overview.md
ADVANCED_TABLE_VIEW_STORE | aka: view store token | where: main/shared/modules/advanced-table/providers/advanced-table-view-store.provider.ts | ctx: modules/main/shared/modules/advanced-table/overview.md
ADVANCED_TABLE_UNGROUPED_GROUP_LABEL | aka: ungrouped label | where: main/shared/modules/advanced-table | ctx: modules/main/shared/modules/advanced-table/overview.md
ADVANCED_TABLE_EMPTY_VALUE_SENTINEL | aka: empty value filter | where: main/shared/modules/advanced-table | ctx: modules/main/shared/modules/advanced-table/overview.md
DEFAULT_DATE_RANGE | aka: default date range filter | where: main/state/filters/selected-date-range.filter.ts | ctx: modules/main/state/filters.md
LOGIN_FAIL | aka: login failed message | where: main/screens/login/constants/notifications.constants.ts | ctx: modules/main/screens/overview.md
LOGIN_SUCCESS | aka: login success message | where: main/screens/login/constants/notifications.constants.ts | ctx: modules/main/screens/overview.md
UPLOAD_FAIL | aka: upload failed message | where: main/screens/upload/constants/notifications.constants.ts | ctx: modules/main/screens/upload.md
HIERARCHY_LEVEL_FAIL | aka: hierarchy level failed message | where: main/screens/org-admin/admin-hierarchy/admin-hierarchy-level/constants/notifications.constants.ts | ctx: modules/main/screens/org-admin.md
loadComponent|loadChildren | aka: lazy routes, route definitions, routing grep | where: main/screens/app | ctx: navigation.md
class \w+Facade | aka: facades grep, state classes | where: main/state | ctx: navigation.md
main/main.ts | aka: bootstrap, entry point | where: main/main.ts | ctx: navigation.md
UNIT_SYSTEM unitSystems | aka: metric, imperial, unit system choice | where: main/models/Organization.ts | ctx: modules/main/models/overview.md
HAL_COLUMNS | aka: user table hal columns, sortable columns, default columns | where: main/components/tables/user-table/models/user-table-columns.ts | ctx: modules/main/components/tables.md
MockUnleashService | aka: unleash mock | where: main/features/feature-flags/mocks/unleash-service.mock.ts | ctx: modules/main/features/feature-flags.md
