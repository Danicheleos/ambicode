/**
 * The fourteen review fixtures (evals/scripts/review-cases.mjs): an init stack as committed, then one uncommitted change
 * replayed on top. A change is whole-file writes, so a case's truth names lines of the file as it stands after the change.
 * The code carries no hint of what is wrong with it; the known issues are listed in the cases, not here.
 * Edit this file by hand; the content has no generator. `src` turns `$\{` into `${` so Kotlin templates survive String.raw.
 */
import { GO_MODULE_FILES, JVM_GRADLE_FILES, MONOREPO_FILES, PY_SERVICE_FILES, TS_SERVICE_FILES } from './init-stacks.mjs';

const src = (strings) => strings.raw.join('').replace(/\$\\\{/g, '${');

const BASES = {
  'ts-service-lendbox': TS_SERVICE_FILES,
  'py-service-tidewatch': PY_SERVICE_FILES,
  'go-module-parcelhub': GO_MODULE_FILES,
  'jvm-gradle-seedvault': JVM_GRADLE_FILES,
  'monorepo-rust-ts-kiln': MONOREPO_FILES,
};

// ---------------------------------------------------------------- ts-service-lendbox
const TS_BOUNDARY = {
  'src/contexts/billing/application/charge-late-fees.ts': src`import type { Loan } from '../../lending/index.js';
import { lateFee } from '../../lending/domain/fees/late.js';
import type { InvoiceLine } from '../domain/line.js';
import { summarize, type InvoiceSummary } from '../domain/summary.js';
import type { BillingDeps } from './deps.js';
import { issueInvoice } from './issue-invoice.js';

const lateLine = (loan: Loan): InvoiceLine | undefined => {
  const r = loan.returnedOn;
  if (r === undefined) return undefined;
  const f = lateFee(loan.dueOn, r);
  return f.cents > 0 ? { description: 'late return of ' + loan.itemId, amount: f } : undefined;
};

export const chargeLateFees = (deps: BillingDeps) => async (loans: Loan[]): Promise<InvoiceSummary[]> => {
  const byMember = new Map<string, InvoiceLine[]>();
  for (const loan of loans) {
    const line = lateLine(loan);
    if (line !== undefined) byMember.set(loan.memberId, [...(byMember.get(loan.memberId) ?? []), line]);
  }
  const summaries: InvoiceSummary[] = [];
  for (const [memberId, lines] of byMember) summaries.push(summarize(await issueInvoice(deps)(memberId, lines)));
  return summaries;
};
`,
  'src/contexts/billing/index.ts': src`export { chargeLateFees } from './application/charge-late-fees.js';
export { issueInvoice } from './application/issue-invoice.js';
export { onLoanReturned } from './application/on-loan-returned.js';
export type { Invoice } from './domain/invoice.js';
`,
  'src/contexts/billing/domain/summary.ts': src`import type { Invoice } from './invoice.js';

export interface InvoiceSummary {
  invoiceId: string;
  lineCount: number;
  totalCents: number;
}

export const summarize = (invoice: Invoice): InvoiceSummary => ({
  invoiceId: invoice.id,
  lineCount: invoice.lines.length,
  totalCents: invoice.total.cents,
});
`,
  'test/billing-summary.test.ts': src`import type { Invoice } from '../src/contexts/billing/index.js';
import { summarize } from '../src/contexts/billing/domain/summary.js';
import { money } from '../src/shared-kernel/money/money.js';

const invoice = (id: string, cents: number): Invoice => ({
  id,
  memberId: 'm-1',
  lines: [{ description: 'late return of drill-1', amount: money(cents) }],
  total: money(cents),
  paid: false,
});

describe('invoice summary', () => {
  it('counts the lines and carries the total', () => {
    expect(summarize(invoice('inv-1', 150))).toEqual({ invoiceId: 'inv-1', lineCount: 1, totalCents: 150 });
  });

  it('reports the id of the invoice it summarises', () => {
    expect(summarize(invoice('inv-2', 400)).invoiceId).toBe('inv-2');
  });

  it('carries a zero total through', () => {
    expect(summarize(invoice('inv-3', 0)).totalCents).toBe(0);
  });
});
`,
};

const TS_STRATEGY = {
  'src/contexts/lending/domain/fees/strategy.ts': src`import { money, type Money } from '../../../../shared-kernel/money/money.js';
import { daysBetween } from '../../../../shared-kernel/time/period.js';

export interface ReturnContext {
  dueOn: Date;
  returnedOn: Date;
}

export interface FeeStrategy {
  feeFor(context: ReturnContext): Money;
  daysLate(context: ReturnContext): number;
}

export class LateFeeStrategy implements FeeStrategy {
  constructor(private readonly centsPerDay: number) {}

  daysLate(context: ReturnContext): number {
    return Math.max(0, daysBetween(context.dueOn, context.returnedOn));
  }

  feeFor(context: ReturnContext): Money {
    return money(this.daysLate(context) * this.centsPerDay);
  }
}
`,
  'src/contexts/lending/domain/fees/factory.ts': src`import { LateFeeStrategy, type FeeStrategy } from './strategy.js';

export class FeeStrategyFactory {
  create(): FeeStrategy {
    return new LateFeeStrategy(50);
  }
}

export const feeStrategyFactory = new FeeStrategyFactory();
`,
  'src/contexts/lending/application/return.ts': src`import { domainError, type DomainError } from '../../../shared-kernel/result/errors.js';
import { err, ok, type Result } from '../../../shared-kernel/result/result.js';
import { feeStrategyFactory } from '../domain/fees/factory.js';
import type { Loan } from '../domain/loan.js';
import type { LendingDeps } from './deps.js';

export const returnItem = (deps: LendingDeps) => async (loanId: string): Promise<Result<Loan, DomainError>> => {
  // get the loan from the store
  const loan = await deps.loans.get(loanId);
  if (loan === undefined) return err(domainError('no-such-loan', loanId));
  // read the current time
  const now = deps.clock.now();
  const returned = { ...loan, returnedOn: now };
  await deps.loans.put(returned);
  // work out the fee for this kind of return
  const strategy = feeStrategyFactory.create();
  const context = { dueOn: loan.dueOn, returnedOn: now };
  const fee = strategy.feeFor(context);
  // tell the other contexts the loan came back
  deps.events.publish({ name: 'lending.loan-returned', at: now, payload: { loanId, feeCents: fee.cents, daysLate: strategy.daysLate(context) } });
  return ok(returned);
};
`,
};

const TS_WEAK_TESTS = {
  'src/contexts/lending/domain/policy.ts': src`export const LOAN_DAYS = 7;
export const MAX_EXTENSIONS = 2;
export const MAX_OPEN_LOANS = 5;

export const canExtend = (extensions: number): boolean => extensions < MAX_EXTENSIONS;
`,
  'src/contexts/lending/domain/loan.ts': src`import type { ItemId } from '../../../shared-kernel/ids/item-id.js';
import type { LoanId } from '../../../shared-kernel/ids/loan-id.js';
import type { MemberId } from '../../../shared-kernel/ids/member-id.js';
import { domainError, type DomainError } from '../../../shared-kernel/result/errors.js';
import { err, ok, type Result } from '../../../shared-kernel/result/result.js';
import { addDays } from '../../../shared-kernel/time/calendar.js';
import { LOAN_DAYS, MAX_OPEN_LOANS } from './policy.js';

export interface Loan {
  id: LoanId;
  itemId: ItemId;
  memberId: MemberId;
  dueOn: Date;
  returnedOn?: Date;
}

export interface NewLoan {
  id: LoanId;
  itemId: ItemId;
  memberId: MemberId;
  today: Date;
  openLoans: number;
}

export function createLoan(input: NewLoan): Result<Loan, DomainError> {
  if (input.itemId === ('' as ItemId)) return err(domainError('empty-item', 'a loan needs an item'));
  if (input.openLoans >= MAX_OPEN_LOANS) return err(domainError('too-many-loans', 'the member has ' + input.openLoans + ' tools out'));
  return ok({ id: input.id, itemId: input.itemId, memberId: input.memberId, dueOn: addDays(input.today, LOAN_DAYS) });
}
`,
  'src/contexts/lending/application/borrow.ts': src`import { asItemId } from '../../../shared-kernel/ids/item-id.js';
import { asLoanId } from '../../../shared-kernel/ids/loan-id.js';
import { asMemberId } from '../../../shared-kernel/ids/member-id.js';
import { domainError, type DomainError } from '../../../shared-kernel/result/errors.js';
import { err, type Result } from '../../../shared-kernel/result/result.js';
import { createLoan, type Loan } from '../domain/loan.js';
import type { LendingDeps } from './deps.js';
import { openLoansOf } from './open-loans.js';

export const borrowItem = (deps: LendingDeps) => async (itemId: string, memberId: string): Promise<Result<Loan, DomainError>> => {
  if (!(await deps.catalog.isLendable(itemId))) return err(domainError('not-lendable', itemId));
  const open = await openLoansOf(deps)(memberId);
  const loan = createLoan({ id: asLoanId('loan-' + itemId), itemId: asItemId(itemId), memberId: asMemberId(memberId), today: deps.clock.now(), openLoans: open.length });
  if (loan.ok) {
    await deps.loans.put(loan.value);
    deps.events.publish({ name: 'lending.loan-started', at: deps.clock.now(), payload: { itemId, memberId } });
  } else if (loan.error.code === 'too-many-loans') {
    deps.events.publish({ name: 'loan-refused', at: deps.clock.now(), payload: { itemId, memberId } });
  }
  return loan;
};
`,
  'src/contexts/lending/http/routes.ts': src`import type { Route } from '../../../platform/http/router.js';
import { borrowItem } from '../application/borrow.js';
import type { LendingDeps } from '../application/deps.js';
import { presentLoan } from './presenters.js';
import { parseBorrow } from './schema.js';

export const lendingRoutes = (deps: LendingDeps): Route[] => [
  {
    method: 'POST',
    path: '/loans',
    handle: async (body) => {
      const { itemId, memberId } = parseBorrow(body);
      const result = await borrowItem(deps)(itemId, memberId);
      if (result.ok) return { status: 201, body: presentLoan(result.value) };
      return { status: result.error.code === 'too-many-loans' ? 429 : 409, body: result.error };
    },
  },
];
`,
  'src/contexts/lending/application/open-loans.ts': src`import type { Loan } from '../domain/loan.js';
import type { LendingDeps } from './deps.js';

export const openLoansOf = (deps: LendingDeps) => async (memberId: string): Promise<Loan[]> =>
  (await deps.loans.all()).filter((loan) => loan.memberId === memberId && loan.returnedOn === undefined);
`,
  'src/contexts/lending/index.ts': src`export { borrowItem } from './application/borrow.js';
export { openLoansOf } from './application/open-loans.js';
export { returnItem } from './application/return.js';
export type { LendingDeps } from './application/deps.js';
export { lendingRoutes } from './http/routes.js';
export type { Loan } from './domain/loan.js';
`,
  'test/borrow.test.ts': src`import { borrowItem } from '../src/contexts/lending/application/borrow.js';
import { openLoansOf } from '../src/contexts/lending/application/open-loans.js';
import type { Loan } from '../src/contexts/lending/domain/loan.js';
import { asItemId } from '../src/shared-kernel/ids/item-id.js';
import { asLoanId } from '../src/shared-kernel/ids/loan-id.js';
import { asMemberId } from '../src/shared-kernel/ids/member-id.js';
import { createBus } from '../src/shared-kernel/events/bus.js';

const loanOf = (n: number, memberId = 'm-1'): Loan => ({
  id: asLoanId('loan-' + n),
  itemId: asItemId('item-' + n),
  memberId: asMemberId(memberId),
  dueOn: new Date('2026-03-08T00:00:00Z'),
});

const deps = (lendable: boolean, seeded: Loan[] = []) => {
  const rows = new Map<string, Loan>(seeded.map((loan) => [loan.id, loan] as [string, Loan]));
  return {
    loans: { get: async (id: string) => rows.get(id), put: async (loan: Loan) => void rows.set(loan.id, loan), all: async () => [...rows.values()] },
    clock: { now: () => new Date('2026-03-01T00:00:00Z') },
    events: createBus(),
    catalog: { isLendable: async () => lendable },
  };
};

describe('borrowItem', () => {
  it('refuses an item the catalog does not lend', async () => {
    const result = await borrowItem(deps(false))('drill-1', 'm-1');
    expect(result.ok).toBe(false);
  });

  it('starts a loan due a week later', async () => {
    const result = await borrowItem(deps(true))('drill-1', 'm-1');
    expect(result.ok && result.value.dueOn).toBeTruthy();
  });

  it('refuses a member who already has five tools out', async () => {
    const five = [1, 2, 3, 4, 5].map((n) => loanOf(n));
    const result = await borrowItem(deps(true, five))('drill-9', 'm-1');
    expect(!result.ok && result.error.code).toBe('too-many-loans');
  });
});

describe('openLoansOf', () => {
  it('lists the open loans of one member only', async () => {
    const returned = { ...loanOf(2), returnedOn: new Date('2026-03-02T00:00:00Z') };
    const open = await openLoansOf(deps(true, [loanOf(1), returned, loanOf(3, 'm-2')]))('m-1');
    expect(open).toHaveLength(1);
    expect(open[0]?.id).toBe('loan-1');
  });
});
`,
};

// ---------------------------------------------------------------- py-service-tidewatch
const PY_ERROR_CODES = {
  'src/tidewatch/domain/errors.py': src`class TidewatchError(Exception):
    """Base of every error raised here; code is the TW-nnn identifier."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code


class UnknownGaugeError(TidewatchError):
    pass


class StaleReadingError(TidewatchError):
    pass


class WindowTooLongError(TidewatchError):
    pass


class IngestError(TidewatchError):
    pass


class ImplausibleReadingError(TidewatchError):
    pass


class UnitError(TidewatchError):
    pass
`,
  'src/tidewatch/domain/rules/limits.py': src`from datetime import timedelta

MAX_AGE = timedelta(minutes=45)
MAX_HOURS = 48
SWING_MM = 300
MAX_JUMP_MM = 600  # largest change between two readings of one gauge, in metres
JUMP_WINDOW = timedelta(hours=1)
`,
  'src/tidewatch/domain/rules/plausibility.py': src`from tidewatch.domain.errors import ImplausibleReadingError
from tidewatch.domain.models import Reading
from tidewatch.domain.rules.limits import JUMP_WINDOW, MAX_JUMP_MM


def require_plausible(reading: Reading, *, previous: Reading) -> Reading:
    jump = abs(reading.level_mm - previous.level_mm)
    close = abs(reading.taken_at - previous.taken_at) <= JUMP_WINDOW
    if close and jump > MAX_JUMP_MM:
        raise ImplausibleReadingError("jump", f"gauge {reading.gauge_id} moved {jump} mm between two readings")
    return reading
`,
  'src/tidewatch/app/commands/ingest.py': src`from tidewatch.app.services import Services
from tidewatch.domain.events.readings import ReadingIngested
from tidewatch.domain.models import Reading
from tidewatch.domain.rules.plausibility import require_plausible


def ingest(services: Services, readings: list[Reading]) -> int:
    for reading in readings:
        known = services.store.readings(reading.gauge_id)
        if known:
            require_plausible(reading, previous=max(known, key=lambda item: item.taken_at))
        services.store.add(reading)
        services.bus.publish(ReadingIngested(reading))
    return len(readings)
`,
  'tests/test_ingest.py': src`from datetime import timedelta

import pytest

from tests.conftest import NOON
from tidewatch.app.commands.ingest import ingest
from tidewatch.domain.errors import ImplausibleReadingError
from tidewatch.domain.models import Reading


def test_ingest__stores_a_plausible_reading(services):
    reading = Reading("dover", NOON + timedelta(minutes=10), 4300)
    assert ingest(services, [reading]) == 1
    assert reading in services.store.readings("dover")


def test_ingest__rejects_a_jump_from_the_last_reading(services):
    with pytest.raises(ImplausibleReadingError):
        ingest(services, [Reading("dover", NOON + timedelta(minutes=10), 5400)])


def test_ingest__takes_the_first_reading_of_a_new_gauge(services):
    assert ingest(services, [Reading("calais", NOON, 3100)]) == 1
`,
  'tests/test_plausibility.py': src`from datetime import timedelta

import pytest

from tests.conftest import NOON
from tidewatch.domain.errors import ImplausibleReadingError
from tidewatch.domain.models import Reading
from tidewatch.domain.rules.plausibility import require_plausible


def test_plausibility__accepts_a_small_change():
    previous = Reading("dover", NOON, 4200)
    reading = Reading("dover", NOON + timedelta(minutes=10), 4350)
    assert require_plausible(reading, previous=previous) is reading


def test_plausibility__accepts_a_large_change_after_a_long_gap():
    previous = Reading("dover", NOON, 4200)
    reading = Reading("dover", NOON + timedelta(hours=3), 5400)
    assert require_plausible(reading, previous=previous) is reading


def test_plausibility__accepts_a_large_change_from_a_reading_hours_later():
    previous = Reading("dover", NOON + timedelta(hours=3), 5400)
    reading = Reading("dover", NOON, 4200)
    assert require_plausible(reading, previous=previous) is reading


def test_plausibility__rejects_a_jump():
    previous = Reading("dover", NOON, 4200)
    with pytest.raises(ImplausibleReadingError):
        require_plausible(Reading("dover", NOON + timedelta(minutes=10), 5400), previous=previous)
`,
};

const PY_PEAK_WINDOW = {
  'src/tidewatch/domain/rules/extremes.py': src`from tidewatch.domain.models import Window


def high_water_hours(window: Window) -> list[int]:
    """Hour offsets from the start of the window at which the level is a local maximum."""
    heights = window.hourly_mm
    peaks = []
    for hour in range(1, len(heights) - 2):
        if heights[hour - 1] < heights[hour] >= heights[hour + 1]:
            peaks.append(hour)
    return peaks


def smooth(heights: tuple[int, ...], *, width: int) -> tuple[int, ...]:
    half = width // 2
    out = []
    for hour in range(len(heights)):
        around = heights[max(0, hour - half) : hour + half + 1]
        out.append(sum(around) // len(around))
    return tuple(out)
`,
  'src/tidewatch/app/queries/peaks.py': src`from datetime import datetime, timedelta

from tidewatch.app.queries.forecast import forecast_window
from tidewatch.app.services import Services
from tidewatch.domain.rules.extremes import high_water_hours


def next_high_waters(services: Services, gauge_id: str, *, start: datetime, hours: int) -> list[datetime]:
    window = forecast_window(services, gauge_id, start=start, hours=hours)
    return [window.start + timedelta(hours=hour) for hour in high_water_hours(window)]
`,
  'src/tidewatch/api/handlers/peaks.py': src`from datetime import datetime

from tidewatch.api.replies import failed, ok
from tidewatch.app.queries.peaks import next_high_waters
from tidewatch.app.services import Services
from tidewatch.domain.errors import TidewatchError


def high_water(services: Services, gauge_id: str, *, start: datetime, hours: int) -> dict:
    try:
        times = next_high_waters(services, gauge_id, start=start, hours=hours)
    except TidewatchError as error:
        return failed(error)
    return ok(times=[stamp.isoformat() for stamp in times])
`,
  'tests/test_peaks.py': src`from tests.conftest import NOON
from tidewatch.api.handlers.peaks import high_water


def test_peaks__reports_the_first_high_water(services):
    reply = high_water(services, "dover", start=NOON, hours=12)
    assert reply["ok"] is True
    assert reply["times"][0].startswith("2026-03-01T15:")


def test_peaks__unknown_gauge_is_a_coded_reply(services):
    assert high_water(services, "nowhere", start=NOON, hours=12) == {"ok": False, "code": "TW-101"}
`,
};

const PY_CLEAN_PLUGIN = {
  'src/tidewatch/plugins/sources/tide_table/__init__.py': src`"""Source adapter for semicolon-separated tide table exports."""
`,
  'src/tidewatch/plugins/sources/tide_table/parse.py': src`from datetime import datetime

from tidewatch.domain.errors import IngestError
from tidewatch.domain.models import Reading


def parse_text(raw: str) -> list[Reading]:
    readings = []
    for number, row in enumerate(raw.strip().splitlines(), start=1):
        try:
            gauge_id, stamp, level = row.split(";")
            readings.append(Reading(gauge_id, datetime.fromisoformat(stamp), int(level)))
        except ValueError:
            raise IngestError("TW-414", f"tide table row {number} is malformed") from None
    if not readings:
        raise IngestError("TW-413", "tide table has no rows")
    return readings
`,
  'src/tidewatch/plugins/sources/tide_table/plugin.py': src`from tidewatch.plugins.base import SourcePlugin
from tidewatch.plugins.sources.tide_table.parse import parse_text

PLUGIN = SourcePlugin(name="tide_table", parse=parse_text)
`,
  'src/tidewatch/plugins/sources/__init__.py': src`from tidewatch.plugins.sources.buoy_csv.plugin import PLUGIN as buoy_csv
from tidewatch.plugins.sources.dredge_log.plugin import PLUGIN as dredge_log
from tidewatch.plugins.sources.estuary_mqtt.plugin import PLUGIN as estuary_mqtt
from tidewatch.plugins.sources.ferry_logger.plugin import PLUGIN as ferry_logger
from tidewatch.plugins.sources.harbour_json.plugin import PLUGIN as harbour_json
from tidewatch.plugins.sources.jetty_text.plugin import PLUGIN as jetty_text
from tidewatch.plugins.sources.lock_gate.plugin import PLUGIN as lock_gate
from tidewatch.plugins.sources.marina_modbus.plugin import PLUGIN as marina_modbus
from tidewatch.plugins.sources.mooring_pins.plugin import PLUGIN as mooring_pins
from tidewatch.plugins.sources.pier_xml.plugin import PLUGIN as pier_xml
from tidewatch.plugins.sources.quay_serial.plugin import PLUGIN as quay_serial
from tidewatch.plugins.sources.tide_table.plugin import PLUGIN as tide_table
from tidewatch.plugins.sources.weir_levels.plugin import PLUGIN as weir_levels

ALL = [
    buoy_csv,
    dredge_log,
    estuary_mqtt,
    ferry_logger,
    harbour_json,
    jetty_text,
    lock_gate,
    marina_modbus,
    mooring_pins,
    pier_xml,
    quay_serial,
    tide_table,
    weir_levels,
]
`,
  'tests/test_plugins.py': src`import pytest

from tidewatch.domain.errors import IngestError
from tidewatch.plugins.registry import REGISTRY, plugin_named


def test_plugins__every_adapter_is_registered():
    assert len(REGISTRY) == 13


def test_plugins__buoy_csv_parses_a_row():
    reading = plugin_named("buoy_csv").parse("dover,2026-03-01T12:00:00+00:00,4200")[0]
    assert reading.level_mm == 4200


def test_plugins__unknown_adapter_is_an_ingest_error():
    with pytest.raises(IngestError):
        plugin_named("nope")
`,
  'tests/test_tide_table.py': src`import pytest

from tidewatch.domain.errors import IngestError
from tidewatch.plugins.registry import plugin_named

TWO_ROWS = "dover;2026-03-01T12:00:00+00:00;4200\ncalais;2026-03-01T12:10:00+00:00;3100\n"


def test_tide_table__parses_a_row():
    reading = plugin_named("tide_table").parse("dover;2026-03-01T12:00:00+00:00;4200")[0]
    assert reading.level_mm == 4200


def test_tide_table__keeps_the_row_order():
    readings = plugin_named("tide_table").parse(TWO_ROWS)
    assert [reading.gauge_id for reading in readings] == ["dover", "calais"]


def test_tide_table__ignores_blank_lines_around_the_rows():
    readings = plugin_named("tide_table").parse("\n\n" + TWO_ROWS + "\n")
    assert len(readings) == 2


def test_tide_table__rejects_a_malformed_row():
    with pytest.raises(IngestError) as raised:
        plugin_named("tide_table").parse("dover;2026-03-01T12:00:00+00:00;high")
    assert raised.value.code == "TW-414"


def test_tide_table__rejects_an_empty_export():
    with pytest.raises(IngestError) as raised:
        plugin_named("tide_table").parse("\n")
    assert raised.value.code == "TW-413"
`,
};

// ---------------------------------------------------------------- go-module-parcelhub
/** Go indents with tabs; the source below uses four spaces per level and this turns the leading ones into tabs. */
const go = (strings) => src(strings).replace(/^( {4})+/gm, (indent) => '\t'.repeat(indent.length / 4));

const GO_HANDLER_BYPASS = {
  'internal/httpapi/bays.go': go`package httpapi

import (
    "errors"
    "fmt"
    "net/http"
    "strings"

    "example.com/parcelhub/internal/core"
    "example.com/parcelhub/internal/depot"
    "example.com/parcelhub/internal/httpapi/render"
)

type BayHandler struct {
    Store core.Store
}

func (h *BayHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
    tag := strings.TrimPrefix(r.URL.Path, "/bays/")
    bay, err := h.Assign(tag)
    if errors.Is(err, core.ErrNotFound) {
        render.Problem(w, http.StatusNotFound, "no such parcel")
        return
    }
    if err != nil {
        render.Problem(w, http.StatusInternalServerError, fmt.Sprintf("httpapi.bay: %v", err))
        return
    }
    if err := render.JSON(w, http.StatusOK, map[string]int{"bay": bay}); err != nil {
        render.Problem(w, http.StatusInternalServerError, fmt.Sprintf("httpapi.bay: %v", err))
    }
}

func (h *BayHandler) Assign(tag string) (int, error) {
    parcel, err := h.Store.Get(tag)
    if err != nil {
        return 0, fmt.Errorf("httpapi.Assign: %w", err)
    }
    parcel.Bay = depot.BayFor(tag)
    if err := h.Store.Put(parcel); err != nil {
        return 0, fmt.Errorf("httpapi.Assign: %w", err)
    }
    return parcel.Bay, nil
}
`,
  'internal/httpapi/server.go': go`package httpapi

import (
    "log"
    "net/http"
    "os"

    "example.com/parcelhub/internal/core"
    "example.com/parcelhub/internal/httpapi/middleware"
)

type Server struct {
    tracker core.Tracker
    store   core.Store
}

func New(tracker core.Tracker, store core.Store) *Server {
    return &Server{tracker: tracker, store: store}
}

func (s *Server) Handler() http.Handler {
    mux := http.NewServeMux()
    mux.HandleFunc("/parcels/", s.parcel)
    mux.Handle("/bays/", &BayHandler{Store: s.store})
    logger := log.New(os.Stderr, "httpapi ", log.LstdFlags)
    return middleware.Chain(mux, middleware.Recover(), middleware.Logging(logger))
}
`,
  'internal/httpapi/server_test.go': go`package httpapi

import (
    "net/http"
    "net/http/httptest"
    "testing"

    "example.com/parcelhub/internal/core"
    "example.com/parcelhub/internal/memstore"
)

type fakeTracker struct{ err error }

func (f fakeTracker) Lookup(tag string) (core.Parcel, error) {
    return core.Parcel{Tag: tag}, f.err
}

func (f fakeTracker) Advance(string, core.State) error { return f.err }

func TestUnknownParcelIs404(t *testing.T) {
    server := New(fakeTracker{err: core.ErrNotFound}, memstore.New())
    rec := httptest.NewRecorder()
    server.Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/parcels/PH-9", nil))
    if rec.Code != http.StatusNotFound {
        t.Fatalf("status = %d, want 404", rec.Code)
    }
}
`,
  'cmd/parceld/routes.go': go`package main

import (
    "net/http"

    "example.com/parcelhub/internal/audit"
    "example.com/parcelhub/internal/clock"
    "example.com/parcelhub/internal/httpapi"
    "example.com/parcelhub/internal/memstore"
    "example.com/parcelhub/internal/tracking"
)

func buildHandler() http.Handler {
    store := memstore.New()
    tracker := tracking.New(store, clock.System{})
    trail := audit.New()
    trail.Record("startup", "parceld")
    return httpapi.New(tracker, store).Handler()
}
`,
};

const GO_SWALLOWED_ERROR = {
  'internal/httpapi/scans.go': go`package httpapi

import (
    "fmt"
    "io"
    "log"
    "net/http"
    "strings"

    "example.com/parcelhub/internal/core"
    "example.com/parcelhub/internal/httpapi/render"
)

var scanStates = map[string]core.State{
    "COL": core.Collected,
    "DEP": core.AtDepot,
    "VAN": core.OnVan,
    "DLV": core.Delivered,
}

func (s *Server) scan(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost {
        render.Problem(w, http.StatusMethodNotAllowed, "scans are posted")
        return
    }
    body, err := io.ReadAll(io.LimitReader(r.Body, 256))
    if err != nil {
        render.Problem(w, http.StatusBadRequest, "unreadable scan")
        return
    }
    tag, state, err := parseScanLine(string(body))
    if err != nil {
        render.Problem(w, http.StatusBadRequest, "bad scan line")
        return
    }
    if err := s.tracker.Advance(tag, state); err != nil {
        log.Printf("httpapi.scan: %v", err)
    }
    if err := render.JSON(w, http.StatusOK, map[string]string{"tag": tag, "status": "recorded"}); err != nil {
        render.Problem(w, http.StatusInternalServerError, fmt.Sprintf("httpapi.scan: %v", err))
    }
}

// parseScanLine reads "PH-1042 DEP" into a tag and a state.
func parseScanLine(line string) (string, core.State, error) {
    fields := strings.Fields(line)
    if len(fields) != 2 {
        return "", "", fmt.Errorf("httpapi.parseScanLine: %w", core.ErrInvalid)
    }
    state, ok := scanStates[fields[1]]
    if !ok {
        return "", "", fmt.Errorf("httpapi.parseScanLine: %w", core.ErrInvalid)
    }
    return fields[0], state, nil
}
`,
  'internal/httpapi/server.go': go`package httpapi

import (
    "log"
    "net/http"
    "os"

    "example.com/parcelhub/internal/core"
    "example.com/parcelhub/internal/httpapi/middleware"
)

type Server struct {
    tracker core.Tracker
}

func New(tracker core.Tracker) *Server { return &Server{tracker: tracker} }

func (s *Server) Handler() http.Handler {
    mux := http.NewServeMux()
    mux.HandleFunc("/parcels/", s.parcel)
    mux.HandleFunc("/scans", s.scan)
    logger := log.New(os.Stderr, "httpapi ", log.LstdFlags)
    return middleware.Chain(mux, middleware.Recover(), middleware.Logging(logger))
}
`,
  'internal/httpapi/scans_test.go': go`package httpapi

import (
    "net/http"
    "net/http/httptest"
    "strings"
    "testing"
)

func TestScanRecordsTheState(t *testing.T) {
    server := New(fakeTracker{})
    rec := httptest.NewRecorder()
    server.Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/scans", strings.NewReader("PH-9 DEP")))
    if rec.Code != http.StatusOK {
        t.Fatalf("status = %d, want 200", rec.Code)
    }
}

func TestScanRefusesAGet(t *testing.T) {
    server := New(fakeTracker{})
    rec := httptest.NewRecorder()
    server.Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/scans", nil))
    if rec.Code != http.StatusMethodNotAllowed {
        t.Fatalf("status = %d, want 405", rec.Code)
    }
}

func TestScanRejectsAnUnknownState(t *testing.T) {
    server := New(fakeTracker{})
    rec := httptest.NewRecorder()
    server.Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/scans", strings.NewReader("PH-9 ZZZ")))
    if rec.Code != http.StatusBadRequest {
        t.Fatalf("status = %d, want 400", rec.Code)
    }
}
`,
};

const GO_WALL_CLOCK = {
  'internal/retention/sweep.go': go`package retention

import (
    "fmt"
    "time"

    "example.com/parcelhub/internal/core"
)

// Sweep lists the tags whose newest scan is older than days and records each one with the auditor.
func Sweep(store core.Store, auditor core.Auditor, tags []string, days int) ([]string, error) {
    cutoff := time.Now().AddDate(0, 0, -days)
    var expired []string
    for _, tag := range tags {
        parcel, err := store.Get(tag)
        if err != nil {
            return nil, fmt.Errorf("retention.Sweep: %w", err)
        }
        if len(parcel.Scans) == 0 {
            continue
        }
        newest := parcel.Scans[len(parcel.Scans)-1].At
        if newest.Before(cutoff) {
            expired = append(expired, tag)
            auditor.Record("retention-expired", tag)
        }
    }
    return expired, nil
}
`,
  'internal/retention/sweep_test.go': go`package retention

import (
    "testing"
    "time"

    "example.com/parcelhub/internal/audit"
    "example.com/parcelhub/internal/core"
    "example.com/parcelhub/internal/memstore"
)

func TestSweepListsOldParcels(t *testing.T) {
    old := time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC)
    store := memstore.New()
    err := store.Seed(
        core.Parcel{Tag: "PH-1", Scans: []core.Scan{{State: core.Delivered, At: old}}},
        core.Parcel{Tag: "PH-2", Scans: []core.Scan{{State: core.Delivered, At: time.Date(2999, 1, 1, 0, 0, 0, 0, time.UTC)}}},
    )
    if err != nil {
        t.Fatal(err)
    }
    trail := audit.New()

    got, err := Sweep(store, trail, []string{"PH-1", "PH-2"}, DefaultDays)
    if err != nil {
        t.Fatal(err)
    }
    if len(got) != 1 || got[0] != "PH-1" {
        t.Fatalf("Sweep = %v, want [PH-1]", got)
    }
    if len(trail.Events()) != 1 {
        t.Fatalf("events = %d, want 1", len(trail.Events()))
    }
}
`,
};

// ---------------------------------------------------------------- jvm-gradle-seedvault
const MAIN = 'application/src/main/kotlin/org/seedvault/application';
const DOMAIN = 'domain/src/main/kotlin/org/seedvault/domain';

/** An existing file with exact replacements; a miss or an ambiguous match is an error, never a silent no-op. */
function edit(base, file, ...replacements) {
  let text = base[file];
  if (text === undefined) throw new Error(`${file} is not in the base`);
  for (const [from, to] of replacements) {
    if (text.split(from).length !== 2) throw new Error(`${file}: "${from}" must appear exactly once`);
    text = text.replace(from, () => to);
  }
  return text;
}

const JVM_TRANSFER_USE_CASE = {
  [`${MAIN}/port/input/TransferLot.kt`]: src`package org.seedvault.application.port.input

import org.seedvault.domain.lot.SeedLot
import org.seedvault.domain.shared.LotId
import org.seedvault.domain.shared.Outcome
import org.seedvault.domain.shared.VaultId

data class TransferLotCommand(val lotId: LotId, val vault: VaultId)

interface TransferLot {
    fun execute(command: TransferLotCommand): Outcome<SeedLot>
}
`,
  [`${MAIN}/usecase/lot/TransferLotService.kt`]: src`package org.seedvault.application.usecase.lot

import org.seedvault.application.port.input.TransferLot
import org.seedvault.application.port.input.TransferLotCommand
import org.seedvault.application.port.output.EventPublisher
import org.seedvault.application.port.output.LotRepository
import org.seedvault.domain.events.LotTransferred
import org.seedvault.domain.lot.LotStatus
import org.seedvault.domain.lot.SeedLot
import org.seedvault.domain.shared.Outcome
import org.seedvault.domain.shared.VaultId
import org.slf4j.LoggerFactory
import java.time.Clock

class TransferLotService(
    private val lots: LotRepository,
    private val events: EventPublisher,
    private val clock: Clock,
) : TransferLot {
    private val log = LoggerFactory.getLogger(TransferLotService::class.java)

    override fun execute(command: TransferLotCommand): Outcome<SeedLot> {
        val data = lots.find(command.lotId) ?: return Outcome.Rejected("no lot named $\{command.lotId.value}")
        if (data.status == LotStatus.Retired) return Outcome.Rejected("lot $\{command.lotId.value} is retired")
        val tmp = handle2(data, command.vault)
        lots.save(tmp)
        events.publish(LotTransferred(tmp.id, command.vault, clock.instant()))
        log.atInfo().addKeyValue("lotId", command.lotId.value).addKeyValue("vault", command.vault.value).log("lot.transferred")
        return Outcome.Ok(tmp)
    }

    private fun handle2(
        lot: SeedLot,
        vault: VaultId,
    ): SeedLot = lot.copy(vault = vault)
}
`,
  [`${DOMAIN}/events/LotEvents.kt`]: src`package org.seedvault.domain.events

import org.seedvault.domain.shared.LotId
import org.seedvault.domain.shared.VaultId
import java.time.Instant

data class LotRegistered(val lotId: LotId, override val at: Instant) : DomainEvent

data class LotRetired(val lotId: LotId, override val at: Instant) : DomainEvent

data class LotTransferred(val lotId: LotId, val vault: VaultId, override val at: Instant) : DomainEvent
`,
  'adapters/messaging/src/main/kotlin/org/seedvault/adapters/messaging/bus/Topic.kt': edit(
    JVM_GRADLE_FILES,
    'adapters/messaging/src/main/kotlin/org/seedvault/adapters/messaging/bus/Topic.kt',
    ['import org.seedvault.domain.events.LotSown\n', 'import org.seedvault.domain.events.LotSown\nimport org.seedvault.domain.events.LotTransferred\n'],
    ['        is LotSown -> "lot.sown"\n', '        is LotSown -> "lot.sown"\n        is LotTransferred -> "lot.transferred"\n'],
  ),
  'bootstrap/src/main/kotlin/org/seedvault/bootstrap/Wiring.kt': edit(
    JVM_GRADLE_FILES,
    'bootstrap/src/main/kotlin/org/seedvault/bootstrap/Wiring.kt',
    ['import org.seedvault.application.port.input.SowLot\n', 'import org.seedvault.application.port.input.SowLot\nimport org.seedvault.application.port.input.TransferLot\n'],
    ['import org.seedvault.application.usecase.lot.RegisterLotService\n', 'import org.seedvault.application.usecase.lot.RegisterLotService\nimport org.seedvault.application.usecase.lot.TransferLotService\n'],
    ['    val reportStock: ReportStock', '    val transferLot: TransferLot = TransferLotService(lots, events, clock)\n    val reportStock: ReportStock'],
  ),
};

const JVM_LOT_QUERY = {
  [`${MAIN}/port/output/Repository.kt`]: src`package org.seedvault.application.port.output

fun interface Specification<T> {
    fun isSatisfiedBy(candidate: T): Boolean
}

interface Repository<T, ID> {
    fun find(id: ID): T?

    fun save(entity: T)

    fun all(): List<T>

    fun matching(specification: Specification<T>): List<T> = all().filter { specification.isSatisfiedBy(it) }
}
`,
  [`${MAIN}/port/output/LotRepository.kt`]: src`package org.seedvault.application.port.output

import org.seedvault.domain.lot.SeedLot
import org.seedvault.domain.shared.LotId

interface LotRepository : Repository<SeedLot, LotId>
`,
  [`${MAIN}/usecase/report/LotQueryBuilder.kt`]: src`package org.seedvault.application.usecase.report

import org.seedvault.application.port.output.Specification
import org.seedvault.domain.lot.LotStatus
import org.seedvault.domain.lot.SeedLot
import java.time.LocalDate

class LotQueryBuilder {
    private val conditions = mutableListOf<Specification<SeedLot>>()

    fun status(status: LotStatus): LotQueryBuilder = apply { conditions += Specification { it.status == status } }

    fun storedBefore(date: LocalDate): LotQueryBuilder = apply { conditions += Specification { it.storedOn.isBefore(date) } }

    fun viabilityBelow(percent: Int): LotQueryBuilder = apply { conditions += Specification { it.viability.percent < percent } }

    fun build(): Specification<SeedLot> = Specification { lot -> conditions.all { it.isSatisfiedBy(lot) } }
}
`,
  [`${MAIN}/usecase/report/RetestReportService.kt`]: src`package org.seedvault.application.usecase.report

import org.seedvault.application.port.output.LotRepository
import org.seedvault.domain.lot.LotStatus
import org.seedvault.domain.lot.SeedLot
import java.time.Clock
import java.time.LocalDate

class RetestReportService(
    private val lots: LotRepository,
    private val clock: Clock,
) {
    operator fun invoke(
        minYears: Long,
        belowPercent: Int,
    ): List<SeedLot> {
        val query =
            LotQueryBuilder()
                .status(LotStatus.Banked)
                .storedBefore(LocalDate.now(clock).minusYears(minYears))
                .viabilityBelow(belowPercent)
                .build()
        val due = lots.matching(query)
        if (due.isEmpty()) throw NoSuchElementException("no lot is due for retest")
        return due
    }
}
`,
};

const JVM_RETIRE_RULE = {
  [`${DOMAIN}/lot/RetirementRules.kt`]: src`package org.seedvault.domain.lot

import org.seedvault.domain.shared.Outcome
import java.time.LocalDate

const val HOLD_DAYS = 30L

object RetirementRules {
    fun check(lot: SeedLot, today: LocalDate): Outcome<SeedLot> {
        if (lot.status == LotStatus.Retired) return Outcome.Rejected("lot $\{lot.id.value} is already retired")
        if (lot.storedOn.plusDays(HOLD_DAYS).isBefore(today)) return Outcome.Rejected("lot $\{lot.id.value} is still in its $HOLD_DAYS day hold")
        return Outcome.Ok(lot)
    }
}
`,
  [`${DOMAIN}/lot/HoldPeriod.kt`]: src`package org.seedvault.domain.lot

import java.time.LocalDate
import java.time.temporal.ChronoUnit

fun daysLeftInHold(lot: SeedLot, today: LocalDate): Long = maxOf(0L, HOLD_DAYS - ChronoUnit.DAYS.between(lot.storedOn, today))
`,
  'domain/src/test/kotlin/org/seedvault/domain/lot/HoldPeriodTest.kt': src`package org.seedvault.domain.lot

import org.seedvault.domain.shared.LotId
import org.seedvault.domain.shared.SpeciesId
import java.time.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals

class HoldPeriodTest {
    private val today = LocalDate.of(2026, 3, 1)

    private fun lotStored(daysAgo: Long) = SeedLot(LotId("L-1"), SpeciesId("rye"), today.minusDays(daysAgo), Viability(90))

    @Test
    fun fullHoldOnTheDayOfStorage() {
        assertEquals(HOLD_DAYS, daysLeftInHold(lotStored(0), today))
    }

    @Test
    fun countsDownEachDay() {
        assertEquals(20L, daysLeftInHold(lotStored(10), today))
    }

    @Test
    fun noneLeftOnceTheHoldHasPassed() {
        assertEquals(0L, daysLeftInHold(lotStored(45), today))
    }
}
`,
  [`${MAIN}/usecase/lot/RetireLotService.kt`]: edit(
    JVM_GRADLE_FILES,
    `${MAIN}/usecase/lot/RetireLotService.kt`,
    ['import org.seedvault.domain.lot.LotStatus\n', 'import org.seedvault.domain.lot.LotStatus\nimport org.seedvault.domain.lot.RetirementRules\n'],
    ['import java.time.Clock\n', 'import java.time.Clock\nimport java.time.LocalDate\n'],
    [
      '        val retired = lot.copy(status = LotStatus.Retired)\n',
      '        val checked = RetirementRules.check(lot, LocalDate.now(clock))\n        if (checked is Outcome.Rejected) return checked\n        val retired = lot.copy(status = LotStatus.Retired)\n',
    ],
  ),
};

// ---------------------------------------------------------------- monorepo-rust-ts-kiln
const MONO_NOTES_HTML = {
  'dashboard/src/services/notes.ts': src`const notes = new Map<string, string[]>();

export const MAX_NOTES = 50;
export const MAX_NOTE_LENGTH = 500;

export const addNote = (firingId: string, text: string): boolean => {
  const current = notes.get(firingId) ?? [];
  if (current.length >= MAX_NOTES) return false;
  notes.set(firingId, [...current, text]);
  return true;
};

export const notesOf = (firingId: string): string[] => notes.get(firingId) ?? [];

export const clearNotes = (firingId: string): void => {
  notes.delete(firingId);
};
`,
  'dashboard/src/routes/firings.routes.ts': src`import type { Express } from 'express';
import { beginFiring, getFiring } from '../services/firings.js';
import { addNote, clearNotes, MAX_NOTE_LENGTH, notesOf } from '../services/notes.js';
import { firingPage } from '../views/firing.js';

export function register(app: Express): void {
  app.post('/firings', async (req, res) => {
    const id = await beginFiring(req.body.kilnId, req.body.segments);
    return res.status(201).json({ id });
  });

  app.get('/firings/:id', (req, res) => {
    const firing = getFiring(req.params.id);
    return firing === undefined ? res.status(404).end() : res.json(firing);
  });

  app.post('/firings/:id/notes', (req, res) => {
    if (getFiring(req.params.id) === undefined) return res.status(404).end();
    if (typeof req.body.note !== 'string' || req.body.note.trim() === '') return res.status(400).end();
    if (req.body.note.length > MAX_NOTE_LENGTH) return res.status(413).end();
    return addNote(req.params.id, req.body.note) ? res.status(204).end() : res.status(409).end();
  });

  app.delete('/firings/:id/notes', (req, res) => {
    if (getFiring(req.params.id) === undefined) return res.status(404).end();
    clearNotes(req.params.id);
    return res.status(204).end();
  });

  app.get('/firings/:id/page', (req, res) => {
    const firing = getFiring(req.params.id);
    if (firing === undefined) return res.status(404).end();
    return res.type('html').send(firingPage(firing, notesOf(firing.id)));
  });
}
`,
  'dashboard/src/views/firing.ts': src`import { formatMinutes } from '../lib/format/duration.js';
import type { Firing } from '../lib/engine/types.js';
import { table } from './components/table.js';
import { page } from './layout.js';

export const firingPage = (firing: Firing, notes: string[] = []): string =>
  page(
    'Firing ' + firing.id,
    table(firing.segments.map((s) => [formatMinutes(s.minutes), String(s.targetDc)])) +
      '<p class="note-count">' + notes.length + ' notes</p>' +
      '<ul class="notes">' +
      notes.map((note) => '<li>' + note + '</li>').join('') +
      '</ul>',
  );
`,
  'dashboard/src/__generated__/engine-api.ts': src`// @generated by openapi-typescript from engine/openapi.yaml. Do not edit.
export interface paths {
  '/firings/{id}': { put: { requestBody: { segments: { minutes: number; targetDc: number }[] } } };
  '/firings/{id}/notes': { post: { requestBody: { note: string } }; delete: Record<string, never> };
}
`,
  'dashboard/test/routes.test.ts': src`import type { Express } from 'express';
import { describe, expect, it } from 'vitest';
import { register } from '../src/routes/firings.routes.js';

describe('firings routes', () => {
  it('registers the firing endpoints', () => {
    const seen: string[] = [];
    const app = {
      post: (path: string) => seen.push('POST ' + path),
      get: (path: string) => seen.push('GET ' + path),
      delete: (path: string) => seen.push('DELETE ' + path),
    };
    register(app as unknown as Express);
    expect(seen).toEqual(['POST /firings', 'GET /firings/:id', 'POST /firings/:id/notes', 'DELETE /firings/:id/notes', 'GET /firings/:id/page']);
  });
});
`,
};

const MONO_CLEAN_RUST = {
  'engine/crates/telemetry/src/stats.rs': src`use kiln_schedule::plan::Schedule;

use crate::sample::Sample;

pub fn peak_dc(samples: &[Sample]) -> i32 {
    samples
        .iter()
        .map(|sample| sample.temp_dc)
        .max()
        .expect("invariant: callers pass at least one sample")
}

pub fn mean_dc(samples: &[Sample]) -> i32 {
    let total: i64 = samples.iter().map(|sample| i64::from(sample.temp_dc)).sum();
    let count = i64::try_from(samples.len()).expect("invariant: a slice length fits in i64");
    let mean = total
        .checked_div(count)
        .expect("invariant: callers pass at least one sample");
    i32::try_from(mean).expect("invariant: the mean of i32 values fits in i32")
}

pub fn count_over_target_dc(schedule: &Schedule, samples: &[Sample]) -> u32 {
    let over = samples
        .iter()
        .filter(|sample| sample.temp_dc > schedule.target_at_dc(sample.minute))
        .count();
    u32::try_from(over).expect("invariant: a run has fewer than u32::MAX samples")
}

pub fn overshoot_dc(schedule: &Schedule, samples: &[Sample]) -> i32 {
    samples
        .iter()
        .map(|sample| sample.temp_dc - schedule.target_at_dc(sample.minute))
        .max()
        .expect("invariant: callers pass at least one sample")
        .max(0)
}
`,
  'engine/crates/cli/src/report.rs': src`use kiln_schedule::plan::Schedule;
use kiln_telemetry::sample::Sample;
use kiln_telemetry::stats::{count_over_target_dc, mean_dc, overshoot_dc, peak_dc};
use kiln_units::temperature::celsius_from_dc;

pub fn summary(schedule: &Schedule, samples: &[Sample]) -> String {
    format!(
        "{} minutes, peak {:.1} C, mean {:.1} C, overshoot {:.1} C, {} samples over target",
        schedule.total_minutes(),
        celsius_from_dc(peak_dc(samples)),
        celsius_from_dc(mean_dc(samples)),
        celsius_from_dc(overshoot_dc(schedule, samples)),
        count_over_target_dc(schedule, samples),
    )
}
`,
  'engine/crates/telemetry/tests/stats.rs': src`use kiln_schedule::plan::Schedule;
use kiln_schedule::segment::Segment;
use kiln_telemetry::sample::Sample;
use kiln_telemetry::stats::{count_over_target_dc, mean_dc, overshoot_dc};

fn samples(values_dc: &[i32]) -> Vec<Sample> {
    values_dc
        .iter()
        .enumerate()
        .map(|(minute, &temp_dc)| Sample {
            minute: u32::try_from(minute).expect("invariant: the test inputs are short"),
            temp_dc,
        })
        .collect()
}

fn flat_schedule(target_dc: i32) -> Schedule {
    Schedule::new(vec![Segment {
        minutes: 10,
        target_dc,
    }])
    .expect("invariant: the test setpoint is inside the safe range")
}

#[test]
fn mean_is_the_average_of_the_samples() {
    assert_eq!(mean_dc(&samples(&[1_000, 2_000, 3_000])), 2_000);
}

#[test]
fn counts_only_samples_above_the_target() {
    let schedule = flat_schedule(1_000);
    assert_eq!(
        count_over_target_dc(&schedule, &samples(&[900, 1_000, 1_100, 1_200])),
        2
    );
}

#[test]
fn nothing_is_over_a_run_that_stays_at_the_target() {
    let schedule = flat_schedule(1_000);
    assert_eq!(
        count_over_target_dc(&schedule, &samples(&[1_000, 1_000, 1_000])),
        0
    );
}

#[test]
fn overshoot_is_zero_for_a_run_below_the_target() {
    let schedule = flat_schedule(1_000);
    assert_eq!(overshoot_dc(&schedule, &samples(&[800, 900, 950])), 0);
}
`,
};

// ---------------------------------------------------------------- the fixtures
const change = (base, name, write, remove = []) => ({
  name: `${base}-review-${name}`,
  steps: [
    { write: BASES[base] },
    { commit: 'init' },
    { write, ...(remove.length === 0 ? {} : { delete: remove }) },
  ],
});

export const REVIEW_FIXTURES = [
  change('ts-service-lendbox', '1', TS_BOUNDARY),
  change('ts-service-lendbox', '2', TS_STRATEGY),
  change('ts-service-lendbox', '3', TS_WEAK_TESTS),
  change('py-service-tidewatch', '1', PY_ERROR_CODES),
  change('py-service-tidewatch', '2', PY_PEAK_WINDOW),
  change('py-service-tidewatch', '3', PY_CLEAN_PLUGIN),
  change('go-module-parcelhub', '1', GO_HANDLER_BYPASS),
  change('go-module-parcelhub', '2', GO_SWALLOWED_ERROR),
  change('go-module-parcelhub', '3', GO_WALL_CLOCK),
  change('jvm-gradle-seedvault', '1', JVM_TRANSFER_USE_CASE),
  change('jvm-gradle-seedvault', '2', JVM_LOT_QUERY),
  change('jvm-gradle-seedvault', '3', JVM_RETIRE_RULE),
  change('monorepo-rust-ts-kiln', '1', MONO_NOTES_HTML),
  change('monorepo-rust-ts-kiln', '2', MONO_CLEAN_RUST),
];
