/**
 * Source trees of the five stacks `/ambicode:init --auto` is evaluated on (evals/scripts/init-cases.mjs holds what init
 * should find in each). Each is about 30 modules (`context tree` counts a directory with three or more source files below
 * it, so a leaf module is three small files) in its own architecture: layered with a plugin directory (Python), flat with
 * many small packages and one deep chain (Go), hexagonal over Gradle subprojects (Kotlin), a Rust workspace beside a web
 * app, a Python tool and generated code (monorepo), bounded contexts with a shared kernel (TypeScript). Offline and never
 * installed. Each plants four conventions: two written in its contributor document, two visible only as a repeated code
 * pattern. Python, Rust and the TypeScript logic were run while writing them; the Go and Kotlin trees were not compiled
 * (no toolchain on the machine that wrote them).
 */
const lines = (...rows) => `${rows.join('\n')}\n`;
// Tagged literal for source files: raw (so `\n` stays two characters in the generated code) and `§` stands for `$`.
const t = (strings) => `${strings.raw[0].replace(/^\n/, '').replace(/\n+$/, '').replaceAll('§', '$')}\n`;

const PY_ADAPTERS = [
  ['buoy_csv', 'comma-separated buoy dumps', 'TW-401', t`
def parse_text(raw: str) -> list[Reading]:
    readings = []
    for row in raw.strip().splitlines():
        gauge_id, stamp, level = row.split(",")
        readings.append(Reading(gauge_id, datetime.fromisoformat(stamp), int(level)))
    if not readings:
        raise IngestError("TW-401", "buoy dump has no rows")
    return readings
`, ['from datetime import datetime']],
  ['harbour_json', 'the harbour office JSON feed', 'TW-402', t`
def parse_text(raw: str) -> list[Reading]:
    document = json.loads(raw)
    if "levels" not in document:
        raise IngestError("TW-402", "feed has no levels key")
    return [
        Reading(item["gauge"], datetime.fromisoformat(item["at"]), item["mm"])
        for item in document["levels"]
    ]
`, ['import json', 'from datetime import datetime']],
  ['pier_xml', 'pier sensors that publish XML', 'TW-403', t`
def parse_text(raw: str) -> list[Reading]:
    root = ElementTree.fromstring(raw)
    readings = []
    for node in root.iter("sample"):
        stamp = datetime.fromisoformat(node.attrib["at"])
        readings.append(Reading(node.attrib["gauge"], stamp, int(node.text or "0")))
    if not readings:
        raise IngestError("TW-403", "xml document holds no samples")
    return readings
`, ['from datetime import datetime', 'from xml.etree import ElementTree']],
  ['jetty_text', 'jetty boards read as "GAUGE @ ISO = 4.2m"', 'TW-404', t`
def parse_text(raw: str) -> list[Reading]:
    readings = []
    for row in raw.strip().splitlines():
        head, _, tail = row.partition("=")
        gauge_id, _, stamp = head.partition("@")
        metres = float(tail.strip().removesuffix("m"))
        readings.append(Reading(gauge_id.strip(), datetime.fromisoformat(stamp.strip()), mm_from_m(metres)))
    if not readings:
        raise IngestError("TW-404", "jetty board is blank")
    return readings
`, ['from datetime import datetime', 'from tidewatch.domain.units.length import mm_from_m']],
  ['lock_gate', 'lock gate controllers that emit key=value pairs', 'TW-405', t`
def parse_text(raw: str) -> list[Reading]:
    fields = dict(pair.split("=", 1) for pair in raw.split())
    for key in ("gauge", "at", "mm"):
        if key not in fields:
            raise IngestError("TW-405", f"lock message lacks {key}")
    return [Reading(fields["gauge"], datetime.fromisoformat(fields["at"]), int(fields["mm"]))]
`, ['from datetime import datetime']],
  ['weir_levels', 'weir logs in tab-separated centimetres', 'TW-406', t`
def parse_text(raw: str) -> list[Reading]:
    readings = []
    for row in raw.strip().splitlines():
        gauge_id, stamp, centimetres = row.split("\t")
        readings.append(Reading(gauge_id, datetime.fromisoformat(stamp), int(centimetres) * 10))
    if not readings:
        raise IngestError("TW-406", "weir log is empty")
    return readings
`, ['from datetime import datetime']],
  ['mooring_pins', 'mooring pin sensors that report hexadecimal levels', 'TW-407', t`
def parse_text(raw: str) -> list[Reading]:
    readings = []
    for row in raw.strip().splitlines():
        gauge_id, stamp, level_hex = row.split(" ")
        readings.append(Reading(gauge_id, datetime.fromisoformat(stamp), int(level_hex, 16)))
    if not readings:
        raise IngestError("TW-407", "no pin reports in message")
    return readings
`, ['from datetime import datetime']],
  ['dredge_log', 'the dredger log, semicolon separated', 'TW-408', t`
def parse_text(raw: str) -> list[Reading]:
    readings = []
    for row in raw.strip().splitlines():
        stamp, gauge_id, level, _depth = row.split(";")
        readings.append(Reading(gauge_id, datetime.fromisoformat(stamp), int(level)))
    if not readings:
        raise IngestError("TW-408", "dredger log has no entries")
    return readings
`, ['from datetime import datetime']],
  ['ferry_logger', 'ferry loggers that wrap a reading in a $TW sentence', 'TW-409', t`
def parse_text(raw: str) -> list[Reading]:
    readings = []
    for row in raw.strip().splitlines():
        if not row.startswith("§TW,"):
            raise IngestError("TW-409", f"not a TW sentence: {row[:12]}")
        _, gauge_id, epoch, level = row.split(",")
        readings.append(Reading(gauge_id, datetime.fromtimestamp(int(epoch), tz=timezone.utc), int(level)))
    return readings
`, ['from datetime import datetime, timezone']],
  ['marina_modbus', 'marina controllers read as register pairs', 'TW-410', t`
def parse_text(raw: str) -> list[Reading]:
    registers = [int(value) for value in raw.split()]
    if len(registers) % 3 != 0:
        raise IngestError("TW-410", "register count is not a multiple of three")
    readings = []
    for index in range(0, len(registers), 3):
        gauge, epoch, level = registers[index : index + 3]
        readings.append(Reading(f"marina-{gauge}", datetime.fromtimestamp(epoch, tz=timezone.utc), level))
    return readings
`, ['from datetime import datetime, timezone']],
  ['quay_serial', 'quay gauges on a fixed-width serial line', 'TW-411', t`
def parse_text(raw: str) -> list[Reading]:
    readings = []
    for row in raw.strip().splitlines():
        if len(row) != 32:
            raise IngestError("TW-411", f"serial row is {len(row)} characters, expected 32")
        readings.append(Reading(row[:8].strip(), datetime.fromisoformat(row[8:27]), int(row[27:])))
    return readings
`, ['from datetime import datetime']],
  ['estuary_mqtt', 'estuary buoys that publish topic|payload messages', 'TW-412', t`
def parse_text(raw: str) -> list[Reading]:
    readings = []
    for row in raw.strip().splitlines():
        topic, payload = row.split("|", 1)
        gauge_id = topic.rsplit("/", 1)[-1]
        body = json.loads(payload)
        readings.append(Reading(gauge_id, datetime.fromisoformat(body["t"]), body["mm"]))
    if not readings:
        raise IngestError("TW-412", "no messages in batch")
    return readings
`, ['import json', 'from datetime import datetime']],
];

const pyAdapterFiles = () => Object.fromEntries(PY_ADAPTERS.flatMap(([name, what, , body, imports]) => {
  const dir = `src/tidewatch/plugins/sources/${name}`;
  const stdlib = imports.filter((line) => !line.includes('tidewatch'));
  const own = imports.filter((line) => line.includes('tidewatch'));
  const head = [...stdlib, '', 'from tidewatch.domain.errors import IngestError', 'from tidewatch.domain.models import Reading', ...own];
  return [
    [`${dir}/__init__.py`, `"""Source adapter for ${what}."""\n`],
    [`${dir}/parse.py`, `${head.join('\n')}\n\n\n${body}`],
    [`${dir}/plugin.py`, lines(
      'from tidewatch.plugins.base import SourcePlugin',
      `from tidewatch.plugins.sources.${name}.parse import parse_text`,
      '',
      `PLUGIN = SourcePlugin(name="${name}", parse=parse_text)`,
    )],
  ];
}));

export const PY_SERVICE_FILES = {
  ".gitignore": lines(
    ".venv/",
    "__pycache__/",
    ".pytest_cache/",
    ".ruff_cache/",
    "*.egg-info/",
  ),
  "notes/field-notes.md": lines(
    "# Contributing to tidewatch",
    "",
    "## Errors",
    "",
    "- Every error raised in `src/tidewatch/` is a `TidewatchError` subclass whose first argument is a `TW-nnn` code, for example `raise StaleReadingError(\"TW-203\", ...)`. Codes are never reused.",
    "",
    "## Tests",
    "",
    "- Name each test `test_<module>__<behaviour>`, with a double underscore, for example `test_staleness__rejects_stale_reading`.",
    "- One behaviour per test; the fixture data lives in `tests/conftest.py`.",
    "",
    "## Review",
    "",
    "- A change is ready when `pytest` and `ruff check` are both clean.",
  ),
  "README.md": lines(
    "# tidewatch",
    "",
    "Tide-window service for harbour pilots. It ingests water-level readings from gauges, rejects",
    "stale data and forecasts the next hours of water height at one gauge.",
    "",
    "Layers, from the inside out (imports point inwards only):",
    "",
    "```",
    "src/tidewatch/",
    "  domain/    records, errors, units, freshness and window rules, events",
    "  app/       ports, queries (read) and commands (write) over the domain",
    "  infra/     stores, clocks, settings and the wiring that builds the services",
    "  api/       request-shaped handlers that turn errors into replies",
    "  cli/       `python -m tidewatch.cli.main <gauge> <hours>`",
    "  plugins/   gauge feed adapters; one folder per feed under plugins/sources/",
    "```",
    "",
    "Run the checks with `uv run pytest` and `uv run ruff check src tests`.",
  ),
  "pyproject.toml": lines(
    "[project]",
    "name = \"tidewatch\"",
    "version = \"0.6.0\"",
    "description = \"Tide windows for harbour pilots\"",
    "requires-python = \">=3.12\"",
    "dependencies = []",
    "",
    "[dependency-groups]",
    "dev = [\"pytest>=9\", \"ruff>=0.14\"]",
    "",
    "[build-system]",
    "requires = [\"hatchling\"]",
    "build-backend = \"hatchling.build\"",
    "",
    "[tool.hatch.build.targets.wheel]",
    "packages = [\"src/tidewatch\"]",
    "",
    "[tool.pytest.ini_options]",
    "pythonpath = [\"src\"]",
    "testpaths = [\"tests\"]",
    "",
    "[tool.ruff]",
    "line-length = 110",
    "src = [\"src\", \"tests\"]",
    "",
    "[tool.ruff.lint]",
    "select = [\"E\", \"F\", \"I\", \"B\"]",
  ),
  "src/tidewatch/__init__.py": t`
"""Tide windows for harbour pilots."""

__version__ = "0.6.0"
`,
  // domain: nothing imported from the other layers
  "src/tidewatch/domain/__init__.py": t`
"""Records and rules; imports nothing from app, infra, api or plugins."""
`,
  "src/tidewatch/domain/errors.py": t`
class TidewatchError(Exception):
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


class UnitError(TidewatchError):
    pass
`,
  "src/tidewatch/domain/models.py": t`
from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class Reading:
    gauge_id: str
    taken_at: datetime
    level_mm: int


@dataclass(frozen=True)
class Window:
    gauge_id: str
    start: datetime
    hourly_mm: tuple[int, ...]


@dataclass(frozen=True)
class Gauge:
    gauge_id: str
    name: str
    datum_mm: int
`,
  "src/tidewatch/domain/events/__init__.py": t`
"""Domain events and the small in-process bus that carries them."""
`,
  "src/tidewatch/domain/events/bus.py": t`
from collections import defaultdict
from collections.abc import Callable
from typing import Any


class Bus:
    def __init__(self) -> None:
        self._handlers: dict[type, list[Callable[[Any], None]]] = defaultdict(list)

    def subscribe(self, event_type: type, handler: Callable[[Any], None]) -> None:
        self._handlers[event_type].append(handler)

    def publish(self, event: object) -> None:
        for handler in self._handlers[type(event)]:
            handler(event)
`,
  "src/tidewatch/domain/events/readings.py": t`
from dataclasses import dataclass

from tidewatch.domain.models import Reading


@dataclass(frozen=True)
class ReadingIngested:
    reading: Reading


@dataclass(frozen=True)
class GaugeCalibrated:
    gauge_id: str
    offset_mm: int
`,
  "src/tidewatch/domain/rules/__init__.py": t`
"""Freshness and window rules; the limits live in one file."""
`,
  "src/tidewatch/domain/rules/limits.py": t`
from datetime import timedelta

MAX_AGE = timedelta(minutes=45)
MAX_HOURS = 48
SWING_MM = 300
`,
  "src/tidewatch/domain/rules/staleness.py": t`
from datetime import datetime

from tidewatch.domain.errors import StaleReadingError
from tidewatch.domain.models import Reading
from tidewatch.domain.rules.limits import MAX_AGE


def require_fresh(reading: Reading, *, now: datetime) -> Reading:
    if now - reading.taken_at > MAX_AGE:
        seen = reading.taken_at.isoformat()
        raise StaleReadingError("TW-203", f"gauge {reading.gauge_id} last reported {seen}")
    return reading
`,
  "src/tidewatch/domain/rules/window.py": t`
import math

from tidewatch.domain.errors import WindowTooLongError
from tidewatch.domain.models import Reading, Window
from tidewatch.domain.rules.limits import MAX_HOURS, SWING_MM


def check_hours(hours: int) -> int:
    if hours > MAX_HOURS:
        raise WindowTooLongError("TW-310", f"{hours} hours asked, at most {MAX_HOURS}")
    return hours


def build_window(base: Reading, *, hours: int) -> Window:
    heights = tuple(base.level_mm + int(SWING_MM * math.sin(hour * math.pi / 6.2)) for hour in range(hours))
    return Window(gauge_id=base.gauge_id, start=base.taken_at, hourly_mm=heights)
`,
  "src/tidewatch/domain/units/__init__.py": t`
"""Conversions between the units feeds report in and millimetres."""
`,
  "src/tidewatch/domain/units/length.py": t`
from tidewatch.domain.errors import UnitError


def mm_from_m(metres: float) -> int:
    if metres < 0:
        raise UnitError("TW-120", f"negative level {metres}")
    return round(metres * 1000)


def m_from_mm(level_mm: int) -> float:
    return level_mm / 1000
`,
  "src/tidewatch/domain/units/pressure.py": t`
from tidewatch.domain.errors import UnitError

HPA_PER_MM_HEAD = 0.0980665


def mm_head_from_hpa(hectopascal: float) -> int:
    if hectopascal <= 0:
        raise UnitError("TW-121", f"pressure {hectopascal} hPa is not positive")
    return round(hectopascal / HPA_PER_MM_HEAD)
`,
  // app: use cases over ports
  "src/tidewatch/app/__init__.py": t`
"""Use cases; talks to the outside only through app.ports."""
`,
  "src/tidewatch/app/services.py": t`
from dataclasses import dataclass

from tidewatch.app.ports.clock import Clock
from tidewatch.app.ports.store import Store
from tidewatch.domain.events.bus import Bus


@dataclass(frozen=True)
class Services:
    store: Store
    clock: Clock
    bus: Bus
`,
  "src/tidewatch/app/ports/__init__.py": t`
"""Protocols the infra layer implements."""
`,
  "src/tidewatch/app/ports/clock.py": t`
from datetime import datetime
from typing import Protocol


class Clock(Protocol):
    def now(self) -> datetime: ...
`,
  "src/tidewatch/app/ports/store.py": t`
from typing import Protocol

from tidewatch.domain.models import Gauge, Reading


class Store(Protocol):
    def add(self, reading: Reading) -> None: ...

    def readings(self, gauge_id: str) -> list[Reading]: ...

    def gauge(self, gauge_id: str) -> Gauge | None: ...
`,
  "src/tidewatch/app/queries/__init__.py": t`
"""Read-side use cases."""
`,
  "src/tidewatch/app/queries/latest.py": t`
from tidewatch.app.services import Services
from tidewatch.domain.errors import UnknownGaugeError
from tidewatch.domain.models import Reading
from tidewatch.domain.rules.staleness import require_fresh


def latest_reading(services: Services, gauge_id: str) -> Reading:
    readings = services.store.readings(gauge_id)
    if not readings:
        raise UnknownGaugeError("TW-101", f"no gauge named {gauge_id}")
    newest = max(readings, key=lambda item: item.taken_at)
    return require_fresh(newest, now=services.clock.now())
`,
  "src/tidewatch/app/queries/forecast.py": t`
from datetime import datetime

from tidewatch.app.queries.latest import latest_reading
from tidewatch.app.services import Services
from tidewatch.domain.models import Window
from tidewatch.domain.rules.window import build_window, check_hours


def forecast_window(services: Services, gauge_id: str, *, start: datetime, hours: int) -> Window:
    check_hours(hours)
    return build_window(latest_reading(services, gauge_id), hours=hours)
`,
  "src/tidewatch/app/commands/__init__.py": t`
"""Write-side use cases."""
`,
  "src/tidewatch/app/commands/ingest.py": t`
from tidewatch.app.services import Services
from tidewatch.domain.events.readings import ReadingIngested
from tidewatch.domain.models import Reading


def ingest(services: Services, readings: list[Reading]) -> int:
    for reading in readings:
        services.store.add(reading)
        services.bus.publish(ReadingIngested(reading))
    return len(readings)
`,
  "src/tidewatch/app/commands/calibrate.py": t`
from dataclasses import replace

from tidewatch.app.services import Services
from tidewatch.domain.errors import UnknownGaugeError
from tidewatch.domain.events.readings import GaugeCalibrated


def calibrate(services: Services, gauge_id: str, *, offset_mm: int) -> int:
    known = services.store.readings(gauge_id)
    if not known:
        raise UnknownGaugeError("TW-102", f"cannot calibrate unknown gauge {gauge_id}")
    for reading in known:
        services.store.add(replace(reading, level_mm=reading.level_mm + offset_mm))
    services.bus.publish(GaugeCalibrated(gauge_id, offset_mm))
    return len(known)
`,
  // infra
  "src/tidewatch/infra/__init__.py": t`
"""Adapters for the app ports and the wiring that picks them."""
`,
  "src/tidewatch/infra/wiring.py": t`
from tidewatch.app.services import Services
from tidewatch.domain.events.bus import Bus
from tidewatch.infra.clock.system import SystemClock
from tidewatch.infra.config.settings import Settings
from tidewatch.infra.store.memory import MemoryStore


def build_services(settings: Settings) -> Services:
    store = MemoryStore(capacity=settings.capacity)
    return Services(store=store, clock=SystemClock(), bus=Bus())
`,
  "src/tidewatch/infra/store/__init__.py": t`
"""Store implementations."""
`,
  "src/tidewatch/infra/store/memory.py": t`
from tidewatch.domain.models import Gauge, Reading


class MemoryStore:
    def __init__(self, *, capacity: int) -> None:
        self._capacity = capacity
        self._by_gauge: dict[str, list[Reading]] = {}

    def add(self, reading: Reading) -> None:
        rows = self._by_gauge.setdefault(reading.gauge_id, [])
        rows.append(reading)
        del rows[: max(0, len(rows) - self._capacity)]

    def readings(self, gauge_id: str) -> list[Reading]:
        return list(self._by_gauge.get(gauge_id, []))

    def gauge(self, gauge_id: str) -> Gauge | None:
        return Gauge(gauge_id, gauge_id.title(), 0) if gauge_id in self._by_gauge else None
`,
  "src/tidewatch/infra/store/journal.py": t`
from tidewatch.app.ports.store import Store
from tidewatch.domain.models import Gauge, Reading


class JournalStore:
    """Wraps a store and keeps the order readings arrived in."""

    def __init__(self, inner: Store) -> None:
        self._inner = inner
        self.journal: list[Reading] = []

    def add(self, reading: Reading) -> None:
        self.journal.append(reading)
        self._inner.add(reading)

    def readings(self, gauge_id: str) -> list[Reading]:
        return self._inner.readings(gauge_id)

    def gauge(self, gauge_id: str) -> Gauge | None:
        return self._inner.gauge(gauge_id)
`,
  "src/tidewatch/infra/clock/__init__.py": t`
"""Clock implementations."""
`,
  "src/tidewatch/infra/clock/system.py": t`
from datetime import datetime, timezone


class SystemClock:
    def now(self) -> datetime:
        return datetime.now(timezone.utc)
`,
  "src/tidewatch/infra/clock/fixed.py": t`
from datetime import datetime


class FixedClock:
    def __init__(self, moment: datetime) -> None:
        self.moment = moment

    def now(self) -> datetime:
        return self.moment
`,
  "src/tidewatch/infra/config/__init__.py": t`
"""Settings and where they are read from."""
`,
  "src/tidewatch/infra/config/settings.py": t`
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    capacity: int = 500
    default_hours: int = 12
`,
  "src/tidewatch/infra/config/env.py": t`
import os

from tidewatch.infra.config.settings import Settings


def settings_from_env() -> Settings:
    return Settings(
        capacity=int(os.environ.get("TIDEWATCH_CAPACITY", "500")),
        default_hours=int(os.environ.get("TIDEWATCH_HOURS", "12")),
    )
`,
  // api
  "src/tidewatch/api/__init__.py": t`
"""Handlers shaped like requests; errors become replies here and nowhere else."""
`,
  "src/tidewatch/api/replies.py": t`
from tidewatch.domain.errors import TidewatchError


def ok(**fields: object) -> dict:
    return {"ok": True, **fields}


def failed(error: TidewatchError) -> dict:
    return {"ok": False, "code": error.code}
`,
  "src/tidewatch/api/handlers/__init__.py": t`
"""One module per endpoint."""
`,
  "src/tidewatch/api/handlers/level.py": t`
from tidewatch.api.replies import failed, ok
from tidewatch.app.queries.latest import latest_reading
from tidewatch.app.services import Services
from tidewatch.domain.errors import TidewatchError


def current_level(services: Services, gauge_id: str) -> dict:
    try:
        reading = latest_reading(services, gauge_id)
    except TidewatchError as error:
        return failed(error)
    return ok(level_mm=reading.level_mm)
`,
  "src/tidewatch/api/handlers/window.py": t`
from datetime import datetime

from tidewatch.api.replies import failed, ok
from tidewatch.app.queries.forecast import forecast_window
from tidewatch.app.services import Services
from tidewatch.domain.errors import TidewatchError


def tide_window(services: Services, gauge_id: str, *, start: datetime, hours: int) -> dict:
    try:
        window = forecast_window(services, gauge_id, start=start, hours=hours)
    except TidewatchError as error:
        return failed(error)
    return ok(hourly_mm=list(window.hourly_mm))
`,
  "src/tidewatch/api/handlers/health.py": t`
from tidewatch.api.replies import ok
from tidewatch.app.services import Services


def health(services: Services, *, gauge_ids: list[str]) -> dict:
    return ok(known=[gauge for gauge in gauge_ids if services.store.gauge(gauge) is not None])
`,
  // cli
  "src/tidewatch/cli/__init__.py": t`
"""Command line entry point."""
`,
  "src/tidewatch/cli/main.py": t`
import sys

from tidewatch.api.handlers.window import tide_window
from tidewatch.cli.render import render
from tidewatch.infra.config.env import settings_from_env
from tidewatch.infra.wiring import build_services


def main(argv: list[str]) -> int:
    services = build_services(settings_from_env())
    gauge_id, hours = argv[0], int(argv[1])
    reply = tide_window(services, gauge_id, start=services.clock.now(), hours=hours)
    print(render(reply))
    return 0 if reply["ok"] else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
`,
  "src/tidewatch/cli/render.py": t`
def render(reply: dict) -> str:
    if not reply["ok"]:
        return f"failed {reply['code']}"
    return " ".join(str(level) for level in reply["hourly_mm"])
`,
  // plugins: a registry and one folder per feed
  "src/tidewatch/plugins/__init__.py": t`
"""Feed adapters. Add one by creating a folder under sources/ and listing it there."""
`,
  "src/tidewatch/plugins/base.py": t`
from collections.abc import Callable
from dataclasses import dataclass

from tidewatch.domain.models import Reading


@dataclass(frozen=True)
class SourcePlugin:
    name: str
    parse: Callable[[str], list[Reading]]
`,
  "src/tidewatch/plugins/registry.py": t`
from tidewatch.domain.errors import IngestError
from tidewatch.plugins.base import SourcePlugin
from tidewatch.plugins.sources import ALL

REGISTRY: dict[str, SourcePlugin] = {plugin.name: plugin for plugin in ALL}


def plugin_named(name: str) -> SourcePlugin:
    try:
        return REGISTRY[name]
    except KeyError:
        raise IngestError("TW-400", f"no feed adapter named {name}") from None
`,
  "src/tidewatch/plugins/sources/__init__.py": [
    ...[...PY_ADAPTERS].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([name]) => `from tidewatch.plugins.sources.${name}.plugin import PLUGIN as ${name}`),
    '',
    'ALL = [',
    ...[...PY_ADAPTERS].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([name]) => `    ${name},`),
    ']',
  ].join('\n') + '\n',
  ...pyAdapterFiles(),
  "tests/__init__.py": "",
  "tests/conftest.py": t`
from datetime import datetime, timezone

import pytest

from tidewatch.app.services import Services
from tidewatch.domain.events.bus import Bus
from tidewatch.domain.models import Reading
from tidewatch.infra.clock.fixed import FixedClock
from tidewatch.infra.store.memory import MemoryStore

NOON = datetime(2026, 3, 1, 12, 0, tzinfo=timezone.utc)


@pytest.fixture
def services() -> Services:
    store = MemoryStore(capacity=50)
    store.add(Reading("dover", NOON, 4200))
    return Services(store=store, clock=FixedClock(NOON), bus=Bus())
`,
  "tests/test_staleness.py": t`
from datetime import timedelta

import pytest

from tests.conftest import NOON
from tidewatch.domain.errors import StaleReadingError
from tidewatch.domain.models import Reading
from tidewatch.domain.rules.staleness import require_fresh


def test_staleness__accepts_fresh_reading():
    reading = Reading("dover", NOON, 4200)
    assert require_fresh(reading, now=NOON + timedelta(minutes=5)) is reading


def test_staleness__rejects_stale_reading():
    with pytest.raises(StaleReadingError) as caught:
        require_fresh(Reading("dover", NOON, 4200), now=NOON + timedelta(hours=2))
    assert caught.value.code == "TW-203"
`,
  "tests/test_handlers.py": t`
from tests.conftest import NOON
from tidewatch.api.handlers.level import current_level
from tidewatch.api.handlers.window import tide_window


def test_handlers__report_level(services):
    assert current_level(services, "dover") == {"ok": True, "level_mm": 4200}


def test_handlers__turn_errors_into_codes(services):
    assert tide_window(services, "nowhere", start=NOON, hours=3) == {"ok": False, "code": "TW-101"}
`,
  "tests/test_forecast.py": t`
import pytest

from tests.conftest import NOON
from tidewatch.app.queries.forecast import forecast_window
from tidewatch.domain.errors import WindowTooLongError


def test_forecast__window_has_one_height_per_hour(services):
    assert len(forecast_window(services, "dover", start=NOON, hours=6).hourly_mm) == 6


def test_forecast__rejects_window_over_two_days(services):
    with pytest.raises(WindowTooLongError):
        forecast_window(services, "dover", start=NOON, hours=49)
`,
  "tests/test_plugins.py": t`
import pytest

from tidewatch.domain.errors import IngestError
from tidewatch.plugins.registry import REGISTRY, plugin_named


def test_plugins__every_adapter_is_registered():
    assert len(REGISTRY) == 12


def test_plugins__buoy_csv_parses_a_row():
    reading = plugin_named("buoy_csv").parse("dover,2026-03-01T12:00:00+00:00,4200")[0]
    assert reading.level_mm == 4200


def test_plugins__unknown_adapter_is_an_ingest_error():
    with pytest.raises(IngestError):
        plugin_named("nope")
`,
};

// Go source is written with four-space indents here and emitted with tabs (gofmt style).
const gt = (strings) => t(strings).replace(/^( {4})+/gm, (indent) => '\t'.repeat(indent.length / 4));
const GO = 'example.com/parcelhub';
const goDoc = (name, text) => `// Package ${name} ${text}\npackage ${name}\n`;

export const GO_MODULE_FILES = {
  ".gitignore": lines(
    "/bin/",
    "*.test",
    "*.out",
    "coverage.txt",
  ),
  ".golangci.yml": lines(
    "run:",
    "  timeout: 3m",
    "linters:",
    "  enable:",
    "    - errorlint",
    "    - govet",
    "    - staticcheck",
    "    - unused",
  ),
  "CONTRIBUTING.md": lines(
    "# Contributing to parcelhub",
    "",
    "## Errors",
    "",
    "- Wrap every error you return with the package and function that returns it: `fmt.Errorf(\"tracking.Lookup: %w\", err)`. Never return a bare `err` from an exported function.",
    "",
    "## Time",
    "",
    "- Never call `time.Now` outside `internal/clock`. Take a `core.Clock` and call `clock.Now()`, so tests can fix the time.",
    "",
    "## Checks",
    "",
    "- `go test ./...`, `go vet ./...` and `golangci-lint run` must all pass.",
  ),
  "README.md": lines(
    "# parcelhub",
    "",
    "Parcel tracking for a regional courier: customers look a parcel up by tag, and",
    "depot staff move it between scan states, assign it a sorting bay and price it.",
    "",
    "```",
    "cmd/parceld         the HTTP daemon",
    "cmd/parcelctl       a command line tool for labels and quotes",
    "internal/core       shared types and interfaces; every other package imports it",
    "internal/<name>     one small package per concern (tracking, depot, pricing, ...)",
    "internal/carrier    the carrier network model, nested down to belt sensors",
    "```",
    "",
    "Run `go test ./...`, `go vet ./...` and `golangci-lint run` before pushing.",
  ),
  "go.mod": lines(
    `module ${GO}`,
    "",
    "go 1.22",
  ),
  // ---- cmd
  "cmd/parceld/main.go": gt`
package main

import (
    "log"
    "net/http"
)

func main() {
    cfg := loadConfig()
    log.Printf("parceld listening on %s", cfg.addr)
    log.Fatal(http.ListenAndServe(cfg.addr, buildHandler()))
}
`,
  "cmd/parceld/config.go": gt`
package main

import "os"

type config struct {
    addr string
}

func loadConfig() config {
    addr := os.Getenv("PARCELD_ADDR")
    if addr == "" {
        addr = ":8080"
    }
    return config{addr: addr}
}
`,
  "cmd/parceld/routes.go": gt`
package main

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
    return httpapi.New(tracker).Handler()
}
`,
  "cmd/parcelctl/main.go": gt`
package main

import (
    "fmt"
    "os"

    "example.com/parcelhub/internal/core"
    "example.com/parcelhub/internal/memstore"
    "example.com/parcelhub/internal/pricing"
)

func main() {
    opts, err := parseArgs(os.Args[1:])
    if err != nil {
        fmt.Fprintln(os.Stderr, err)
        os.Exit(2)
    }
    store := memstore.New()
    parcel := core.Parcel{Tag: opts.tag, Grams: opts.grams, Zone: opts.zone}
    if err := store.Seed(parcel); err != nil {
        fmt.Fprintln(os.Stderr, err)
        os.Exit(1)
    }
    cents, err := pricing.Quote(parcel)
    if err != nil {
        fmt.Fprintln(os.Stderr, err)
        os.Exit(1)
    }
    printParcel(os.Stdout, parcel, cents)
}
`,
  "cmd/parcelctl/flags.go": gt`
package main

import (
    "errors"
    "strconv"
)

type options struct {
    tag   string
    grams int
    zone  string
}

func parseArgs(args []string) (options, error) {
    if len(args) < 3 {
        return options{}, errors.New("usage: parcelctl <tag> <grams> <zone>")
    }
    grams, err := strconv.Atoi(args[1])
    if err != nil {
        return options{}, err
    }
    return options{tag: args[0], grams: grams, zone: args[2]}, nil
}
`,
  "cmd/parcelctl/print.go": gt`
package main

import (
    "fmt"
    "io"

    "example.com/parcelhub/internal/core"
    "example.com/parcelhub/internal/labels"
)

func printParcel(w io.Writer, parcel core.Parcel, cents int) {
    fmt.Fprintln(w, labels.Text(parcel))
    fmt.Fprintf(w, "price: %d.%02d\n", cents/100, cents%100)
}
`,
  // ---- internal: the shared kernel
  "internal/core/types.go": gt`
package core

import "time"

type State string

const (
    Collected State = "collected"
    AtDepot   State = "at-depot"
    OnVan     State = "on-van"
    Delivered State = "delivered"
)

type Scan struct {
    State State
    At    time.Time
}

type Parcel struct {
    Tag   string
    Bay   int
    Grams int
    Zone  string
    Scans []Scan
}
`,
  "internal/core/errors.go": gt`
package core

import "errors"

var (
    ErrNotFound = errors.New("parcel not found")
    ErrInvalid  = errors.New("invalid input")
)
`,
  "internal/core/interfaces.go": gt`
package core

import "time"

type Clock interface {
    Now() time.Time
}

type Store interface {
    Get(tag string) (Parcel, error)
    Put(parcel Parcel) error
}

type Tracker interface {
    Lookup(tag string) (Parcel, error)
    Advance(tag string, next State) error
}

type Notifier interface {
    Notify(tag string, message string) error
}

type Auditor interface {
    Record(event string, subject string)
}
`,
  "internal/clock/doc.go": goDoc('clock', 'is the one place that reads the wall clock.'),
  "internal/clock/clock.go": gt`
package clock

import (
    "time"

    "example.com/parcelhub/internal/core"
)

var _ core.Clock = System{}

type System struct{}

func (System) Now() time.Time { return time.Now() }
`,
  "internal/clock/fixed.go": gt`
package clock

import (
    "time"

    "example.com/parcelhub/internal/core"
)

var _ core.Clock = Fixed{}

// Fixed always reports At; tests use it.
type Fixed struct{ At time.Time }

func (f Fixed) Now() time.Time { return f.At }
`,
  "internal/memstore/doc.go": goDoc('memstore', 'is the in-memory parcel store.'),
  "internal/memstore/store.go": gt`
package memstore

import (
    "fmt"
    "sync"

    "example.com/parcelhub/internal/core"
)

var _ core.Store = (*Store)(nil)

type Store struct {
    mu      sync.Mutex
    parcels map[string]core.Parcel
}

func New() *Store { return &Store{parcels: map[string]core.Parcel{}} }

func (s *Store) Get(tag string) (core.Parcel, error) {
    s.mu.Lock()
    defer s.mu.Unlock()
    parcel, ok := s.parcels[tag]
    if !ok {
        return core.Parcel{}, fmt.Errorf("memstore.Get: %w", core.ErrNotFound)
    }
    return parcel, nil
}

func (s *Store) Put(parcel core.Parcel) error {
    s.mu.Lock()
    defer s.mu.Unlock()
    s.parcels[parcel.Tag] = parcel
    return nil
}
`,
  "internal/memstore/seed.go": gt`
package memstore

import (
    "fmt"

    "example.com/parcelhub/internal/core"
)

// Seed stores the parcels in order and stops at the first failure.
func (s *Store) Seed(parcels ...core.Parcel) error {
    for _, parcel := range parcels {
        if err := s.Put(parcel); err != nil {
            return fmt.Errorf("memstore.Seed: %w", err)
        }
    }
    return nil
}
`,
  "internal/tracking/doc.go": goDoc('tracking', 'keeps the scan history of a parcel and answers lookups.'),
  "internal/tracking/service.go": gt`
package tracking

import (
    "fmt"

    "example.com/parcelhub/internal/core"
)

var _ core.Tracker = (*Service)(nil)

type Service struct {
    store core.Store
    clock core.Clock
}

func New(store core.Store, clock core.Clock) *Service {
    return &Service{store: store, clock: clock}
}

func (s *Service) Lookup(tag string) (core.Parcel, error) {
    parcel, err := s.store.Get(tag)
    if err != nil {
        return core.Parcel{}, fmt.Errorf("tracking.Lookup: %w", err)
    }
    return parcel, nil
}

func (s *Service) Advance(tag string, next core.State) error {
    parcel, err := s.store.Get(tag)
    if err != nil {
        return fmt.Errorf("tracking.Advance: %w", err)
    }
    parcel.Scans = append(parcel.Scans, core.Scan{State: next, At: s.clock.Now()})
    if err := s.store.Put(parcel); err != nil {
        return fmt.Errorf("tracking.Advance: %w", err)
    }
    return nil
}
`,
  "internal/tracking/history.go": gt`
package tracking

import "example.com/parcelhub/internal/core"

// LastState is the state of the newest scan, and false for a parcel never scanned.
func LastState(parcel core.Parcel) (core.State, bool) {
    if len(parcel.Scans) == 0 {
        return "", false
    }
    return parcel.Scans[len(parcel.Scans)-1].State, true
}

func IsDelivered(parcel core.Parcel) bool {
    state, ok := LastState(parcel)
    return ok && state == core.Delivered
}
`,
  "internal/depot/doc.go": goDoc('depot', 'assigns parcels to sorting bays.'),
  "internal/depot/bays.go": gt`
package depot

import "hash/fnv"

const Bays = 12

// BayFor spreads tags over the bays; the same tag always lands in the same bay.
func BayFor(tag string) int {
    h := fnv.New32a()
    _, _ = h.Write([]byte(tag))
    return int(h.Sum32()%Bays) + 1
}
`,
  "internal/depot/planner.go": gt`
package depot

import (
    "fmt"

    "example.com/parcelhub/internal/core"
)

type Planner struct {
    store core.Store
}

func New(store core.Store) *Planner { return &Planner{store: store} }

func (p *Planner) Assign(tag string) (int, error) {
    parcel, err := p.store.Get(tag)
    if err != nil {
        return 0, fmt.Errorf("depot.Assign: %w", err)
    }
    parcel.Bay = BayFor(tag)
    if err := p.store.Put(parcel); err != nil {
        return 0, fmt.Errorf("depot.Assign: %w", err)
    }
    return parcel.Bay, nil
}
`,
  "internal/httpapi/doc.go": goDoc('httpapi', 'serves the JSON endpoints over a core.Tracker.'),
  "internal/httpapi/server.go": gt`
package httpapi

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
    logger := log.New(os.Stderr, "httpapi ", log.LstdFlags)
    return middleware.Chain(mux, middleware.Recover(), middleware.Logging(logger))
}
`,
  "internal/httpapi/parcels.go": gt`
package httpapi

import (
    "errors"
    "fmt"
    "net/http"
    "strings"

    "example.com/parcelhub/internal/core"
    "example.com/parcelhub/internal/httpapi/render"
)

func (s *Server) parcel(w http.ResponseWriter, r *http.Request) {
    tag := strings.TrimPrefix(r.URL.Path, "/parcels/")
    parcel, err := s.tracker.Lookup(tag)
    if errors.Is(err, core.ErrNotFound) {
        render.Problem(w, http.StatusNotFound, "no such parcel")
        return
    }
    if err != nil {
        render.Problem(w, http.StatusInternalServerError, fmt.Sprintf("httpapi.parcel: %v", err))
        return
    }
    if err := render.JSON(w, http.StatusOK, parcel); err != nil {
        render.Problem(w, http.StatusInternalServerError, fmt.Sprintf("httpapi.parcel: %v", err))
    }
}
`,
  "internal/httpapi/server_test.go": gt`
package httpapi

import (
    "net/http"
    "net/http/httptest"
    "testing"

    "example.com/parcelhub/internal/core"
)

type fakeTracker struct{ err error }

func (f fakeTracker) Lookup(tag string) (core.Parcel, error) {
    return core.Parcel{Tag: tag}, f.err
}

func (f fakeTracker) Advance(string, core.State) error { return f.err }

func TestUnknownParcelIs404(t *testing.T) {
    server := New(fakeTracker{err: core.ErrNotFound})
    rec := httptest.NewRecorder()
    server.Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/parcels/PH-9", nil))
    if rec.Code != http.StatusNotFound {
        t.Fatalf("status = %d, want 404", rec.Code)
    }
}
`,
  "internal/httpapi/middleware/doc.go": goDoc('middleware', 'holds the handler wrappers the API stacks.'),
  "internal/httpapi/middleware/chain.go": gt`
package middleware

import "net/http"

type Middleware func(http.Handler) http.Handler

// Chain wraps next so the first middleware listed runs first.
func Chain(next http.Handler, middlewares ...Middleware) http.Handler {
    for i := len(middlewares) - 1; i >= 0; i-- {
        next = middlewares[i](next)
    }
    return next
}
`,
  "internal/httpapi/middleware/logging.go": gt`
package middleware

import (
    "log"
    "net/http"
)

func Logging(logger *log.Logger) Middleware {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            logger.Printf("%s %s", r.Method, r.URL.Path)
            next.ServeHTTP(w, r)
        })
    }
}
`,
  "internal/httpapi/middleware/recover.go": gt`
package middleware

import "net/http"

func Recover() Middleware {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            defer func() {
                if recover() != nil {
                    http.Error(w, "internal error", http.StatusInternalServerError)
                }
            }()
            next.ServeHTTP(w, r)
        })
    }
}
`,
  "internal/httpapi/render/doc.go": goDoc('render', 'writes JSON and problem replies.'),
  "internal/httpapi/render/json.go": gt`
package render

import (
    "encoding/json"
    "fmt"
    "net/http"
)

func JSON(w http.ResponseWriter, status int, value any) error {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(status)
    if err := json.NewEncoder(w).Encode(value); err != nil {
        return fmt.Errorf("render.JSON: %w", err)
    }
    return nil
}
`,
  "internal/httpapi/render/problem.go": gt`
package render

import "net/http"

func Problem(w http.ResponseWriter, status int, message string) {
    http.Error(w, message, status)
}
`,
  // ---- internal: many small packages, three files each
  "internal/tagging/doc.go": goDoc('tagging', 'reads and checks parcel tags such as PH-1042.'),
  "internal/tagging/tag.go": gt`
package tagging

import (
    "fmt"
    "strconv"
    "strings"

    "example.com/parcelhub/internal/core"
)

const Prefix = "PH-"

// Number is the numeric part of a tag.
func Number(tag string) (int, error) {
    if !strings.HasPrefix(tag, Prefix) {
        return 0, fmt.Errorf("tagging.Number: %w", core.ErrInvalid)
    }
    n, err := strconv.Atoi(strings.TrimPrefix(tag, Prefix))
    if err != nil {
        return 0, fmt.Errorf("tagging.Number: %w", core.ErrInvalid)
    }
    return n, nil
}
`,
  "internal/tagging/check.go": gt`
package tagging

func Valid(tag string) bool {
    _, err := Number(tag)
    return err == nil
}
`,
  "internal/labels/doc.go": goDoc('labels', 'renders the text printed on a parcel label.'),
  "internal/labels/label.go": gt`
package labels

import (
    "fmt"

    "example.com/parcelhub/internal/core"
)

func Text(parcel core.Parcel) string {
    return fmt.Sprintf("%s | zone %s | %dg | bay %d", parcel.Tag, parcel.Zone, parcel.Grams, parcel.Bay)
}
`,
  "internal/labels/barcode.go": gt`
package labels

import "fmt"

// Barcode pads the tag to the 12 characters the label printer expects.
func Barcode(tag string) string {
    return fmt.Sprintf("%-12s", tag)
}
`,
  "internal/routing/doc.go": goDoc('routing', 'maps postcodes to delivery zones.'),
  "internal/routing/table.go": gt`
package routing

var zones = map[string]string{
    "N": "north",
    "S": "south",
    "E": "east",
    "W": "west",
}
`,
  "internal/routing/zones.go": gt`
package routing

import "strings"

// ZoneFor picks the zone by the first letter of the postcode; unknown letters go to the hub.
func ZoneFor(postcode string) string {
    if postcode == "" {
        return "hub"
    }
    if zone, ok := zones[strings.ToUpper(postcode[:1])]; ok {
        return zone
    }
    return "hub"
}
`,
  "internal/customs/doc.go": goDoc('customs', 'checks the declaration of a cross-border parcel.'),
  "internal/customs/limits.go": gt`
package customs

const MaxValueCents = 15000000
`,
  "internal/customs/declaration.go": gt`
package customs

import (
    "fmt"

    "example.com/parcelhub/internal/core"
)

type Declaration struct {
    Tag        string
    Contents   string
    ValueCents int
}

func (d Declaration) Check() error {
    if d.Contents == "" || d.ValueCents <= 0 || d.ValueCents > MaxValueCents {
        return fmt.Errorf("customs.Check: %w", core.ErrInvalid)
    }
    return nil
}
`,
  "internal/rates/doc.go": goDoc('rates', 'holds the price bands by parcel weight.'),
  "internal/rates/table.go": gt`
package rates

type Band struct {
    UpToGrams int
    Cents     int
}

var bands = []Band{
    {UpToGrams: 500, Cents: 350},
    {UpToGrams: 2000, Cents: 620},
    {UpToGrams: 10000, Cents: 1450},
}
`,
  "internal/rates/lookup.go": gt`
package rates

import (
    "fmt"

    "example.com/parcelhub/internal/core"
)

// CentsFor is the price of the first band that holds the weight.
func CentsFor(grams int) (int, error) {
    for _, band := range bands {
        if grams <= band.UpToGrams {
            return band.Cents, nil
        }
    }
    return 0, fmt.Errorf("rates.CentsFor: %w", core.ErrInvalid)
}
`,
  "internal/pricing/doc.go": goDoc('pricing', 'quotes the price of a parcel from its weight and zone.'),
  "internal/pricing/surcharge.go": gt`
package pricing

func surcharge(zone string) int {
    if zone == "hub" {
        return 0
    }
    return 120
}
`,
  "internal/pricing/price.go": gt`
package pricing

import (
    "fmt"

    "example.com/parcelhub/internal/core"
    "example.com/parcelhub/internal/rates"
)

func Quote(parcel core.Parcel) (int, error) {
    base, err := rates.CentsFor(parcel.Grams)
    if err != nil {
        return 0, fmt.Errorf("pricing.Quote: %w", err)
    }
    return base + surcharge(parcel.Zone), nil
}
`,
  "internal/notify/doc.go": goDoc('notify', 'tells customers about scan changes.'),
  "internal/notify/message.go": gt`
package notify

import "fmt"

func format(tag string, message string) string {
    return fmt.Sprintf("[%s] %s", tag, message)
}
`,
  "internal/notify/console.go": gt`
package notify

import (
    "fmt"
    "io"

    "example.com/parcelhub/internal/core"
)

var _ core.Notifier = (*Console)(nil)

type Console struct{ Out io.Writer }

func (c *Console) Notify(tag string, message string) error {
    if _, err := fmt.Fprintln(c.Out, format(tag, message)); err != nil {
        return fmt.Errorf("notify.Notify: %w", err)
    }
    return nil
}
`,
  "internal/audit/doc.go": goDoc('audit', 'keeps an in-memory trail of what staff did.'),
  "internal/audit/event.go": gt`
package audit

type Event struct {
    Name    string
    Subject string
}
`,
  "internal/audit/log.go": gt`
package audit

import "example.com/parcelhub/internal/core"

var _ core.Auditor = (*Log)(nil)

type Log struct{ events []Event }

func New() *Log { return &Log{} }

func (l *Log) Record(event string, subject string) {
    l.events = append(l.events, Event{Name: event, Subject: subject})
}

func (l *Log) Events() []Event { return append([]Event(nil), l.events...) }
`,
  "internal/retention/doc.go": goDoc('retention', 'decides when scan history may be dropped.'),
  "internal/retention/days.go": gt`
package retention

const DefaultDays = 90
`,
  "internal/retention/policy.go": gt`
package retention

import (
    "time"

    "example.com/parcelhub/internal/core"
)

// Expired reports whether the newest scan is older than days, by the injected clock.
func Expired(parcel core.Parcel, clock core.Clock, days int) bool {
    if len(parcel.Scans) == 0 {
        return false
    }
    newest := parcel.Scans[len(parcel.Scans)-1].At
    return clock.Now().Sub(newest) > time.Duration(days)*24*time.Hour
}
`,
  "internal/geo/doc.go": goDoc('geo', 'measures distances between depots.'),
  "internal/geo/point.go": gt`
package geo

type Point struct {
    Lat float64
    Lon float64
}
`,
  "internal/geo/distance.go": gt`
package geo

import "math"

const earthKm = 6371.0

// Km is the great-circle distance between two points.
func Km(a, b Point) float64 {
    rad := math.Pi / 180
    dLat := (b.Lat - a.Lat) * rad
    dLon := (b.Lon - a.Lon) * rad
    h := math.Sin(dLat/2)*math.Sin(dLat/2) + math.Cos(a.Lat*rad)*math.Cos(b.Lat*rad)*math.Sin(dLon/2)*math.Sin(dLon/2)
    return 2 * earthKm * math.Asin(math.Sqrt(h))
}
`,
  "internal/manifest/doc.go": goDoc('manifest', 'builds the list a van driver carries.'),
  "internal/manifest/manifest.go": gt`
package manifest

type Manifest struct {
    Stops map[string][]string
}

func (m Manifest) Count() int {
    total := 0
    for _, tags := range m.Stops {
        total += len(tags)
    }
    return total
}
`,
  "internal/manifest/build.go": gt`
package manifest

import "example.com/parcelhub/internal/core"

// Build groups parcels by zone.
func Build(parcels []core.Parcel) Manifest {
    stops := map[string][]string{}
    for _, parcel := range parcels {
        stops[parcel.Zone] = append(stops[parcel.Zone], parcel.Tag)
    }
    return Manifest{Stops: stops}
}
`,
  "internal/returns/doc.go": goDoc('returns', 'sends a parcel back to its sender.'),
  "internal/returns/reasons.go": gt`
package returns

var reasons = map[string]bool{
    "refused":       true,
    "damaged":       true,
    "wrong-address": true,
}

func ValidReason(reason string) bool { return reasons[reason] }
`,
  "internal/returns/flow.go": gt`
package returns

import (
    "fmt"

    "example.com/parcelhub/internal/core"
)

// Start moves the parcel back to the depot and stamps the time from the injected clock.
func Start(store core.Store, clock core.Clock, tag string, reason string) error {
    if !ValidReason(reason) {
        return fmt.Errorf("returns.Start: %w", core.ErrInvalid)
    }
    parcel, err := store.Get(tag)
    if err != nil {
        return fmt.Errorf("returns.Start: %w", err)
    }
    parcel.Scans = append(parcel.Scans, core.Scan{State: core.AtDepot, At: clock.Now()})
    if err := store.Put(parcel); err != nil {
        return fmt.Errorf("returns.Start: %w", err)
    }
    return nil
}
`,
  "internal/slots/doc.go": goDoc('slots', 'offers and books delivery slots.'),
  "internal/slots/slot.go": gt`
package slots

import "time"

type Slot struct {
    From   time.Time
    Booked bool
}

// Open lists the four two-hour slots of a day, starting at 08:00.
func Open(day time.Time) []Slot {
    start := time.Date(day.Year(), day.Month(), day.Day(), 8, 0, 0, 0, day.Location())
    out := make([]Slot, 0, 4)
    for i := 0; i < 4; i++ {
        out = append(out, Slot{From: start.Add(time.Duration(2*i) * time.Hour)})
    }
    return out
}
`,
  "internal/slots/book.go": gt`
package slots

import (
    "fmt"

    "example.com/parcelhub/internal/core"
)

func Book(all []Slot, index int) ([]Slot, error) {
    if index < 0 || index >= len(all) || all[index].Booked {
        return all, fmt.Errorf("slots.Book: %w", core.ErrInvalid)
    }
    out := append([]Slot(nil), all...)
    out[index].Booked = true
    return out, nil
}
`,
  "internal/scanner/doc.go": goDoc('scanner', 'parses lines from the handheld scanners.'),
  "internal/scanner/states.go": gt`
package scanner

import "example.com/parcelhub/internal/core"

var states = map[string]core.State{
    "COL": core.Collected,
    "DEP": core.AtDepot,
    "VAN": core.OnVan,
    "DLV": core.Delivered,
}
`,
  "internal/scanner/parse.go": gt`
package scanner

import (
    "fmt"
    "strings"

    "example.com/parcelhub/internal/core"
)

// Parse reads "PH-1042 DEP" into a tag and a state.
func Parse(line string) (string, core.State, error) {
    fields := strings.Fields(line)
    if len(fields) != 2 {
        return "", "", fmt.Errorf("scanner.Parse: %w", core.ErrInvalid)
    }
    state, ok := states[fields[1]]
    if !ok {
        return "", "", fmt.Errorf("scanner.Parse: %w", core.ErrInvalid)
    }
    return fields[0], state, nil
}
`,
  // ---- internal: one chain nested five levels, each level holds code
  "internal/carrier/doc.go": goDoc('carrier', 'names the carriers whose networks the depot hands parcels to.'),
  "internal/carrier/carrier.go": gt`
package carrier

type Name string

const Regional Name = "regional"
`,
  "internal/carrier/regional/doc.go": goDoc('regional', 'models the regional carrier and its hubs.'),
  "internal/carrier/regional/hub.go": gt`
package regional

import "example.com/parcelhub/internal/carrier"

type Hub struct {
    Carrier carrier.Name
    Code    string
}

func NewHub(code string) Hub { return Hub{Carrier: carrier.Regional, Code: code} }
`,
  "internal/carrier/regional/sortline/doc.go": goDoc('sortline', 'models a sorting line inside a hub.'),
  "internal/carrier/regional/sortline/line.go": gt`
package sortline

import (
    "fmt"

    "example.com/parcelhub/internal/carrier/regional"
)

type Line struct {
    Hub    regional.Hub
    Number int
}

func (l Line) ID() string { return fmt.Sprintf("%s-L%d", l.Hub.Code, l.Number) }
`,
  "internal/carrier/regional/sortline/belt/doc.go": goDoc('belt', 'models the conveyor belt of a sorting line.'),
  "internal/carrier/regional/sortline/belt/belt.go": gt`
package belt

import "example.com/parcelhub/internal/carrier/regional/sortline"

type Belt struct {
    Line     sortline.Line
    SpeedMMs int
}

func (b Belt) Slow() bool { return b.SpeedMMs < 400 }
`,
  "internal/carrier/regional/sortline/belt/sensor/doc.go": goDoc('sensor', 'checks the photo-eyes along a belt for jams.'),
  "internal/carrier/regional/sortline/belt/sensor/thresholds.go": gt`
package sensor

const JamAfterBlocked = 3
`,
  "internal/carrier/regional/sortline/belt/sensor/sensor.go": gt`
package sensor

import "example.com/parcelhub/internal/carrier/regional/sortline/belt"

type Reading struct {
    Belt belt.Belt
    Jam  bool
}

// Check flags a jam once the eyes stayed blocked for JamAfterBlocked scans on a slow belt.
func Check(b belt.Belt, blocked int) Reading {
    return Reading{Belt: b, Jam: b.Slow() && blocked >= JamAfterBlocked}
}
`,
  // ---- tests
  "internal/depot/depot_test.go": gt`
package depot

import "testing"

func TestBayForStaysInRange(t *testing.T) {
    for _, tag := range []string{"PH-1", "PH-2", "PH-977"} {
        if bay := BayFor(tag); bay < 1 || bay > Bays {
            t.Fatalf("BayFor(%q) = %d, outside 1..%d", tag, bay, Bays)
        }
    }
}
`,
  "internal/tracking/tracking_test.go": gt`
package tracking

import (
    "errors"
    "testing"
    "time"

    "example.com/parcelhub/internal/clock"
    "example.com/parcelhub/internal/core"
    "example.com/parcelhub/internal/memstore"
)

func TestAdvanceRecordsTheScanTime(t *testing.T) {
    at := time.Date(2026, 3, 1, 9, 0, 0, 0, time.UTC)
    store := memstore.New()
    if err := store.Seed(core.Parcel{Tag: "PH-1"}); err != nil {
        t.Fatal(err)
    }
    service := New(store, clock.Fixed{At: at})

    if err := service.Advance("PH-1", core.AtDepot); err != nil {
        t.Fatal(err)
    }
    parcel, _ := service.Lookup("PH-1")
    if got := parcel.Scans[0].At; !got.Equal(at) {
        t.Fatalf("scan time = %v, want %v", got, at)
    }
}

func TestLookupMissingParcel(t *testing.T) {
    service := New(memstore.New(), clock.Fixed{})
    _, err := service.Lookup("PH-404")
    if !errors.Is(err, core.ErrNotFound) {
        t.Fatalf("err = %v, want ErrNotFound", err)
    }
}
`,
  "internal/rates/rates_test.go": gt`
package rates

import "testing"

func TestCentsForPicksTheFirstBandThatFits(t *testing.T) {
    got, err := CentsFor(1200)
    if err != nil || got != 620 {
        t.Fatalf("CentsFor(1200) = %d, %v; want 620", got, err)
    }
    if _, err := CentsFor(50000); err == nil {
        t.Fatal("a 50 kg parcel should have no band")
    }
}
`,
};

// Kotlin sources: [gradle project, package below org.seedvault, file name, body]; the package line is added here.
const KT = [
  // ---- domain: imports nothing but the JDK
  ['domain', 'domain.shared', 'Ids.kt', t`
@JvmInline
value class LotId(val value: String)

@JvmInline
value class SpeciesId(val value: String)

@JvmInline
value class TrayId(val value: String)

@JvmInline
value class VaultId(val value: String)

@JvmInline
value class DonorId(val value: String)
`],
  ['domain', 'domain.shared', 'Outcome.kt', t`
sealed interface Outcome<out T> {
    data class Ok<T>(val value: T) : Outcome<T>

    data class Rejected(val reason: String) : Outcome<Nothing>
}

inline fun <T, R> Outcome<T>.map(transform: (T) -> R): Outcome<R> =
    when (this) {
        is Outcome.Ok -> Outcome.Ok(transform(value))
        is Outcome.Rejected -> this
    }
`],
  ['domain', 'domain.shared', 'Quantity.kt', t`
@JvmInline
value class Grams(val value: Int) {
    operator fun plus(other: Grams): Grams = Grams(value + other.value)
}
`],
  ['domain', 'domain.lot', 'SeedLot.kt', t`
import org.seedvault.domain.shared.LotId
import org.seedvault.domain.shared.SpeciesId
import org.seedvault.domain.shared.VaultId
import java.time.LocalDate

data class SeedLot(
    val id: LotId,
    val species: SpeciesId,
    val storedOn: LocalDate,
    val viability: Viability,
    val status: LotStatus = LotStatus.Banked,
    val vault: VaultId? = null,
)
`],
  ['domain', 'domain.lot', 'LotStatus.kt', t`
enum class LotStatus { Banked, Sown, Retired }
`],
  ['domain', 'domain.lot', 'Viability.kt', t`
const val VIABILITY_FLOOR_PERCENT = 50

@JvmInline
value class Viability(val percent: Int) {
    fun isViable(): Boolean = percent >= VIABILITY_FLOOR_PERCENT
}
`],
  ['domain', 'domain.species', 'Species.kt', t`
import org.seedvault.domain.shared.SpeciesId

data class Species(
    val id: SpeciesId,
    val name: String,
    val taxon: Taxon,
    val dormancy: Dormancy,
)
`],
  ['domain', 'domain.species', 'Taxon.kt', t`
data class Taxon(val family: String, val genus: String)
`],
  ['domain', 'domain.species', 'Dormancy.kt', t`
enum class Dormancy(val chillDays: Int) {
    None(0),
    Cold(30),
    Warm(14),
}
`],
  ['domain', 'domain.storage', 'Vault.kt', t`
import org.seedvault.domain.shared.VaultId

data class Vault(val id: VaultId, val name: String, val shelves: List<Shelf>) {
    fun capacity(): Int = shelves.sumOf { it.capacity }
}
`],
  ['domain', 'domain.storage', 'Shelf.kt', t`
data class Shelf(val label: String, val capacity: Int, val temperature: Temperature)
`],
  ['domain', 'domain.storage', 'Temperature.kt', t`
data class Temperature(val celsius: Int) {
    fun isFreezer(): Boolean = celsius <= -15
}
`],
  ['domain', 'domain.germination', 'Sowing.kt', t`
import org.seedvault.domain.lot.SeedLot

data class Sowing(val lot: SeedLot, val trays: Int)
`],
  ['domain', 'domain.germination', 'Tray.kt', t`
import org.seedvault.domain.shared.TrayId

data class Tray(val id: TrayId, val capacity: Int)
`],
  ['domain', 'domain.germination', 'GerminationRules.kt', t`
import org.seedvault.domain.lot.LotStatus
import org.seedvault.domain.lot.SeedLot
import org.seedvault.domain.shared.Outcome
import java.time.LocalDate

const val MAX_AGE_YEARS = 10L

object GerminationRules {
    fun check(lot: SeedLot, today: LocalDate): Outcome<SeedLot> {
        if (lot.status != LotStatus.Banked) return Outcome.Rejected("lot §{lot.id.value} is not banked")
        if (!lot.viability.isViable()) return Outcome.Rejected("lot §{lot.id.value} is below the viability floor")
        if (lot.storedOn.plusYears(MAX_AGE_YEARS).isBefore(today)) return Outcome.Rejected("lot §{lot.id.value} is older than §MAX_AGE_YEARS years")
        return Outcome.Ok(lot)
    }
}
`],
  ['domain', 'domain.events', 'DomainEvent.kt', t`
import java.time.Instant

sealed interface DomainEvent {
    val at: Instant
}
`],
  ['domain', 'domain.events', 'LotEvents.kt', t`
import org.seedvault.domain.shared.LotId
import java.time.Instant

data class LotRegistered(val lotId: LotId, override val at: Instant) : DomainEvent

data class LotRetired(val lotId: LotId, override val at: Instant) : DomainEvent
`],
  ['domain', 'domain.events', 'GerminationEvents.kt', t`
import org.seedvault.domain.shared.LotId
import java.time.Instant

data class LotSown(val lotId: LotId, val trays: Int, override val at: Instant) : DomainEvent
`],
  ['domain', 'domain.donor', 'Donor.kt', t`
import org.seedvault.domain.shared.DonorId

data class Donor(val id: DonorId, val name: String)
`],
  ['domain', 'domain.donor', 'Donation.kt', t`
import org.seedvault.domain.shared.LotId
import java.time.LocalDate

data class Donation(val donor: Donor, val lotId: LotId, val receivedOn: LocalDate)
`],
  ['domain', 'domain.donor', 'Agreement.kt', t`
data class Agreement(val donor: Donor, val restrictsSowing: Boolean)
`],
  // ---- application: use cases behind input ports, output ports it needs
  ['application', 'application.port.input', 'RegisterLot.kt', t`
import org.seedvault.domain.lot.SeedLot
import org.seedvault.domain.shared.LotId
import org.seedvault.domain.shared.Outcome
import org.seedvault.domain.shared.SpeciesId
import java.time.LocalDate

data class RegisterLotCommand(
    val id: LotId,
    val species: SpeciesId,
    val storedOn: LocalDate,
    val viabilityPercent: Int,
)

interface RegisterLot {
    operator fun invoke(command: RegisterLotCommand): Outcome<SeedLot>
}
`],
  ['application', 'application.port.input', 'SowLot.kt', t`
import org.seedvault.domain.germination.Sowing
import org.seedvault.domain.shared.LotId
import org.seedvault.domain.shared.Outcome

data class SowLotCommand(val lotId: LotId, val trays: Int)

interface SowLot {
    operator fun invoke(command: SowLotCommand): Outcome<Sowing>
}
`],
  ['application', 'application.port.input', 'LotLifecycle.kt', t`
import org.seedvault.domain.lot.SeedLot
import org.seedvault.domain.shared.LotId
import org.seedvault.domain.shared.Outcome

interface FindLot {
    operator fun invoke(id: LotId): Outcome<SeedLot>
}

interface RetireLot {
    operator fun invoke(id: LotId): Outcome<SeedLot>
}
`],
  ['application', 'application.port.input', 'ReportStock.kt', t`
data class StockReport(val viable: Int, val bySpecies: Map<String, Int>)

interface ReportStock {
    operator fun invoke(): StockReport
}
`],
  ['application', 'application.port.output', 'LotRepository.kt', t`
import org.seedvault.domain.lot.SeedLot
import org.seedvault.domain.shared.LotId

interface LotRepository {
    fun find(id: LotId): SeedLot?

    fun save(lot: SeedLot)

    fun all(): List<SeedLot>
}
`],
  ['application', 'application.port.output', 'SpeciesCatalog.kt', t`
import org.seedvault.domain.shared.SpeciesId
import org.seedvault.domain.species.Species

interface SpeciesCatalog {
    fun find(id: SpeciesId): Species?
}
`],
  ['application', 'application.port.output', 'EventPublisher.kt', t`
import org.seedvault.domain.events.DomainEvent

fun interface EventPublisher {
    fun publish(event: DomainEvent)
}
`],
  ['application', 'application.usecase.lot', 'RegisterLotService.kt', t`
import org.seedvault.application.port.input.FindLot
import org.seedvault.application.port.input.RegisterLot
import org.seedvault.application.port.input.RegisterLotCommand
import org.seedvault.application.port.output.EventPublisher
import org.seedvault.application.port.output.LotRepository
import org.seedvault.application.port.output.SpeciesCatalog
import org.seedvault.domain.events.LotRegistered
import org.seedvault.domain.lot.SeedLot
import org.seedvault.domain.lot.Viability
import org.seedvault.domain.shared.Outcome
import org.slf4j.LoggerFactory
import java.time.Clock

class RegisterLotService(
    private val lots: LotRepository,
    private val species: SpeciesCatalog,
    private val events: EventPublisher,
    private val clock: Clock,
) : RegisterLot {
    private val log = LoggerFactory.getLogger(RegisterLotService::class.java)

    override fun invoke(command: RegisterLotCommand): Outcome<SeedLot> {
        if (lots.find(command.id) != null) return Outcome.Rejected("lot §{command.id.value} is already registered")
        if (species.find(command.species) == null) return Outcome.Rejected("no species named §{command.species.value}")
        if (command.viabilityPercent !in 0..100) return Outcome.Rejected("viability must be a percentage")
        val lot = SeedLot(command.id, command.species, command.storedOn, Viability(command.viabilityPercent))
        lots.save(lot)
        events.publish(LotRegistered(lot.id, clock.instant()))
        log.atInfo().addKeyValue("lotId", command.id.value).addKeyValue("species", command.species.value).log("lot.registered")
        return Outcome.Ok(lot)
    }
}
`],
  ['application', 'application.usecase.lot', 'FindLotService.kt', t`
import org.seedvault.application.port.input.FindLot
import org.seedvault.application.port.output.LotRepository
import org.seedvault.domain.lot.SeedLot
import org.seedvault.domain.shared.LotId
import org.seedvault.domain.shared.Outcome

class FindLotService(private val lots: LotRepository) : FindLot {
    override fun invoke(id: LotId): Outcome<SeedLot> {
        val lot = lots.find(id) ?: return Outcome.Rejected("no lot named §{id.value}")
        return Outcome.Ok(lot)
    }
}
`],
  ['application', 'application.usecase.lot', 'RetireLotService.kt', t`
import org.seedvault.application.port.input.RetireLot
import org.seedvault.application.port.output.EventPublisher
import org.seedvault.application.port.output.LotRepository
import org.seedvault.domain.events.LotRetired
import org.seedvault.domain.lot.LotStatus
import org.seedvault.domain.lot.SeedLot
import org.seedvault.domain.shared.LotId
import org.seedvault.domain.shared.Outcome
import org.slf4j.LoggerFactory
import java.time.Clock

class RetireLotService(
    private val lots: LotRepository,
    private val events: EventPublisher,
    private val clock: Clock,
) : RetireLot {
    private val log = LoggerFactory.getLogger(RetireLotService::class.java)

    override fun invoke(id: LotId): Outcome<SeedLot> {
        val lot = lots.find(id) ?: return Outcome.Rejected("no lot named §{id.value}")
        val retired = lot.copy(status = LotStatus.Retired)
        lots.save(retired)
        events.publish(LotRetired(id, clock.instant()))
        log.atInfo().addKeyValue("lotId", id.value).log("lot.retired")
        return Outcome.Ok(retired)
    }
}
`],
  ['application', 'application.usecase.germination', 'SowLotService.kt', t`
import org.seedvault.application.port.input.SowLot
import org.seedvault.application.port.input.SowLotCommand
import org.seedvault.application.port.output.EventPublisher
import org.seedvault.application.port.output.LotRepository
import org.seedvault.application.usecase.donor.AgreementCheck
import org.seedvault.domain.events.LotSown
import org.seedvault.domain.germination.GerminationRules
import org.seedvault.domain.germination.Sowing
import org.seedvault.domain.lot.LotStatus
import org.seedvault.domain.shared.Outcome
import org.slf4j.LoggerFactory
import java.time.Clock
import java.time.LocalDate

class SowLotService(
    private val lots: LotRepository,
    private val events: EventPublisher,
    private val agreements: AgreementCheck,
    private val clock: Clock,
) : SowLot {
    private val log = LoggerFactory.getLogger(SowLotService::class.java)

    override fun invoke(command: SowLotCommand): Outcome<Sowing> {
        val lot = lots.find(command.lotId) ?: return Outcome.Rejected("no lot named §{command.lotId.value}")
        val checked = GerminationRules.check(lot, LocalDate.now(clock))
        if (checked is Outcome.Rejected) return checked
        if (agreements.blocks(lot)) return Outcome.Rejected("the donor of §{command.lotId.value} restricts sowing")
        lots.save(lot.copy(status = LotStatus.Sown))
        events.publish(LotSown(lot.id, command.trays, clock.instant()))
        log.atInfo().addKeyValue("lotId", command.lotId.value).addKeyValue("trays", command.trays).log("lot.sown")
        return Outcome.Ok(Sowing(lot, command.trays))
    }
}
`],
  ['application', 'application.usecase.germination', 'TrayPlanner.kt', t`
import org.seedvault.domain.germination.Tray
import org.seedvault.domain.shared.TrayId

class TrayPlanner(private val trayCapacity: Int) {
    fun traysFor(seedCount: Int): List<Tray> {
        val count = (seedCount + trayCapacity - 1) / trayCapacity
        return (1..count).map { Tray(TrayId(trayName(it)), trayCapacity) }
    }
}
`],
  ['application', 'application.usecase.germination', 'TrayNames.kt', t`
fun trayName(index: Int): String = "T-" + index.toString().padStart(3, '0')
`],
  ['application', 'application.usecase.report', 'StockReportService.kt', t`
import org.seedvault.application.port.input.ReportStock
import org.seedvault.application.port.input.StockReport
import org.seedvault.application.port.output.LotRepository

class StockReportService(private val lots: LotRepository) : ReportStock {
    override fun invoke(): StockReport {
        val all = lots.all()
        return StockReport(viable = all.count { it.viability.isViable() }, bySpecies = tallyBySpecies(all))
    }
}
`],
  ['application', 'application.usecase.report', 'SpeciesTally.kt', t`
import org.seedvault.domain.lot.SeedLot

fun tallyBySpecies(lots: List<SeedLot>): Map<String, Int> =
    lots.groupingBy { it.species.value }.eachCount()
`],
  ['application', 'application.usecase.report', 'ViabilityBands.kt', t`
import org.seedvault.domain.lot.SeedLot

fun viabilityBands(lots: List<SeedLot>): Map<String, Int> =
    lots.groupingBy { band(it.viability.percent) }.eachCount()

private fun band(percent: Int): String =
    when {
        percent >= 90 -> "excellent"
        percent >= 50 -> "viable"
        else -> "weak"
    }
`],
  ['application', 'application.usecase.donor', 'DonationLedger.kt', t`
import org.seedvault.domain.donor.Donation
import org.seedvault.domain.shared.LotId

class DonationLedger {
    private val byLot = mutableMapOf<LotId, Donation>()

    fun record(donation: Donation) {
        byLot[donation.lotId] = donation
    }

    fun donationOf(id: LotId): Donation? = byLot[id]
}
`],
  ['application', 'application.usecase.donor', 'DonorDirectory.kt', t`
import org.seedvault.domain.donor.Agreement
import org.seedvault.domain.shared.DonorId

class DonorDirectory(agreements: List<Agreement>) {
    private val byDonor = agreements.associateBy { it.donor.id }

    fun agreementOf(id: DonorId): Agreement? = byDonor[id]
}
`],
  ['application', 'application.usecase.donor', 'AgreementCheck.kt', t`
import org.seedvault.domain.lot.SeedLot

class AgreementCheck(private val ledger: DonationLedger, private val directory: DonorDirectory) {
    fun blocks(lot: SeedLot): Boolean {
        val donation = ledger.donationOf(lot.id) ?: return false
        return directory.agreementOf(donation.donor.id)?.restrictsSowing == true
    }
}
`],
  // ---- adapters
  ['adapters/persistence', 'adapters.persistence.memory', 'InMemoryLotRepository.kt', t`
import org.seedvault.application.port.output.LotRepository
import org.seedvault.domain.lot.SeedLot
import org.seedvault.domain.shared.LotId

class InMemoryLotRepository : LotRepository {
    private val lots = linkedMapOf<LotId, SeedLot>()

    override fun find(id: LotId): SeedLot? = lots[id]

    override fun save(lot: SeedLot) {
        lots[lot.id] = lot
    }

    override fun all(): List<SeedLot> = lots.values.toList()
}
`],
  ['adapters/persistence', 'adapters.persistence.memory', 'InMemorySpeciesCatalog.kt', t`
import org.seedvault.application.port.output.SpeciesCatalog
import org.seedvault.domain.shared.SpeciesId
import org.seedvault.domain.species.Species

class InMemorySpeciesCatalog(species: List<Species> = MemoryTables.species) : SpeciesCatalog {
    private val byId = species.associateBy { it.id }

    override fun find(id: SpeciesId): Species? = byId[id]
}
`],
  ['adapters/persistence', 'adapters.persistence.memory', 'MemoryTables.kt', t`
import org.seedvault.domain.shared.SpeciesId
import org.seedvault.domain.species.Dormancy
import org.seedvault.domain.species.Species
import org.seedvault.domain.species.Taxon

object MemoryTables {
    val species = listOf(
        Species(SpeciesId("barley"), "Barley", Taxon("Poaceae", "Hordeum"), Dormancy.None),
        Species(SpeciesId("rye"), "Rye", Taxon("Poaceae", "Secale"), Dormancy.Cold),
        Species(SpeciesId("oat"), "Oat", Taxon("Poaceae", "Avena"), Dormancy.Warm),
    )
}
`],
  ['adapters/persistence', 'adapters.persistence.file', 'FileLotRepository.kt', t`
import org.seedvault.application.port.output.LotRepository
import org.seedvault.domain.lot.SeedLot
import org.seedvault.domain.shared.LotId
import java.nio.file.Files
import java.nio.file.Path

class FileLotRepository(private val file: Path) : LotRepository {
    override fun find(id: LotId): SeedLot? = all().firstOrNull { it.id == id }

    override fun save(lot: SeedLot) {
        val others = all().filter { it.id != lot.id }
        Files.write(file, (others + lot).map(::encodeLot))
    }

    override fun all(): List<SeedLot> =
        if (Files.exists(file)) Files.readAllLines(file).filter { it.isNotBlank() }.map(::decodeLot) else emptyList()
}
`],
  ['adapters/persistence', 'adapters.persistence.file', 'LotCodec.kt', t`
import org.seedvault.domain.lot.LotStatus
import org.seedvault.domain.lot.SeedLot
import org.seedvault.domain.lot.Viability
import org.seedvault.domain.shared.LotId
import org.seedvault.domain.shared.SpeciesId
import java.time.LocalDate

fun encodeLot(lot: SeedLot): String =
    listOf(lot.id.value, lot.species.value, lot.storedOn, lot.viability.percent, lot.status).joinToString(";")

fun decodeLot(line: String): SeedLot {
    val (id, species, stored, percent, status) = line.split(";")
    return SeedLot(LotId(id), SpeciesId(species), LocalDate.parse(stored), Viability(percent.toInt()), LotStatus.valueOf(status))
}
`],
  ['adapters/persistence', 'adapters.persistence.file', 'StoragePaths.kt', t`
import java.nio.file.Path

fun lotsFile(directory: Path): Path = directory.resolve("lots.csv")
`],
  ['adapters/persistence', 'adapters.persistence.cache', 'CachedLotRepository.kt', t`
import org.seedvault.application.port.output.LotRepository
import org.seedvault.domain.lot.SeedLot
import org.seedvault.domain.shared.LotId

class CachedLotRepository(
    private val inner: LotRepository,
    private val stats: CacheStats = CacheStats(),
) : LotRepository {
    private val cache = mutableMapOf<LotId, SeedLot>()

    override fun find(id: LotId): SeedLot? {
        cache[id]?.let {
            stats.hits++
            return it
        }
        stats.misses++
        return inner.find(id)?.also { cache[id] = it }
    }

    override fun save(lot: SeedLot) {
        cache[lot.id] = lot
        inner.save(lot)
    }

    override fun all(): List<SeedLot> = inner.all()
}
`],
  ['adapters/persistence', 'adapters.persistence.cache', 'CacheStats.kt', t`
class CacheStats {
    var hits: Int = 0
    var misses: Int = 0

    fun hitRate(): Double = if (hits + misses == 0) 0.0 else hits.toDouble() / (hits + misses)
}
`],
  ['adapters/persistence', 'adapters.persistence.cache', 'CachePolicy.kt', t`
const val MAX_CACHED_LOTS = 5_000
`],
  ['adapters/rest', 'adapters.rest.server', 'HttpApi.kt', t`
import com.sun.net.httpserver.HttpServer
import java.net.InetSocketAddress

class HttpApi(private val routes: List<Route>) {
    fun start(port: Int): HttpServer {
        val server = HttpServer.create(InetSocketAddress(port), 0)
        server.createContext("/") { exchange ->
            val route = routes.firstOrNull { it.matches(exchange.requestMethod, exchange.requestURI.path) }
            val response = route?.handle(exchange.requestURI.path) ?: Response(404, json("error" to "not found"))
            val bytes = response.body.toByteArray()
            exchange.sendResponseHeaders(response.status, bytes.size.toLong())
            exchange.responseBody.use { it.write(bytes) }
        }
        server.start()
        return server
    }
}
`],
  ['adapters/rest', 'adapters.rest.server', 'Router.kt', t`
data class Response(val status: Int, val body: String)

class Route(private val method: String, private val prefix: String, private val handler: (String) -> Response) {
    fun matches(requestMethod: String, path: String): Boolean = requestMethod == method && path.startsWith(prefix)

    fun handle(path: String): Response = handler(path.removePrefix(prefix))
}
`],
  ['adapters/rest', 'adapters.rest.server', 'Json.kt', t`
fun json(vararg pairs: Pair<String, Any?>): String =
    pairs.joinToString(prefix = "{", postfix = "}") { (key, value) ->
        "\"§key\":" + if (value is Number || value is Boolean) "§value" else "\"§value\""
    }
`],
  ['adapters/rest', 'adapters.rest.dto', 'LotDto.kt', t`
import org.seedvault.domain.lot.SeedLot

data class LotDto(val id: String, val species: String, val viabilityPercent: Int, val status: String)

fun SeedLot.toDto(): LotDto = LotDto(id.value, species.value, viability.percent, status.name)
`],
  ['adapters/rest', 'adapters.rest.dto', 'SowingDto.kt', t`
import org.seedvault.domain.germination.Sowing

data class SowingDto(val lotId: String, val trays: Int)

fun Sowing.toDto(): SowingDto = SowingDto(lot.id.value, trays)
`],
  ['adapters/rest', 'adapters.rest.dto', 'ErrorDto.kt', t`
import org.seedvault.adapters.rest.server.Response
import org.seedvault.adapters.rest.server.json

fun rejected(reason: String): Response = Response(422, json("error" to reason))
`],
  ['adapters/rest', 'adapters.rest.routes', 'LotRoutes.kt', t`
import org.seedvault.adapters.rest.dto.rejected
import org.seedvault.adapters.rest.dto.toDto
import org.seedvault.adapters.rest.server.Response
import org.seedvault.adapters.rest.server.Route
import org.seedvault.adapters.rest.server.json
import org.seedvault.application.port.input.FindLot
import org.seedvault.domain.shared.LotId
import org.seedvault.domain.shared.Outcome

class LotRoutes(private val findLot: FindLot) {
    fun routes(): List<Route> = listOf(Route("GET", "/lots/") { id -> show(id) })

    private fun show(id: String): Response =
        when (val outcome = findLot(LotId(id))) {
            is Outcome.Ok -> Response(200, json("id" to outcome.value.toDto().id, "status" to outcome.value.toDto().status))
            is Outcome.Rejected -> rejected(outcome.reason)
        }
}
`],
  ['adapters/rest', 'adapters.rest.routes', 'GerminationRoutes.kt', t`
import org.seedvault.adapters.rest.dto.rejected
import org.seedvault.adapters.rest.dto.toDto
import org.seedvault.adapters.rest.server.Response
import org.seedvault.adapters.rest.server.Route
import org.seedvault.adapters.rest.server.json
import org.seedvault.application.port.input.SowLot
import org.seedvault.application.port.input.SowLotCommand
import org.seedvault.domain.shared.LotId
import org.seedvault.domain.shared.Outcome

class GerminationRoutes(private val sowLot: SowLot) {
    fun routes(): List<Route> = listOf(Route("POST", "/sow/") { id -> sow(id) })

    private fun sow(id: String): Response =
        when (val outcome = sowLot(SowLotCommand(LotId(id), trays = 1))) {
            is Outcome.Ok -> Response(201, json("lotId" to outcome.value.toDto().lotId, "trays" to outcome.value.toDto().trays))
            is Outcome.Rejected -> rejected(outcome.reason)
        }
}
`],
  ['adapters/rest', 'adapters.rest.routes', 'ReportRoutes.kt', t`
import org.seedvault.adapters.rest.server.Response
import org.seedvault.adapters.rest.server.Route
import org.seedvault.adapters.rest.server.json
import org.seedvault.application.port.input.ReportStock

class ReportRoutes(private val reportStock: ReportStock) {
    fun routes(): List<Route> = listOf(Route("GET", "/report") { _ -> Response(200, json("viable" to reportStock().viable)) })
}
`],
  ['adapters/messaging', 'adapters.messaging.bus', 'InProcessEventBus.kt', t`
import org.seedvault.application.port.output.EventPublisher
import org.seedvault.domain.events.DomainEvent

class InProcessEventBus(private val subscriptions: Subscriptions) : EventPublisher {
    override fun publish(event: DomainEvent) {
        subscriptions.handlersFor(topicOf(event)).forEach { it(event) }
    }
}
`],
  ['adapters/messaging', 'adapters.messaging.bus', 'Subscriptions.kt', t`
import org.seedvault.domain.events.DomainEvent

class Subscriptions {
    private val handlers = mutableMapOf<String, MutableList<(DomainEvent) -> Unit>>()

    fun add(topic: String, handler: (DomainEvent) -> Unit) {
        handlers.getOrPut(topic) { mutableListOf() }.add(handler)
    }

    fun handlersFor(topic: String): List<(DomainEvent) -> Unit> = handlers[topic].orEmpty()
}
`],
  ['adapters/messaging', 'adapters.messaging.bus', 'Topic.kt', t`
import org.seedvault.domain.events.DomainEvent
import org.seedvault.domain.events.LotRegistered
import org.seedvault.domain.events.LotRetired
import org.seedvault.domain.events.LotSown

fun topicOf(event: DomainEvent): String =
    when (event) {
        is LotRegistered -> "lot.registered"
        is LotRetired -> "lot.retired"
        is LotSown -> "lot.sown"
    }
`],
  ['adapters/messaging', 'adapters.messaging.outbox', 'Outbox.kt', t`
import org.seedvault.application.port.output.EventPublisher
import org.seedvault.domain.events.DomainEvent

class Outbox : EventPublisher {
    private val entries = mutableListOf<OutboxEntry>()

    override fun publish(event: DomainEvent) {
        entries += OutboxEntry(entries.size.toLong(), event)
    }

    fun pending(): List<OutboxEntry> = entries.toList()

    fun clear() = entries.clear()
}
`],
  ['adapters/messaging', 'adapters.messaging.outbox', 'OutboxEntry.kt', t`
import org.seedvault.domain.events.DomainEvent

data class OutboxEntry(val sequence: Long, val event: DomainEvent)
`],
  ['adapters/messaging', 'adapters.messaging.outbox', 'Drainer.kt', t`
import org.seedvault.application.port.output.EventPublisher

class Drainer(private val outbox: Outbox, private val target: EventPublisher) {
    fun drain(): Int {
        val entries = outbox.pending()
        entries.forEach { target.publish(it.event) }
        outbox.clear()
        return entries.size
    }
}
`],
  ['adapters/messaging', 'adapters.messaging.mail', 'SowingMail.kt', t`
import org.seedvault.domain.events.DomainEvent
import org.seedvault.domain.events.LotSown

class SowingMail(private val recipients: Recipients) {
    fun onEvent(event: DomainEvent): String? =
        if (event is LotSown) renderSowing(event, recipients.forLot(event.lotId.value)) else null
}
`],
  ['adapters/messaging', 'adapters.messaging.mail', 'Templates.kt', t`
import org.seedvault.domain.events.LotSown

fun renderSowing(event: LotSown, to: String): String =
    "To: §to\nLot §{event.lotId.value} was sown into §{event.trays} trays."
`],
  ['adapters/messaging', 'adapters.messaging.mail', 'Recipients.kt', t`
class Recipients(private val byPrefix: Map<String, String>, private val fallback: String) {
    fun forLot(lotId: String): String = byPrefix.entries.firstOrNull { lotId.startsWith(it.key) }?.value ?: fallback
}
`],
  ['adapters/cli', 'adapters.cli.commands', 'RegisterCommand.kt', t`
import org.seedvault.application.port.input.RegisterLot
import org.seedvault.application.port.input.RegisterLotCommand
import org.seedvault.domain.shared.LotId
import org.seedvault.domain.shared.Outcome
import org.seedvault.domain.shared.SpeciesId
import java.time.LocalDate

class RegisterCommand(private val registerLot: RegisterLot) {
    fun run(args: List<String>): String {
        val (id, species, percent) = args
        val command = RegisterLotCommand(LotId(id), SpeciesId(species), LocalDate.now(), percent.toInt())
        return when (val outcome = registerLot(command)) {
            is Outcome.Ok -> "registered §{outcome.value.id.value}"
            is Outcome.Rejected -> "rejected: §{outcome.reason}"
        }
    }
}
`],
  ['adapters/cli', 'adapters.cli.commands', 'SowCommand.kt', t`
import org.seedvault.application.port.input.SowLot
import org.seedvault.application.port.input.SowLotCommand
import org.seedvault.domain.shared.LotId
import org.seedvault.domain.shared.Outcome

class SowCommand(private val sowLot: SowLot) {
    fun run(args: List<String>): String =
        when (val outcome = sowLot(SowLotCommand(LotId(args[0]), args[1].toInt()))) {
            is Outcome.Ok -> "sowing §{outcome.value.trays} trays of §{outcome.value.lot.id.value}"
            is Outcome.Rejected -> "rejected: §{outcome.reason}"
        }
}
`],
  ['adapters/cli', 'adapters.cli.commands', 'ReportCommand.kt', t`
import org.seedvault.adapters.cli.render.table
import org.seedvault.application.port.input.ReportStock

class ReportCommand(private val reportStock: ReportStock) {
    fun run(): String {
        val report = reportStock()
        return table(listOf(listOf("viable", report.viable.toString())) + report.bySpecies.map { listOf(it.key, it.value.toString()) })
    }
}
`],
  ['adapters/cli', 'adapters.cli.render', 'Table.kt', t`
fun table(rows: List<List<String>>): String {
    val widths = rows.fold(emptyList<Int>()) { acc, row -> row.mapIndexed { i, cell -> maxOf(cell.length, acc.getOrElse(i) { 0 }) } }
    return rows.joinToString("\n") { row -> row.mapIndexed { i, cell -> cell.padEnd(widths[i]) }.joinToString("  ") }
}
`],
  ['adapters/cli', 'adapters.cli.render', 'Lines.kt', t`
fun bullets(items: List<String>): String = items.joinToString("\n") { "- §it" }
`],
  ['adapters/cli', 'adapters.cli.render', 'Colors.kt', t`
const val RED = "\u001B[31m"
const val RESET = "\u001B[0m"

fun red(text: String): String = RED + text + RESET
`],
  // ---- bootstrap: the only place that knows every adapter
  ['bootstrap', 'bootstrap', 'Main.kt', t`
import org.seedvault.adapters.cli.commands.RegisterCommand
import org.seedvault.adapters.cli.commands.ReportCommand
import org.seedvault.adapters.cli.commands.SowCommand

fun main(args: Array<String>) {
    val wiring = Wiring(Settings.fromEnvironment())
    if (args.firstOrNull() == "serve") {
        wiring.httpApi.start(8080)
        return
    }
    val rest = args.drop(1)
    println(
        when (args.firstOrNull()) {
            "register" -> RegisterCommand(wiring.registerLot).run(rest)
            "sow" -> SowCommand(wiring.sowLot).run(rest)
            else -> ReportCommand(wiring.reportStock).run()
        },
    )
}
`],
  ['bootstrap', 'bootstrap', 'Wiring.kt', t`
import org.seedvault.adapters.messaging.bus.InProcessEventBus
import org.seedvault.adapters.messaging.mail.Recipients
import org.seedvault.adapters.messaging.mail.SowingMail
import org.seedvault.adapters.messaging.bus.Subscriptions
import org.seedvault.adapters.persistence.cache.CachedLotRepository
import org.seedvault.adapters.persistence.file.FileLotRepository
import org.seedvault.adapters.persistence.file.lotsFile
import org.seedvault.adapters.persistence.memory.InMemorySpeciesCatalog
import org.seedvault.adapters.rest.routes.GerminationRoutes
import org.seedvault.adapters.rest.routes.LotRoutes
import org.seedvault.adapters.rest.routes.ReportRoutes
import org.seedvault.adapters.rest.server.HttpApi
import org.seedvault.application.port.input.RegisterLot
import org.seedvault.application.port.input.ReportStock
import org.seedvault.application.port.input.SowLot
import org.seedvault.application.usecase.donor.AgreementCheck
import org.seedvault.application.usecase.donor.DonationLedger
import org.seedvault.application.usecase.donor.DonorDirectory
import org.seedvault.application.usecase.germination.SowLotService
import org.seedvault.application.usecase.lot.FindLotService
import org.seedvault.application.usecase.lot.RegisterLotService
import org.seedvault.application.usecase.report.StockReportService
import java.time.Clock

class Wiring(settings: Settings) {
    private val clock = Clock.systemUTC()
    private val lots = CachedLotRepository(FileLotRepository(lotsFile(settings.dataDirectory)))
    private val subscriptions = Subscriptions()
    private val events = InProcessEventBus(subscriptions)
    private val agreements = AgreementCheck(DonationLedger(), DonorDirectory(emptyList()))

    val registerLot: RegisterLot = RegisterLotService(lots, InMemorySpeciesCatalog(), events, clock)
    val sowLot: SowLot = SowLotService(lots, events, agreements, clock)
    val reportStock: ReportStock = StockReportService(lots)
    val findLot: FindLot = FindLotService(lots)
    val httpApi = HttpApi(LotRoutes(findLot).routes() + GerminationRoutes(sowLot).routes() + ReportRoutes(reportStock).routes())

    init {
        val mail = SowingMail(Recipients(emptyMap(), "desk@example.org"))
        subscriptions.add("lot.sown") { event -> mail.onEvent(event)?.let(::println) }
    }
}
`],
  ['bootstrap', 'bootstrap', 'Settings.kt', t`
import java.nio.file.Path

data class Settings(val dataDirectory: Path) {
    companion object {
        fun fromEnvironment(): Settings = Settings(Path.of(System.getenv("SEEDVAULT_DATA") ?: "data"))
    }
}
`],
];

const ktFiles = () => Object.fromEntries(KT.map(([project, pkg, name, body]) => [
  `${project}/src/main/kotlin/org/seedvault/${pkg.replaceAll('.', '/')}/${name}`,
  `package org.seedvault.${pkg}\n\n${body}`,
]));

const gradleModule = (...deps) => lines(
  "plugins {",
  "    kotlin(\"jvm\")",
  "}",
  "",
  "dependencies {",
  ...deps.map((dep) => `    ${dep}`),
  "    testImplementation(kotlin(\"test\"))",
  "}",
);

export const JVM_GRADLE_FILES = {
  ".gitignore": lines(
    ".gradle/",
    "build/",
    ".idea/",
    "*.class",
    "*.iml",
  ),
  "team/wiki/week-12.md": lines(
    "# Contributing to seedvault",
    "",
    "## Types",
    "",
    "- Identifiers are value classes (`LotId`, `SpeciesId`), never a bare `String` in a signature. Unwrap with `.value` only at the edge, where a log line or a file name needs the text.",
    "",
    "## Failures",
    "",
    "- A failure the caller can expect, such as an unknown lot or an expired one, is returned as `Outcome.Rejected`. Exceptions are for bugs and are never caught to drive logic.",
    "",
    "## Checks",
    "",
    "- `./gradlew test` and `./gradlew ktlintCheck` pass before a merge request is opened.",
  ),
  "README.md": lines(
    "# seedvault",
    "",
    "Inventory for a seed bank. Lots of seed are registered with a viability",
    "percentage, and a germination run may sow a lot only while it is still viable.",
    "",
    "Hexagonal layout, one Gradle subproject per ring. Dependencies point inwards only:",
    "",
    "```",
    "domain                   records and rules; depends on nothing",
    "application              input ports (use cases) and output ports; depends on domain",
    "adapters/persistence     memory, file and cache implementations of the output ports",
    "adapters/rest            JDK HTTP server in front of the input ports",
    "adapters/messaging       event bus, outbox and mail on the EventPublisher port",
    "adapters/cli             command line in front of the input ports",
    "bootstrap                the only subproject that knows every adapter; wires and starts",
    "```",
    "",
    "Run `./gradlew test` and `./gradlew ktlintCheck`.",
  ),
  "build.gradle.kts": lines(
    "plugins {",
    "    kotlin(\"jvm\") version \"2.0.21\" apply false",
    "    id(\"org.jlleitschuh.gradle.ktlint\") version \"12.1.1\" apply false",
    "}",
    "",
    "subprojects {",
    "    apply(plugin = \"org.jetbrains.kotlin.jvm\")",
    "    apply(plugin = \"org.jlleitschuh.gradle.ktlint\")",
    "",
    "    repositories {",
    "        mavenCentral()",
    "    }",
    "",
    "    tasks.withType<Test> {",
    "        useJUnitPlatform()",
    "    }",
    "}",
  ),
  "gradle/wrapper/gradle-wrapper.properties": lines(
    "distributionBase=GRADLE_USER_HOME",
    "distributionPath=wrapper/dists",
    "distributionUrl=https\\://services.gradle.org/distributions/gradle-8.10.2-bin.zip",
    "zipStoreBase=GRADLE_USER_HOME",
    "zipStorePath=wrapper/dists",
  ),
  "gradle.properties": lines(
    "org.gradle.jvmargs=-Xmx1g",
    "kotlin.code.style=official",
  ),
  "gradlew": lines(
    "#!/bin/sh",
    "# Wrapper launcher stub: the real script and gradle-wrapper.jar are generated by `gradle wrapper`.",
    "exec gradle \"$@\"",
  ),
  "settings.gradle.kts": lines(
    "rootProject.name = \"seedvault\"",
    "",
    "include(\":domain\", \":application\", \":adapters:persistence\", \":adapters:rest\", \":adapters:messaging\", \":adapters:cli\", \":bootstrap\")",
  ),
  "domain/build.gradle.kts": gradleModule(),
  "application/build.gradle.kts": gradleModule('api(project(":domain"))', 'implementation("org.slf4j:slf4j-api:2.0.13")'),
  "adapters/persistence/build.gradle.kts": gradleModule('implementation(project(":application"))'),
  "adapters/rest/build.gradle.kts": gradleModule('implementation(project(":application"))'),
  "adapters/messaging/build.gradle.kts": gradleModule('implementation(project(":application"))'),
  "adapters/cli/build.gradle.kts": gradleModule('implementation(project(":application"))'),
  "bootstrap/build.gradle.kts": lines(
    "plugins {",
    "    kotlin(\"jvm\")",
    "    application",
    "}",
    "",
    "dependencies {",
    "    implementation(project(\":application\"))",
    "    implementation(project(\":adapters:persistence\"))",
    "    implementation(project(\":adapters:rest\"))",
    "    implementation(project(\":adapters:messaging\"))",
    "    implementation(project(\":adapters:cli\"))",
    "    runtimeOnly(\"org.slf4j:slf4j-simple:2.0.13\")",
    "}",
    "",
    "application {",
    "    mainClass.set(\"org.seedvault.bootstrap.MainKt\")",
    "}",
  ),
  ...ktFiles(),
  "domain/src/test/kotlin/org/seedvault/domain/germination/GerminationRulesTest.kt": t`
package org.seedvault.domain.germination

import org.seedvault.domain.lot.SeedLot
import org.seedvault.domain.lot.Viability
import org.seedvault.domain.shared.LotId
import org.seedvault.domain.shared.Outcome
import org.seedvault.domain.shared.SpeciesId
import java.time.LocalDate
import kotlin.test.Test
import kotlin.test.assertIs

class GerminationRulesTest {
    private val today = LocalDate.of(2026, 3, 1)

    private fun lot(percent: Int, storedOn: LocalDate) = SeedLot(LotId("L-1"), SpeciesId("rye"), storedOn, Viability(percent))

    @Test
    fun acceptsViableRecentLot() {
        assertIs<Outcome.Ok<SeedLot>>(GerminationRules.check(lot(90, LocalDate.of(2025, 1, 10)), today))
    }

    @Test
    fun rejectsLotBelowViabilityFloor() {
        assertIs<Outcome.Rejected>(GerminationRules.check(lot(40, LocalDate.of(2025, 1, 10)), today))
    }

    @Test
    fun rejectsLotStoredMoreThanTenYearsAgo() {
        assertIs<Outcome.Rejected>(GerminationRules.check(lot(95, LocalDate.of(2010, 1, 10)), today))
    }
}
`,
  "application/src/test/kotlin/org/seedvault/application/usecase/germination/SowLotServiceTest.kt": t`
package org.seedvault.application.usecase.germination

import org.seedvault.application.port.input.SowLotCommand
import org.seedvault.application.port.output.LotRepository
import org.seedvault.application.usecase.donor.AgreementCheck
import org.seedvault.application.usecase.donor.DonationLedger
import org.seedvault.application.usecase.donor.DonorDirectory
import org.seedvault.domain.lot.SeedLot
import org.seedvault.domain.lot.Viability
import org.seedvault.domain.shared.LotId
import org.seedvault.domain.shared.Outcome
import org.seedvault.domain.shared.SpeciesId
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import kotlin.test.Test
import kotlin.test.assertIs

class SowLotServiceTest {
    private val clock = Clock.fixed(Instant.parse("2026-03-01T00:00:00Z"), ZoneOffset.UTC)

    private class ListRepository(private val lots: MutableList<SeedLot>) : LotRepository {
        override fun find(id: LotId): SeedLot? = lots.firstOrNull { it.id == id }

        override fun save(lot: SeedLot) {
            lots.removeAll { it.id == lot.id }
            lots.add(lot)
        }

        override fun all(): List<SeedLot> = lots.toList()
    }

    private fun serviceWith(lot: SeedLot) =
        SowLotService(ListRepository(mutableListOf(lot)), { }, AgreementCheck(DonationLedger(), DonorDirectory(emptyList())), clock)

    @Test
    fun sowsViableLot() {
        val lot = SeedLot(LotId("L-1"), SpeciesId("rye"), LocalDate.of(2025, 1, 10), Viability(90))
        assertIs<Outcome.Ok<*>>(serviceWith(lot)(SowLotCommand(lot.id, trays = 2)))
    }

    @Test
    fun rejectsUnknownLot() {
        val lot = SeedLot(LotId("L-1"), SpeciesId("rye"), LocalDate.of(2025, 1, 10), Viability(90))
        assertIs<Outcome.Rejected>(serviceWith(lot)(SowLotCommand(LotId("L-9"), trays = 2)))
    }
}
`,
};

// Rust crates of the engine workspace: [crate, file below src/, body]. Each crate's src/ is one module (three files).
const RS = [
  ['units', 'lib.rs', t`
pub mod duration;
pub mod temperature;
`],
  ['units', 'temperature.rs', t`
/// Temperatures are integers in tenths of a degree Celsius; degrees exist only at the display edge.
pub fn dc_from_celsius(celsius: f64) -> i32 {
    (celsius * 10.0).round() as i32
}

pub fn celsius_from_dc(value_dc: i32) -> f64 {
    f64::from(value_dc) / 10.0
}
`],
  ['units', 'duration.rs', t`
pub fn secs_from_minutes(minutes: u32) -> u32 {
    minutes * 60
}

pub fn minutes_from_secs(secs: u32) -> u32 {
    secs / 60
}
`],
  ['safety', 'lib.rs', t`
pub mod error;
pub mod limits;
`],
  ['safety', 'error.rs', t`
use std::fmt;

#[derive(Debug, PartialEq, Eq)]
pub enum SafetyError {
    TooHot { target_dc: i32 },
    TooCold { target_dc: i32 },
    TooFast { rate_dc_per_hour: i32 },
}

impl fmt::Display for SafetyError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SafetyError::TooHot { target_dc } => {
                write!(f, "setpoint {target_dc} dC is above the kiln limit")
            }
            SafetyError::TooCold { target_dc } => {
                write!(f, "setpoint {target_dc} dC is below zero")
            }
            SafetyError::TooFast { rate_dc_per_hour } => {
                write!(f, "{rate_dc_per_hour} dC/h heats too fast")
            }
        }
    }
}

impl std::error::Error for SafetyError {}
`],
  ['safety', 'limits.rs', t`
use crate::error::SafetyError;

pub const MAX_SETPOINT_DC: i32 = 13_000;
pub const MIN_SETPOINT_DC: i32 = 0;
pub const MAX_RATE_DC_PER_HOUR: i32 = 3_000;

pub fn check_setpoint_dc(target_dc: i32) -> Result<(), SafetyError> {
    if target_dc > MAX_SETPOINT_DC {
        return Err(SafetyError::TooHot { target_dc });
    }
    if target_dc < MIN_SETPOINT_DC {
        return Err(SafetyError::TooCold { target_dc });
    }
    Ok(())
}

pub fn check_rate_dc(rate_dc_per_hour: i32) -> Result<(), SafetyError> {
    if rate_dc_per_hour > MAX_RATE_DC_PER_HOUR {
        return Err(SafetyError::TooFast { rate_dc_per_hour });
    }
    Ok(())
}
`],
  ['schedule', 'lib.rs', t`
pub mod plan;
pub mod ramp;
pub mod segment;
`],
  ['schedule', 'segment.rs', t`
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Segment {
    pub minutes: u32,
    pub target_dc: i32,
}
`],
  ['schedule', 'plan.rs', t`
use std::fmt;

use kiln_safety::error::SafetyError;
use kiln_safety::limits::check_setpoint_dc;

use crate::segment::Segment;

#[derive(Debug, PartialEq, Eq)]
pub enum ScheduleError {
    Empty,
    Unsafe(SafetyError),
}

impl fmt::Display for ScheduleError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ScheduleError::Empty => write!(f, "a schedule needs at least one segment"),
            ScheduleError::Unsafe(inner) => write!(f, "unsafe segment: {inner}"),
        }
    }
}

impl std::error::Error for ScheduleError {}

#[derive(Debug, Clone)]
pub struct Schedule {
    segments: Vec<Segment>,
}

impl Schedule {
    pub fn new(segments: Vec<Segment>) -> Result<Self, ScheduleError> {
        if segments.is_empty() {
            return Err(ScheduleError::Empty);
        }
        for segment in &segments {
            check_setpoint_dc(segment.target_dc).map_err(ScheduleError::Unsafe)?;
        }
        Ok(Self { segments })
    }

    pub fn total_minutes(&self) -> u32 {
        self.segments.iter().map(|segment| segment.minutes).sum()
    }

    pub fn target_at_dc(&self, minute: u32) -> i32 {
        let mut elapsed = 0;
        for segment in &self.segments {
            elapsed += segment.minutes;
            if minute < elapsed {
                return segment.target_dc;
            }
        }
        self.segments
            .last()
            .map(|segment| segment.target_dc)
            .expect("invariant: Schedule::new rejects an empty segment list")
    }
}
`],
  ['schedule', 'ramp/mod.rs', t`
pub mod curve;
pub mod linear;
pub mod profiles;
`],
  ['schedule', 'ramp/linear.rs', t`
/// Temperature after minute of a straight ramp from from_dc to to_dc over total minutes.
pub fn ramp_dc(from_dc: i32, to_dc: i32, minute: u32, total: u32) -> i32 {
    if total == 0 {
        return to_dc;
    }
    let done = i64::from(minute.min(total));
    from_dc + ((i64::from(to_dc - from_dc) * done) / i64::from(total)) as i32
}
`],
  ['schedule', 'ramp/curve.rs', t`
/// Eases a ramp: slow start, slow finish. Fraction is in thousandths, 0..=1000.
pub fn ease_thousandths(fraction: u32) -> u32 {
    let f = i64::from(fraction.min(1000));
    ((3 * f * f * 1000 - 2 * f * f * f) / 1_000_000) as u32
}
`],
  ['schedule', 'ramp/profiles/mod.rs', t`
pub mod bisque;
pub mod glaze;
`],
  ['schedule', 'ramp/profiles/bisque.rs', t`
use crate::plan::Schedule;
use crate::segment::Segment;

pub fn bisque() -> Schedule {
    Schedule::new(vec![
        Segment {
            minutes: 240,
            target_dc: 5_900,
        },
        Segment {
            minutes: 180,
            target_dc: 9_500,
        },
    ])
    .expect("invariant: the built-in bisque schedule is within limits")
}
`],
  ['schedule', 'ramp/profiles/glaze.rs', t`
use crate::plan::Schedule;
use crate::segment::Segment;

pub fn glaze() -> Schedule {
    Schedule::new(vec![
        Segment {
            minutes: 120,
            target_dc: 6_000,
        },
        Segment {
            minutes: 60,
            target_dc: 12_400,
        },
    ])
    .expect("invariant: the built-in glaze schedule is within limits")
}
`],
  ['telemetry', 'lib.rs', t`
pub mod sample;
pub mod stats;
`],
  ['telemetry', 'sample.rs', t`
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Sample {
    pub minute: u32,
    pub temp_dc: i32,
}
`],
  ['telemetry', 'stats.rs', t`
use kiln_schedule::plan::Schedule;

use crate::sample::Sample;

pub fn peak_dc(samples: &[Sample]) -> i32 {
    samples
        .iter()
        .map(|sample| sample.temp_dc)
        .max()
        .expect("invariant: callers pass at least one sample")
}

pub fn overshoot_dc(schedule: &Schedule, samples: &[Sample]) -> i32 {
    samples
        .iter()
        .map(|sample| sample.temp_dc - schedule.target_at_dc(sample.minute))
        .max()
        .expect("invariant: callers pass at least one sample")
        .max(0)
}
`],
  ['controller', 'lib.rs', t`
pub mod drivers;
pub mod pid;
pub mod relay;
`],
  ['controller', 'pid.rs', t`
pub struct Pid {
    pub gain_milli: i32,
    integral_dc: i32,
}

impl Pid {
    pub fn new(gain_milli: i32) -> Self {
        Self {
            gain_milli,
            integral_dc: 0,
        }
    }

    /// Output in thousandths of full power, clamped to 0..=1000.
    pub fn step(&mut self, target_dc: i32, actual_dc: i32) -> i32 {
        let error_dc = target_dc - actual_dc;
        self.integral_dc = (self.integral_dc + error_dc).clamp(-500, 500);
        ((error_dc + self.integral_dc / 10) * self.gain_milli / 10).clamp(0, 1000)
    }
}
`],
  ['controller', 'relay.rs', t`
/// On/off control with a band, so the relay does not chatter around the setpoint.
pub struct Relay {
    pub band_dc: i32,
    on: bool,
}

impl Relay {
    pub fn new(band_dc: i32) -> Self {
        Self { band_dc, on: false }
    }

    pub fn decide(&mut self, target_dc: i32, actual_dc: i32) -> bool {
        if actual_dc < target_dc - self.band_dc {
            self.on = true;
        } else if actual_dc > target_dc + self.band_dc {
            self.on = false;
        }
        self.on
    }
}
`],
  ['controller', 'drivers/mod.rs', t`
pub mod relay_board;
pub mod thermocouple;
`],
  ['controller', 'drivers/thermocouple.rs', t`
use kiln_units::temperature::dc_from_celsius;

/// Type K approximation: about 41 microvolts per degree, read in microvolts.
pub fn read_dc(microvolts: i32) -> i32 {
    dc_from_celsius(f64::from(microvolts) / 41.0)
}
`],
  ['controller', 'drivers/relay_board.rs', t`
#[derive(Debug, Default)]
pub struct RelayBoard {
    pub channels: [bool; 4],
}

impl RelayBoard {
    pub fn set(&mut self, channel: usize, on: bool) {
        self.channels[channel] = on;
    }

    pub fn any_on(&self) -> bool {
        self.channels.iter().any(|on| *on)
    }
}
`],
  ['sim', 'lib.rs', t`
pub mod kiln;
pub mod run;
`],
  ['sim', 'kiln.rs', t`
/// A lumped model: temperature rises with power and leaks toward the room.
pub struct Kiln {
    pub temp_dc: i32,
    pub room_dc: i32,
}

impl Kiln {
    pub fn new(room_dc: i32) -> Self {
        Self {
            temp_dc: room_dc,
            room_dc,
        }
    }

    pub fn advance(&mut self, power_thousandths: i32) {
        let heating = power_thousandths * 40 / 1000;
        let leak = (self.temp_dc - self.room_dc) / 200;
        self.temp_dc += heating - leak;
    }
}
`],
  ['sim', 'run.rs', t`
use kiln_controller::pid::Pid;
use kiln_schedule::plan::Schedule;
use kiln_telemetry::sample::Sample;

use crate::kiln::Kiln;

pub fn simulate(schedule: &Schedule) -> Vec<Sample> {
    let mut kiln = Kiln::new(200);
    let mut pid = Pid::new(120);
    let mut samples = Vec::new();
    for minute in 0..schedule.total_minutes() {
        let power = pid.step(schedule.target_at_dc(minute), kiln.temp_dc);
        kiln.advance(power);
        samples.push(Sample {
            minute,
            temp_dc: kiln.temp_dc,
        });
    }
    samples
}
`],
  ['protocol', 'lib.rs', t`
pub mod codec;
pub mod message;
`],
  ['protocol', 'message.rs', t`
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Message {
    Start { firing_id: u32 },
    Stop { firing_id: u32 },
    Setpoint { firing_id: u32, target_dc: i32 },
}
`],
  ['protocol', 'codec.rs', t`
use std::fmt;

use crate::message::Message;

#[derive(Debug, PartialEq, Eq)]
pub struct ProtocolError(pub String);

impl fmt::Display for ProtocolError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "protocol: {}", self.0)
    }
}

impl std::error::Error for ProtocolError {}

pub fn encode(message: &Message) -> String {
    match message {
        Message::Start { firing_id } => format!("START {firing_id}"),
        Message::Stop { firing_id } => format!("STOP {firing_id}"),
        Message::Setpoint {
            firing_id,
            target_dc,
        } => format!("SET {firing_id} {target_dc}"),
    }
}

pub fn decode(line: &str) -> Result<Message, ProtocolError> {
    let fields: Vec<&str> = line.split_whitespace().collect();
    let number = |text: &str| {
        text.parse::<i64>()
            .map_err(|_| ProtocolError(format!("bad number {text}")))
    };
    match fields.as_slice() {
        ["START", id] => Ok(Message::Start {
            firing_id: number(id)? as u32,
        }),
        ["STOP", id] => Ok(Message::Stop {
            firing_id: number(id)? as u32,
        }),
        ["SET", id, target] => Ok(Message::Setpoint {
            firing_id: number(id)? as u32,
            target_dc: number(target)? as i32,
        }),
        _ => Err(ProtocolError(format!("unknown line {line}"))),
    }
}
`],
  ['logbook', 'lib.rs', t`
pub mod entry;
pub mod writer;
`],
  ['logbook', 'entry.rs', t`
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Entry {
    pub minute: u32,
    pub peak_dc: i32,
    pub note: String,
}
`],
  ['logbook', 'writer.rs', t`
use std::fmt;

use crate::entry::Entry;

#[derive(Debug, PartialEq, Eq)]
pub struct LogError(pub &'static str);

impl fmt::Display for LogError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "logbook: {}", self.0)
    }
}

impl std::error::Error for LogError {}

pub fn line(entry: &Entry) -> Result<String, LogError> {
    if entry.note.contains('\n') {
        return Err(LogError("a note is one line"));
    }
    Ok(format!("{};{};{}", entry.minute, entry.peak_dc, entry.note))
}
`],
  ['cli', 'main.rs', t`
mod args;
mod report;

use kiln_sim::run::simulate;

fn main() {
    let schedule = args::pick(std::env::args().nth(1).as_deref());
    println!("{}", report::summary(&schedule, &simulate(&schedule)));
}
`],
  ['cli', 'args.rs', t`
use kiln_schedule::plan::Schedule;
use kiln_schedule::ramp::profiles::{bisque::bisque, glaze::glaze};

pub fn pick(name: Option<&str>) -> Schedule {
    match name {
        Some("glaze") => glaze(),
        _ => bisque(),
    }
}
`],
  ['cli', 'report.rs', t`
use kiln_schedule::plan::Schedule;
use kiln_telemetry::sample::Sample;
use kiln_telemetry::stats::{overshoot_dc, peak_dc};
use kiln_units::temperature::celsius_from_dc;

pub fn summary(schedule: &Schedule, samples: &[Sample]) -> String {
    format!(
        "{} minutes, peak {:.1} C, overshoot {:.1} C",
        schedule.total_minutes(),
        celsius_from_dc(peak_dc(samples)),
        celsius_from_dc(overshoot_dc(schedule, samples)),
    )
}
`],
];

const CRATE_DEPS = {
  units: [], safety: [], schedule: ['safety'], telemetry: ['schedule'], controller: ['units'],
  sim: ['schedule', 'telemetry', 'controller'], protocol: [], logbook: [], cli: ['schedule', 'sim', 'telemetry', 'units'],
};
const crateToml = (name) => lines(
  '[package]',
  `name = "kiln-${name}"`,
  'version = "0.3.0"',
  'edition = "2021"',
  '',
  '[dependencies]',
  ...CRATE_DEPS[name].map((dep) => `kiln-${dep} = { path = "../${dep}" }`),
);

const rustFiles = () => ({
  ...Object.fromEntries(RS.map(([crate, file, body]) => [`engine/crates/${crate}/src/${file}`, body])),
  ...Object.fromEntries(Object.keys(CRATE_DEPS).map((crate) => [`engine/crates/${crate}/Cargo.toml`, crateToml(crate)])),
});

// TypeScript dashboard: [path below dashboard/src/, body].
const DASH = [
  ['server.ts', t`
import { createApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
createApp(config).listen(config.port);
`],
  ['config.ts', t`
export interface Config {
  port: number;
  engineUrl: string;
  token: string;
}

export const loadConfig = (): Config => ({
  port: Number(process.env.PORT ?? 3000),
  engineUrl: process.env.ENGINE_URL ?? 'http://localhost:7400',
  token: process.env.DASHBOARD_TOKEN ?? '',
});
`],
  ['app.ts', t`
import express from 'express';
import type { Config } from './config.js';
import { requireToken } from './middleware/auth.js';
import { handleErrors } from './middleware/errors.js';
import { logRequests } from './middleware/logging.js';
import { register as registerFirings } from './routes/firings.routes.js';
import { register as registerHealth } from './routes/health.routes.js';
import { register as registerKilns } from './routes/kilns.routes.js';

export const createApp = (config: Config) => {
  const app = express();
  app.use(express.json());
  app.use(logRequests);
  registerHealth(app);
  app.use(requireToken(config.token));
  registerKilns(app);
  registerFirings(app);
  app.use(handleErrors);
  return app;
};
`],
  ['middleware/auth.ts', t`
import type { NextFunction, Request, Response } from 'express';

export const requireToken = (token: string) => (req: Request, res: Response, next: NextFunction) => {
  if (token !== '' && req.header('authorization') !== 'Bearer ' + token) return res.status(401).end();
  return next();
};
`],
  ['middleware/errors.ts', t`
import type { NextFunction, Request, Response } from 'express';
import { SetpointError } from '../lib/engine/errors.js';

export const handleErrors = (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof SetpointError) return res.status(422).json({ error: error.message });
  return res.status(500).json({ error: 'internal error' });
};
`],
  ['middleware/logging.ts', t`
import type { NextFunction, Request, Response } from 'express';

export const logRequests = (req: Request, _res: Response, next: NextFunction): void => {
  console.log(req.method + ' ' + req.path);
  next();
};
`],
  ['routes/health.routes.ts', t`
import type { Express } from 'express';

export function register(app: Express): void {
  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });
}
`],
  ['routes/kilns.routes.ts', t`
import type { Express } from 'express';
import { listKilns } from '../services/kilns.js';

export function register(app: Express): void {
  app.get('/kilns', (_req, res) => {
    res.json(listKilns());
  });
}
`],
  ['routes/firings.routes.ts', t`
import type { Express } from 'express';
import { beginFiring, getFiring } from '../services/firings.js';

export function register(app: Express): void {
  app.post('/firings', async (req, res) => {
    const id = await beginFiring(req.body.kilnId, req.body.segments);
    return res.status(201).json({ id });
  });

  app.get('/firings/:id', (req, res) => {
    const firing = getFiring(req.params.id);
    return firing === undefined ? res.status(404).end() : res.json(firing);
  });
}
`],
  ['services/firings.ts', t`
import { startFiring } from '../lib/engine/client.js';
import { newFiringId } from '../lib/ids.js';
import { checkSegments } from '../lib/validate/segments.js';
import { findFiring, saveFiring } from './store.js';
import type { Firing, Segment } from '../lib/engine/types.js';

export const beginFiring = async (kilnId: string, segments: Segment[]): Promise<string> => {
  checkSegments(segments);
  const id = newFiringId(new Date());
  await startFiring(id, segments);
  saveFiring({ id, kilnId, segments, startedAt: new Date().toISOString() });
  return id;
};

export const getFiring = (id: string): Firing | undefined => findFiring(id);
`],
  ['services/kilns.ts', t`
import { labelFor } from '../lib/format/labels.js';

const KILNS = ['east', 'west'];

export const listKilns = (): { id: string; label: string }[] => KILNS.map((id) => ({ id, label: labelFor(id) }));
`],
  ['services/store.ts', t`
import type { Firing } from '../lib/engine/types.js';

const firings = new Map<string, Firing>();

export const saveFiring = (firing: Firing): void => {
  firings.set(firing.id, firing);
};

export const findFiring = (id: string): Firing | undefined => firings.get(id);
`],
  ['services/alerts/rules.ts', t`
import { MAX_SETPOINT_DC } from '../../lib/validate/limits.js';
import type { Firing } from '../../lib/engine/types.js';

export interface Alert {
  firingId: string;
  message: string;
}

export const alertsFor = (firing: Firing, peakDc: number): Alert[] =>
  peakDc > MAX_SETPOINT_DC - 200 ? [{ firingId: firing.id, message: 'peak is within 20 degrees of the limit' }] : [];
`],
  ['services/alerts/channels.ts', t`
import type { Alert } from './rules.js';

export type Channel = (alert: Alert) => void;

export const consoleChannel: Channel = (alert) => {
  console.warn(alert.firingId + ': ' + alert.message);
};
`],
  ['services/alerts/digest.ts', t`
import type { Alert } from './rules.js';

export const digest = (alerts: Alert[]): string => alerts.map((alert) => alert.firingId + ' ' + alert.message).join('\n');
`],
  ['lib/ids.ts', t`
export const newFiringId = (now: Date): string => 'f-' + now.getTime().toString(36);
`],
  ['lib/clock.ts', t`
export const minutesBetween = (from: Date, to: Date): number => Math.round((to.getTime() - from.getTime()) / 60_000);
`],
  ['lib/result.ts', t`
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

export const fail = <E>(error: E): Result<never, E> => ({ ok: false, error });
`],
  ['lib/engine/client.ts', t`
import { SetpointError } from './errors.js';
import type { Segment } from './types.js';

const ENGINE_URL = process.env.ENGINE_URL ?? 'http://localhost:7400';

export const startFiring = async (id: string, segments: Segment[]): Promise<void> => {
  const response = await fetch(ENGINE_URL + '/firings/' + id, { method: 'PUT', body: JSON.stringify({ segments }) });
  if (response.status === 422) throw new SetpointError('the engine refused the schedule');
};
`],
  ['lib/engine/errors.ts', t`
export class SetpointError extends Error {}
`],
  ['lib/engine/types.ts', t`
export interface Segment {
  minutes: number;
  targetDc: number;
}

export interface Firing {
  id: string;
  kilnId: string;
  segments: Segment[];
  startedAt: string;
}
`],
  ['lib/format/temperature.ts', t`
import { dcToCelsius } from '../validate/limits.js';

export const formatDc = (valueDc: number): string => dcToCelsius(valueDc).toFixed(1) + ' C';
`],
  ['lib/format/duration.ts', t`
export const formatMinutes = (minutes: number): string => Math.floor(minutes / 60) + 'h ' + (minutes % 60) + 'm';
`],
  ['lib/format/labels.ts', t`
export const labelFor = (kilnId: string): string => kilnId.charAt(0).toUpperCase() + kilnId.slice(1) + ' kiln';
`],
  ['lib/validate/limits.ts', t`
export const MAX_SETPOINT_DC = 13_000;
export const MIN_SETPOINT_DC = 0;

export const dcToCelsius = (valueDc: number): number => valueDc / 10;

export const celsiusToDc = (celsius: number): number => Math.round(celsius * 10);
`],
  ['lib/validate/setpoint.ts', t`
import { MAX_SETPOINT_DC, MIN_SETPOINT_DC } from './limits.js';

export const isSetpointDc = (valueDc: number): boolean =>
  Number.isInteger(valueDc) && valueDc >= MIN_SETPOINT_DC && valueDc <= MAX_SETPOINT_DC;
`],
  ['lib/validate/segments.ts', t`
import { SetpointError } from '../engine/errors.js';
import type { Segment } from '../engine/types.js';
import { isSetpointDc } from './setpoint.js';

export const checkSegments = (segments: Segment[]): void => {
  const bad = segments.find((segment) => !isSetpointDc(segment.targetDc));
  if (bad !== undefined) throw new SetpointError('setpoint ' + bad.targetDc + ' is outside the kiln limits');
};
`],
  ['views/layout.ts', t`
export const page = (title: string, body: string): string => '<html><head><title>' + title + '</title></head><body>' + body + '</body></html>';
`],
  ['views/firing.ts', t`
import { formatMinutes } from '../lib/format/duration.js';
import type { Firing } from '../lib/engine/types.js';
import { table } from './components/table.js';
import { page } from './layout.js';

export const firingPage = (firing: Firing): string =>
  page('Firing ' + firing.id, table(firing.segments.map((s) => [formatMinutes(s.minutes), String(s.targetDc)])));
`],
  ['views/kiln.ts', t`
import { badge } from './components/badge.js';
import { page } from './layout.js';

export const kilnPage = (label: string, online: boolean): string => page(label, badge(online ? 'online' : 'offline'));
`],
  ['views/components/badge.ts', t`
export const badge = (text: string): string => '<span class="badge">' + text + '</span>';
`],
  ['views/components/table.ts', t`
export const table = (rows: string[][]): string =>
  '<table>' + rows.map((row) => '<tr>' + row.map((cell) => '<td>' + cell + '</td>').join('') + '</tr>').join('') + '</table>';
`],
  ['views/components/chart.ts', t`
import { formatDc } from '../../lib/format/temperature.js';

export const spark = (valuesDc: number[]): string => valuesDc.map(formatDc).join(' ');
`],
  ['__generated__/engine-api.ts', t`
// @generated by openapi-typescript from engine/openapi.yaml. Do not edit.
export interface paths {
  '/firings/{id}': { put: { requestBody: { segments: { minutes: number; targetDc: number }[] } } };
}
`],
];

// Python tooling project: [path below tools/src/kilnlab/, body].
const TOOLS = [
  ['__init__.py', '"""Calibration and export helpers for kiln logs."""\n'],
  ['cli.py', t`
import sys

from kilnlab.calibration.fit import offset_dc
from kilnlab.ingest.reader import read_log


def main(argv: list[str]) -> int:
    pairs = read_log(argv[0])
    print(offset_dc(pairs))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
`],
  ['ingest/__init__.py', '"""Reading firing logs."""\n'],
  ['ingest/schema.py', t`
COLUMNS = ("minute", "reference_dc", "reading_dc")
`],
  ['ingest/reader.py', t`
from kilnlab.ingest.schema import COLUMNS


def read_log(path: str) -> list[tuple[int, int]]:
    pairs = []
    with open(path, encoding="utf-8") as handle:
        header = handle.readline().strip().split(",")
        if tuple(header) != COLUMNS:
            raise ValueError(f"unexpected columns {header}")
        for row in handle:
            _, reference_dc, reading_dc = row.strip().split(",")
            pairs.append((int(reference_dc), int(reading_dc)))
    return pairs
`],
  ['calibration/__init__.py', '"""Offsets between a thermocouple and a reference."""\n'],
  ['calibration/points.py', t`
def mean(values: list[int]) -> float:
    return sum(values) / len(values)
`],
  ['calibration/fit.py', t`
from kilnlab.calibration.points import mean


def offset_dc(pairs: list[tuple[int, int]]) -> int:
    return round(mean([reference_dc - reading_dc for reference_dc, reading_dc in pairs]))
`],
  ['export/__init__.py', '"""Writing calibration results."""\n'],
  ['export/csv_out.py', t`
def as_csv(offsets_dc: dict[str, int]) -> str:
    return "kiln,offset_dc\n" + "\n".join(f"{kiln},{offset}" for kiln, offset in sorted(offsets_dc.items())) + "\n"
`],
  ['export/json_out.py', t`
import json


def as_json(offsets_dc: dict[str, int]) -> str:
    return json.dumps(offsets_dc, sort_keys=True)
`],
  ['plots/__init__.py', '"""Plain SVG plots of a firing."""\n'],
  ['plots/axes.py', t`
def scale(value: int, low: int, high: int, size: int) -> int:
    return round((value - low) * size / max(1, high - low))
`],
  ['plots/svg.py', t`
from kilnlab.plots.axes import scale


def polyline(values_dc: list[int], width: int = 400, height: int = 200) -> str:
    low, high = min(values_dc), max(values_dc)
    points = " ".join(f"{index * width // max(1, len(values_dc) - 1)},{height - scale(v, low, high, height)}" for index, v in enumerate(values_dc))
    return f'<svg width="{width}" height="{height}"><polyline fill="none" stroke="black" points="{points}"/></svg>'
`],
  ['config/__init__.py', '"""Where calibration reads its inputs."""\n'],
  ['config/paths.py', t`
from pathlib import Path

LOG_DIR = Path("logs")
`],
  ['config/limits.py', t`
MAX_OFFSET_DC = 200
`],
];

export const MONOREPO_FILES = {
  ".gitignore": lines(
    "target/",
    "node_modules/",
    "dist/",
    ".venv/",
    "__pycache__/",
    "*.log",
  ),
  "CONTRIBUTING.md": lines(
    "# Contributing to kiln",
    "",
    "## Units",
    "",
    "- Every temperature that is a setpoint or a reading is an integer in tenths of a degree Celsius, and its name ends in `_dc` in Rust and Python or `Dc` / `_DC` in TypeScript (`target_dc`, `targetDc`, `MAX_SETPOINT_DC`). Convert to degrees only at the display edge.",
    "",
    "## Rust (engine/)",
    "",
    "- No bare `unwrap()` outside tests. Use `.expect(\"invariant: ...\")` and state the invariant that makes the failure impossible.",
    "",
    "## Generated and vendored code",
    "",
    "- `dashboard/src/__generated__/` and `vendor/` are never edited by hand: regenerate or re-vendor.",
    "",
    "## Checks",
    "",
    "- Every project must pass its checks listed in the README before review.",
  ),
  "README.md": lines(
    "# kiln",
    "",
    "Controller for a pottery kiln. Three projects live in this repository:",
    "",
    "```",
    "engine/      Rust workspace (engine/crates/*): schedules, safety limits, control loop, simulation, telemetry",
    "dashboard/   TypeScript web app: Express routes that start firings and show their temperature",
    "tools/       Python helpers that calibrate thermocouples from firing logs",
    "vendor/      third-party snapshots, not ours",
    "```",
    "",
    "The dashboard calls the engine through an HTTP client generated into `dashboard/src/__generated__/`;",
    "the projects share no code, only the unit convention in CONTRIBUTING.md.",
    "",
    "- engine: `cargo test`, `cargo clippy --all-targets`, `cargo fmt --check` (run in `engine/`)",
    "- dashboard: `npm test`, `npm run lint` (run in `dashboard/`)",
    "- tools: `uv run pytest`, `uv run ruff check src tests` (run in `tools/`)",
  ),
  "engine/.gitignore": lines(
    "/target",
  ),
  "engine/Cargo.toml": lines(
    "[workspace]",
    "members = [\"crates/*\"]",
    "resolver = \"2\"",
  ),
  "engine/Cargo.lock": t`
# This file is automatically @generated by Cargo.
# It is not intended for manual editing.
version = 4

[[package]]
name = "kiln-cli"
version = "0.3.0"
dependencies = [
 "kiln-schedule",
 "kiln-sim",
 "kiln-telemetry",
 "kiln-units",
]

[[package]]
name = "kiln-controller"
version = "0.3.0"
dependencies = [
 "kiln-units",
]

[[package]]
name = "kiln-logbook"
version = "0.3.0"

[[package]]
name = "kiln-protocol"
version = "0.3.0"

[[package]]
name = "kiln-safety"
version = "0.3.0"

[[package]]
name = "kiln-schedule"
version = "0.3.0"
dependencies = [
 "kiln-safety",
]

[[package]]
name = "kiln-sim"
version = "0.3.0"
dependencies = [
 "kiln-controller",
 "kiln-schedule",
 "kiln-telemetry",
]

[[package]]
name = "kiln-telemetry"
version = "0.3.0"
dependencies = [
 "kiln-schedule",
]

[[package]]
name = "kiln-units"
version = "0.3.0"
`,
  ...rustFiles(),
  "engine/crates/schedule/tests/firing.rs": t`
use kiln_safety::error::SafetyError;
use kiln_safety::limits::MAX_SETPOINT_DC;
use kiln_schedule::plan::{Schedule, ScheduleError};
use kiln_schedule::ramp::profiles::glaze::glaze;
use kiln_schedule::segment::Segment;

#[test]
fn rejects_a_setpoint_above_the_limit() {
    let hot = vec![Segment {
        minutes: 30,
        target_dc: MAX_SETPOINT_DC + 1,
    }];
    assert_eq!(
        Schedule::new(hot).unwrap_err(),
        ScheduleError::Unsafe(SafetyError::TooHot {
            target_dc: MAX_SETPOINT_DC + 1
        })
    );
}

#[test]
fn target_follows_the_segments() {
    let schedule = glaze();
    assert_eq!(schedule.target_at_dc(10), 6_000);
    assert_eq!(schedule.target_at_dc(130), 12_400);
    assert_eq!(schedule.total_minutes(), 180);
}
`,
  "engine/crates/sim/tests/run.rs": t`
use kiln_schedule::ramp::profiles::bisque::bisque;
use kiln_sim::run::simulate;
use kiln_telemetry::stats::peak_dc;

#[test]
fn the_simulated_kiln_heats_up() {
    let samples = simulate(&bisque());
    assert_eq!(samples.len(), 420);
    assert!(peak_dc(&samples) > 1_000);
}
`,
  "dashboard/.gitignore": lines(
    "node_modules/",
    "dist/",
  ),
  "dashboard/eslint.config.mjs": lines(
    "export default [];",
  ),
  "dashboard/package.json": lines(
    "{",
    "  \"name\": \"kiln-dashboard\",",
    "  \"version\": \"0.5.0\",",
    "  \"private\": true,",
    "  \"type\": \"module\",",
    "  \"scripts\": {",
    "    \"dev\": \"tsx src/server.ts\",",
    "    \"build\": \"tsc\",",
    "    \"test\": \"vitest run\",",
    "    \"lint\": \"eslint src\"",
    "  },",
    "  \"dependencies\": {",
    "    \"express\": \"^4.21.0\"",
    "  },",
    "  \"devDependencies\": {",
    "    \"@types/express\": \"^4.17.21\",",
    "    \"eslint\": \"^9.0.0\",",
    "    \"tsx\": \"^4.19.0\",",
    "    \"typescript\": \"^5.6.0\",",
    "    \"vitest\": \"^2.1.0\"",
    "  }",
    "}",
  ),
  "dashboard/tsconfig.json": lines(
    "{",
    "  \"compilerOptions\": {",
    "    \"target\": \"ES2022\",",
    "    \"module\": \"NodeNext\",",
    "    \"moduleResolution\": \"NodeNext\",",
    "    \"strict\": true,",
    "    \"outDir\": \"dist\",",
    "    \"rootDir\": \".\"",
    "  },",
    "  \"include\": [\"src\", \"test\"]",
    "}",
  ),
  ...Object.fromEntries(DASH.map(([file, body]) => [`dashboard/src/${file}`, body])),
  "dashboard/test/setpoint.test.ts": t`
import { describe, expect, it } from 'vitest';
import { celsiusToDc, dcToCelsius, MAX_SETPOINT_DC } from '../src/lib/validate/limits.js';
import { isSetpointDc } from '../src/lib/validate/setpoint.js';

describe('setpoints', () => {
  it('converts between degrees and tenths', () => {
    expect(celsiusToDc(1240)).toBe(12_400);
    expect(dcToCelsius(5_900)).toBe(590);
  });

  it('refuses a setpoint above the kiln limit', () => {
    expect(isSetpointDc(MAX_SETPOINT_DC + 1)).toBe(false);
  });
});
`,
  "dashboard/test/routes.test.ts": t`
import type { Express } from 'express';
import { describe, expect, it } from 'vitest';
import { register } from '../src/routes/firings.routes.js';

describe('firings routes', () => {
  it('registers the firing endpoints', () => {
    const seen: string[] = [];
    const app = {
      post: (path: string) => seen.push('POST ' + path),
      get: (path: string) => seen.push('GET ' + path),
    };
    register(app as unknown as Express);
    expect(seen).toEqual(['POST /firings', 'GET /firings/:id']);
  });
});
`,
  "tools/.gitignore": lines(
    ".venv/",
    "__pycache__/",
    ".pytest_cache/",
  ),
  "tools/pyproject.toml": lines(
    "[project]",
    "name = \"kilnlab\"",
    "version = \"0.2.0\"",
    "requires-python = \">=3.12\"",
    "dependencies = []",
    "",
    "[dependency-groups]",
    "dev = [\"pytest>=9\", \"ruff>=0.14\"]",
    "",
    "[build-system]",
    "requires = [\"hatchling\"]",
    "build-backend = \"hatchling.build\"",
    "",
    "[tool.hatch.build.targets.wheel]",
    "packages = [\"src/kilnlab\"]",
    "",
    "[tool.pytest.ini_options]",
    "pythonpath = [\"src\"]",
    "testpaths = [\"tests\"]",
    "",
    "[tool.ruff]",
    "line-length = 140",
    "src = [\"src\", \"tests\"]",
  ),
  ...Object.fromEntries(TOOLS.map(([file, body]) => [`tools/src/kilnlab/${file}`, body])),
  "tools/tests/test_calibration.py": t`
from kilnlab.calibration.fit import offset_dc
from kilnlab.export.csv_out import as_csv


def test_fit_averages_the_differences():
    assert offset_dc([(1000, 990), (2000, 1980)]) == 15


def test_csv_lists_kilns_in_order():
    assert as_csv({"west": 5, "east": -3}) == "kiln,offset_dc\neast,-3\nwest,5\n"
`,
  // vendored and generated: the context tree and the packs must leave these alone
  "vendor/README.md": lines(
    "# vendor",
    "",
    "Snapshots of third-party code, taken with `scripts/vendor.sh`. Not ours; do not edit.",
  ),
  "vendor/sparkline/sparkline.js": t`
// sparkline 0.9.2 (MIT), vendored. Draws a one-line chart from an array of numbers.
export function sparkline(values) {
  const max = Math.max(...values);
  return values.map((v) => '▁▂▃▄▅▆▇█'[Math.min(7, Math.floor((v / max) * 7))]).join('');
}
`,
  "vendor/sparkline/index.js": t`
export { sparkline } from './sparkline.js';
`,
  "vendor/sparkline/package.json": lines(
    "{",
    "  \"name\": \"sparkline\",",
    "  \"version\": \"0.9.2\",",
    "  \"main\": \"index.js\"",
    "}",
  ),
  "scripts/vendor.sh": lines(
    "#!/bin/sh",
    "# Re-vendors third-party snapshots into vendor/.",
    "set -eu",
    "echo \"vendoring into $(dirname \"$0\")/../vendor\"",
  ),
};

// TypeScript service: [path below src/, body]. Bounded contexts that import each other only through index.ts, one shared kernel.
const LB = [
  ['main.ts', t`
import { createServer } from './platform/http/server.js';
import { composeApp } from './composition.js';
import { loadEnv } from './platform/config/env.js';

const env = loadEnv(process.env);
const app = composeApp(env);
createServer(app.routes).listen(env.port);
`],
  ['composition.ts', t`
import { systemClock } from './shared-kernel/time/clock.js';
import { createBus } from './shared-kernel/events/bus.js';
import { catalogRoutes } from './contexts/catalog/index.js';
import { lendingRoutes } from './contexts/lending/index.js';
import { memberRoutes } from './contexts/members/index.js';
import { memoryTables } from './platform/db/memory.js';
import { createLogger } from './platform/logging/logger.js';
import type { Env } from './platform/config/schema.js';

export const composeApp = (env: Env) => {
  const clock = systemClock;
  const events = createBus();
  const tables = memoryTables();
  const log = createLogger(env.logLevel);
  log.info('compose', { port: env.port });
  const catalogDeps = { items: tables.items, clock, events };
  const memberDeps = { members: tables.members, clock, events };
  const lendingDeps = { loans: tables.loans, clock, events, catalog: { isLendable: async () => true } };
  return { routes: [...catalogRoutes(catalogDeps), ...memberRoutes(memberDeps), ...lendingRoutes(lendingDeps)] };
};
`],
  // ---- shared kernel: imported by every context, imports nothing of theirs
  ['shared-kernel/ids/item-id.ts', t`
export type ItemId = string & { readonly __brand: 'ItemId' };

export const asItemId = (value: string): ItemId => value as ItemId;
`],
  ['shared-kernel/ids/member-id.ts', t`
export type MemberId = string & { readonly __brand: 'MemberId' };

export const asMemberId = (value: string): MemberId => value as MemberId;
`],
  ['shared-kernel/ids/loan-id.ts', t`
export type LoanId = string & { readonly __brand: 'LoanId' };

export const asLoanId = (value: string): LoanId => value as LoanId;
`],
  ['shared-kernel/money/currency.ts', t`
export type Currency = 'EUR' | 'GBP';

export const DEFAULT_CURRENCY: Currency = 'EUR';
`],
  ['shared-kernel/money/rounding.ts', t`
export const roundHalfUp = (value: number): number => Math.floor(value + 0.5);
`],
  ['shared-kernel/money/money.ts', t`
import { DEFAULT_CURRENCY, type Currency } from './currency.js';
import { roundHalfUp } from './rounding.js';

export interface Money {
  readonly cents: number;
  readonly currency: Currency;
}

export const money = (cents: number, currency: Currency = DEFAULT_CURRENCY): Money => ({ cents: roundHalfUp(cents), currency });

export const addMoney = (a: Money, b: Money): Money => money(a.cents + b.cents, a.currency);

export const zero = (): Money => money(0);
`],
  ['shared-kernel/time/clock.ts', t`
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };
`],
  ['shared-kernel/time/calendar.ts', t`
export const addDays = (date: Date, days: number): Date => new Date(date.getTime() + days * 86_400_000);
`],
  ['shared-kernel/time/period.ts', t`
export const daysBetween = (from: Date, to: Date): number => Math.floor((to.getTime() - from.getTime()) / 86_400_000);
`],
  ['shared-kernel/result/result.ts', t`
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
`],
  ['shared-kernel/result/errors.ts', t`
export interface DomainError {
  code: string;
  message: string;
}

export const domainError = (code: string, message: string): DomainError => ({ code, message });
`],
  ['shared-kernel/result/guards.ts', t`
import type { Result } from './result.js';

export const isOk = <T, E>(result: Result<T, E>): result is { ok: true; value: T } => result.ok;
`],
  ['shared-kernel/events/event.ts', t`
export interface DomainEvent {
  name: string;
  at: Date;
  payload: Record<string, string | number>;
}
`],
  ['shared-kernel/events/bus.ts', t`
import type { DomainEvent } from './event.js';

export interface EventBus {
  publish(event: DomainEvent): void;
  subscribe(name: string, handler: (event: DomainEvent) => void): void;
}

export const createBus = (): EventBus => {
  const handlers = new Map<string, ((event: DomainEvent) => void)[]>();
  return {
    publish: (event) => (handlers.get(event.name) ?? []).forEach((handler) => handler(event)),
    subscribe: (name, handler) => handlers.set(name, [...(handlers.get(name) ?? []), handler]),
  };
};
`],
  ['shared-kernel/events/outbox.ts', t`
import type { DomainEvent } from './event.js';

export const createOutbox = () => {
  const pending: DomainEvent[] = [];
  return { add: (event: DomainEvent) => pending.push(event), drain: () => pending.splice(0) };
};
`],
  // ---- platform
  ['platform/http/router.ts', t`
export interface Route {
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  handle: (body: unknown, params: Record<string, string>) => Promise<{ status: number; body: unknown }>;
}

export const matchRoute = (routes: Route[], method: string, path: string): Route | undefined =>
  routes.find((route) => route.method === method && route.path === path);
`],
  ['platform/http/server.ts', t`
import http from 'node:http';
import { matchRoute, type Route } from './router.js';
import { withJson } from './middleware.js';

export const createServer = (routes: Route[]) =>
  http.createServer((req, res) => {
    const route = matchRoute(routes, req.method ?? 'GET', (req.url ?? '/').split('?')[0] ?? '/');
    if (route === undefined) return withJson(res, 404, { error: 'not found' });
    return route.handle(undefined, {}).then((reply) => withJson(res, reply.status, reply.body));
  });
`],
  ['platform/http/middleware.ts', t`
import type { ServerResponse } from 'node:http';

export const withJson = (res: ServerResponse, status: number, body: unknown): void => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};
`],
  ['platform/config/schema.ts', t`
export interface Env {
  port: number;
  logLevel: 'debug' | 'info' | 'warn';
}
`],
  ['platform/config/defaults.ts', t`
import type { Env } from './schema.js';

export const DEFAULTS: Env = { port: 4000, logLevel: 'info' };
`],
  ['platform/config/env.ts', t`
import { DEFAULTS } from './defaults.js';
import type { Env } from './schema.js';

export const loadEnv = (source: Record<string, string | undefined>): Env => ({
  port: Number(source.PORT ?? DEFAULTS.port),
  logLevel: (source.LOG_LEVEL as Env['logLevel'] | undefined) ?? DEFAULTS.logLevel,
});
`],
  ['platform/logging/levels.ts', t`
export const LEVELS = ['debug', 'info', 'warn'] as const;
`],
  ['platform/logging/fields.ts', t`
export const fieldsToText = (fields: Record<string, string | number>): string =>
  Object.entries(fields).map(([key, value]) => key + '=' + value).join(' ');
`],
  ['platform/logging/logger.ts', t`
import { fieldsToText } from './fields.js';
import { LEVELS } from './levels.js';

export const createLogger = (level: (typeof LEVELS)[number]) => ({
  info: (message: string, fields: Record<string, string | number> = {}): void => {
    if (LEVELS.indexOf(level) <= 1) console.log(message + ' ' + fieldsToText(fields));
  },
});
`],
  ['platform/db/memory.ts', t`
import type { Item } from '../../contexts/catalog/index.js';
import type { Loan } from '../../contexts/lending/index.js';
import type { Member } from '../../contexts/members/index.js';
import { table } from './tx.js';

export const memoryTables = () => ({ items: table<Item>(), loans: table<Loan>(), members: table<Member>() });
`],
  ['platform/db/tx.ts', t`
export interface Table<T extends { id: string }> {
  get(id: string): Promise<T | undefined>;
  put(row: T): Promise<void>;
  all(): Promise<T[]>;
}

export const table = <T extends { id: string }>(): Table<T> => {
  const rows = new Map<string, T>();
  return {
    get: async (id) => rows.get(id),
    put: async (row) => {
      rows.set(row.id, row);
    },
    all: async () => [...rows.values()],
  };
};
`],
  ['platform/db/migrations.ts', t`
export const MIGRATIONS: readonly string[] = ['001-items', '002-members', '003-loans'];
`],
  // ---- catalog
  ['contexts/catalog/index.ts', t`
export { addItem } from './application/add-item.js';
export { retireItem } from './application/retire.js';
export { searchItems } from './application/search.js';
export type { CatalogDeps } from './application/deps.js';
export { catalogRoutes } from './http/routes.js';
export type { Item } from './domain/item.js';

export interface CatalogApi {
  isLendable(itemId: string): Promise<boolean>;
}
`],
  ['contexts/catalog/domain/item.ts', t`
import type { ItemId } from '../../../shared-kernel/ids/item-id.js';
import type { Category } from './category.js';
import type { Condition } from './condition.js';

export interface Item {
  id: ItemId;
  name: string;
  category: Category;
  condition: Condition;
  retired: boolean;
}
`],
  ['contexts/catalog/domain/category.ts', t`
export type Category = 'drill' | 'saw' | 'ladder' | 'garden';

export const CATEGORIES: readonly Category[] = ['drill', 'saw', 'ladder', 'garden'];
`],
  ['contexts/catalog/domain/condition.ts', t`
export type Condition = 'new' | 'good' | 'worn' | 'broken';

export const isLendable = (condition: Condition): boolean => condition !== 'broken';
`],
  ['contexts/catalog/application/deps.ts', t`
import type { Clock } from '../../../shared-kernel/time/clock.js';
import type { EventBus } from '../../../shared-kernel/events/bus.js';
import type { Item } from '../domain/item.js';

export interface ItemStore {
  get(id: string): Promise<Item | undefined>;
  put(item: Item): Promise<void>;
  all(): Promise<Item[]>;
}

export interface CatalogDeps {
  items: ItemStore;
  clock: Clock;
  events: EventBus;
}
`],
  ['contexts/catalog/application/add-item.ts', t`
import { asItemId } from '../../../shared-kernel/ids/item-id.js';
import { domainError, type DomainError } from '../../../shared-kernel/result/errors.js';
import { err, ok, type Result } from '../../../shared-kernel/result/result.js';
import { CATEGORIES, type Category } from '../domain/category.js';
import type { Item } from '../domain/item.js';
import type { CatalogDeps } from './deps.js';

export interface AddItemInput {
  id: string;
  name: string;
  category: Category;
}

export const addItem = (deps: CatalogDeps) => async (input: AddItemInput): Promise<Result<Item, DomainError>> => {
  if (!CATEGORIES.includes(input.category)) return err(domainError('unknown-category', input.category));
  if ((await deps.items.get(input.id)) !== undefined) return err(domainError('duplicate-item', input.id));
  const item: Item = { id: asItemId(input.id), name: input.name, category: input.category, condition: 'new', retired: false };
  await deps.items.put(item);
  deps.events.publish({ name: 'catalog.item-added', at: deps.clock.now(), payload: { itemId: input.id } });
  return ok(item);
};
`],
  ['contexts/catalog/application/retire.ts', t`
import { domainError, type DomainError } from '../../../shared-kernel/result/errors.js';
import { err, ok, type Result } from '../../../shared-kernel/result/result.js';
import type { Item } from '../domain/item.js';
import type { CatalogDeps } from './deps.js';

export const retireItem = (deps: CatalogDeps) => async (id: string): Promise<Result<Item, DomainError>> => {
  const item = await deps.items.get(id);
  if (item === undefined) return err(domainError('no-such-item', id));
  const retired = { ...item, retired: true };
  await deps.items.put(retired);
  deps.events.publish({ name: 'catalog.item-retired', at: deps.clock.now(), payload: { itemId: id } });
  return ok(retired);
};
`],
  ['contexts/catalog/application/search.ts', t`
import type { Item } from '../domain/item.js';
import type { CatalogDeps } from './deps.js';

export const searchItems = (deps: CatalogDeps) => async (query: string): Promise<Item[]> =>
  (await deps.items.all()).filter((item) => !item.retired && item.name.toLowerCase().includes(query.toLowerCase()));
`],
  ['contexts/catalog/http/schema.ts', t`
import type { AddItemInput } from '../application/add-item.js';

export const parseAddItem = (body: unknown): AddItemInput => body as AddItemInput;
`],
  ['contexts/catalog/http/presenters.ts', t`
import type { Item } from '../domain/item.js';

export const presentItem = (item: Item): Record<string, string | boolean> => ({
  id: item.id,
  name: item.name,
  category: item.category,
  condition: item.condition,
  retired: item.retired,
});
`],
  ['contexts/catalog/http/routes.ts', t`
import type { Route } from '../../../platform/http/router.js';
import { addItem } from '../application/add-item.js';
import type { CatalogDeps } from '../application/deps.js';
import { searchItems } from '../application/search.js';
import { presentItem } from './presenters.js';
import { parseAddItem } from './schema.js';

export const catalogRoutes = (deps: CatalogDeps): Route[] => [
  {
    method: 'POST',
    path: '/items',
    handle: async (body) => {
      const result = await addItem(deps)(parseAddItem(body));
      return result.ok ? { status: 201, body: presentItem(result.value) } : { status: 422, body: result.error };
    },
  },
  { method: 'GET', path: '/items', handle: async () => ({ status: 200, body: (await searchItems(deps)('')).map(presentItem) }) },
];
`],
  // ---- members
  ['contexts/members/index.ts', t`
export { registerMember } from './application/register.js';
export { suspendMember } from './application/suspend.js';
export type { MemberDeps } from './application/deps.js';
export { memberRoutes } from './http/routes.js';
export type { Member } from './domain/member.js';
`],
  ['contexts/members/domain/member.ts', t`
import type { MemberId } from '../../../shared-kernel/ids/member-id.js';
import type { Standing } from './standing.js';
import type { Tier } from './tier.js';

export interface Member {
  id: MemberId;
  name: string;
  tier: Tier;
  standing: Standing;
}
`],
  ['contexts/members/domain/standing.ts', t`
export type Standing = 'good' | 'suspended';

export const canBorrow = (standing: Standing): boolean => standing === 'good';
`],
  ['contexts/members/domain/tier.ts', t`
export type Tier = 'basic' | 'plus';

export const loanLimit = (tier: Tier): number => (tier === 'plus' ? 5 : 3);
`],
  ['contexts/members/application/deps.ts', t`
import type { Clock } from '../../../shared-kernel/time/clock.js';
import type { EventBus } from '../../../shared-kernel/events/bus.js';
import type { Member } from '../domain/member.js';

export interface MemberStore {
  get(id: string): Promise<Member | undefined>;
  put(member: Member): Promise<void>;
}

export interface MemberDeps {
  members: MemberStore;
  clock: Clock;
  events: EventBus;
}
`],
  ['contexts/members/application/register.ts', t`
import { asMemberId } from '../../../shared-kernel/ids/member-id.js';
import { domainError, type DomainError } from '../../../shared-kernel/result/errors.js';
import { err, ok, type Result } from '../../../shared-kernel/result/result.js';
import type { Member } from '../domain/member.js';
import type { MemberDeps } from './deps.js';

export const registerMember = (deps: MemberDeps) => async (id: string, name: string): Promise<Result<Member, DomainError>> => {
  if ((await deps.members.get(id)) !== undefined) return err(domainError('duplicate-member', id));
  const member: Member = { id: asMemberId(id), name, tier: 'basic', standing: 'good' };
  await deps.members.put(member);
  deps.events.publish({ name: 'members.member-registered', at: deps.clock.now(), payload: { memberId: id } });
  return ok(member);
};
`],
  ['contexts/members/application/suspend.ts', t`
import { domainError, type DomainError } from '../../../shared-kernel/result/errors.js';
import { err, ok, type Result } from '../../../shared-kernel/result/result.js';
import type { Member } from '../domain/member.js';
import type { MemberDeps } from './deps.js';

export const suspendMember = (deps: MemberDeps) => async (id: string): Promise<Result<Member, DomainError>> => {
  const member = await deps.members.get(id);
  if (member === undefined) return err(domainError('no-such-member', id));
  const suspended = { ...member, standing: 'suspended' as const };
  await deps.members.put(suspended);
  deps.events.publish({ name: 'members.member-suspended', at: deps.clock.now(), payload: { memberId: id } });
  return ok(suspended);
};
`],
  ['contexts/members/http/schema.ts', t`
export interface RegisterBody {
  id: string;
  name: string;
}

export const parseRegister = (body: unknown): RegisterBody => body as RegisterBody;
`],
  ['contexts/members/http/presenters.ts', t`
import type { Member } from '../domain/member.js';

export const presentMember = (member: Member): Record<string, string> => ({
  id: member.id,
  name: member.name,
  tier: member.tier,
  standing: member.standing,
});
`],
  ['contexts/members/http/routes.ts', t`
import type { Route } from '../../../platform/http/router.js';
import type { MemberDeps } from '../application/deps.js';
import { registerMember } from '../application/register.js';
import { presentMember } from './presenters.js';
import { parseRegister } from './schema.js';

export const memberRoutes = (deps: MemberDeps): Route[] => [
  {
    method: 'POST',
    path: '/members',
    handle: async (body) => {
      const { id, name } = parseRegister(body);
      const result = await registerMember(deps)(id, name);
      return result.ok ? { status: 201, body: presentMember(result.value) } : { status: 422, body: result.error };
    },
  },
];
`],
  // ---- lending
  ['contexts/lending/index.ts', t`
export { borrowItem } from './application/borrow.js';
export { returnItem } from './application/return.js';
export type { LendingDeps } from './application/deps.js';
export { lendingRoutes } from './http/routes.js';
export type { Loan } from './domain/loan.js';
`],
  ['contexts/lending/domain/loan.ts', t`
import type { ItemId } from '../../../shared-kernel/ids/item-id.js';
import type { LoanId } from '../../../shared-kernel/ids/loan-id.js';
import type { MemberId } from '../../../shared-kernel/ids/member-id.js';
import { domainError, type DomainError } from '../../../shared-kernel/result/errors.js';
import { err, ok, type Result } from '../../../shared-kernel/result/result.js';
import { addDays } from '../../../shared-kernel/time/calendar.js';
import { LOAN_DAYS } from './policy.js';

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
}

export function createLoan(input: NewLoan): Result<Loan, DomainError> {
  if (input.itemId === ('' as ItemId)) return err(domainError('empty-item', 'a loan needs an item'));
  return ok({ id: input.id, itemId: input.itemId, memberId: input.memberId, dueOn: addDays(input.today, LOAN_DAYS) });
}
`],
  ['contexts/lending/domain/policy.ts', t`
export const LOAN_DAYS = 7;
export const MAX_EXTENSIONS = 2;

export const canExtend = (extensions: number): boolean => extensions < MAX_EXTENSIONS;
`],
  ['contexts/lending/domain/fees/late.ts', t`
import { money, type Money } from '../../../../shared-kernel/money/money.js';
import { daysBetween } from '../../../../shared-kernel/time/period.js';

const CENTS_PER_LATE_DAY = 50;

export const lateFee = (dueOn: Date, returnedOn: Date): Money =>
  money(Math.max(0, daysBetween(dueOn, returnedOn)) * CENTS_PER_LATE_DAY);
`],
  ['contexts/lending/domain/fees/damage.ts', t`
import { money, type Money } from '../../../../shared-kernel/money/money.js';

export const damageFee = (before: string, after: string): Money => (before === 'good' && after === 'broken' ? money(2500) : money(0));
`],
  ['contexts/lending/domain/fees/waiver.ts', t`
import { money, type Money } from '../../../../shared-kernel/money/money.js';

export const waive = (fee: Money, reason: string): Money => (reason.trim() === '' ? fee : money(0, fee.currency));
`],
  ['contexts/lending/application/deps.ts', t`
import type { Clock } from '../../../shared-kernel/time/clock.js';
import type { EventBus } from '../../../shared-kernel/events/bus.js';
import type { CatalogApi } from '../../catalog/index.js';
import type { Loan } from '../domain/loan.js';

export interface LoanStore {
  get(id: string): Promise<Loan | undefined>;
  put(loan: Loan): Promise<void>;
  all(): Promise<Loan[]>;
}

export interface LendingDeps {
  loans: LoanStore;
  clock: Clock;
  events: EventBus;
  catalog: CatalogApi;
}
`],
  ['contexts/lending/application/borrow.ts', t`
import { asItemId } from '../../../shared-kernel/ids/item-id.js';
import { asLoanId } from '../../../shared-kernel/ids/loan-id.js';
import { asMemberId } from '../../../shared-kernel/ids/member-id.js';
import { domainError, type DomainError } from '../../../shared-kernel/result/errors.js';
import { err, type Result } from '../../../shared-kernel/result/result.js';
import { createLoan, type Loan } from '../domain/loan.js';
import type { LendingDeps } from './deps.js';

export const borrowItem = (deps: LendingDeps) => async (itemId: string, memberId: string): Promise<Result<Loan, DomainError>> => {
  if (!(await deps.catalog.isLendable(itemId))) return err(domainError('not-lendable', itemId));
  const loan = createLoan({ id: asLoanId('loan-' + itemId), itemId: asItemId(itemId), memberId: asMemberId(memberId), today: deps.clock.now() });
  if (loan.ok) {
    await deps.loans.put(loan.value);
    deps.events.publish({ name: 'lending.loan-started', at: deps.clock.now(), payload: { itemId, memberId } });
  }
  return loan;
};
`],
  ['contexts/lending/application/return.ts', t`
import { domainError, type DomainError } from '../../../shared-kernel/result/errors.js';
import { err, ok, type Result } from '../../../shared-kernel/result/result.js';
import { lateFee } from '../domain/fees/late.js';
import type { Loan } from '../domain/loan.js';
import type { LendingDeps } from './deps.js';

export const returnItem = (deps: LendingDeps) => async (loanId: string): Promise<Result<Loan, DomainError>> => {
  const loan = await deps.loans.get(loanId);
  if (loan === undefined) return err(domainError('no-such-loan', loanId));
  const now = deps.clock.now();
  const returned = { ...loan, returnedOn: now };
  await deps.loans.put(returned);
  const fee = lateFee(loan.dueOn, now);
  deps.events.publish({ name: 'lending.loan-returned', at: now, payload: { loanId, feeCents: fee.cents } });
  return ok(returned);
};
`],
  ['contexts/lending/application/extend.ts', t`
import { domainError, type DomainError } from '../../../shared-kernel/result/errors.js';
import { err, ok, type Result } from '../../../shared-kernel/result/result.js';
import { addDays } from '../../../shared-kernel/time/calendar.js';
import { LOAN_DAYS } from '../domain/policy.js';
import type { Loan } from '../domain/loan.js';
import type { LendingDeps } from './deps.js';

export const extendLoan = (deps: LendingDeps) => async (loanId: string): Promise<Result<Loan, DomainError>> => {
  const loan = await deps.loans.get(loanId);
  if (loan === undefined) return err(domainError('no-such-loan', loanId));
  const extended = { ...loan, dueOn: addDays(loan.dueOn, LOAN_DAYS) };
  await deps.loans.put(extended);
  return ok(extended);
};
`],
  ['contexts/lending/http/schema.ts', t`
export interface BorrowBody {
  itemId: string;
  memberId: string;
}

export const parseBorrow = (body: unknown): BorrowBody => body as BorrowBody;
`],
  ['contexts/lending/http/presenters.ts', t`
import type { Loan } from '../domain/loan.js';

export const presentLoan = (loan: Loan): Record<string, string> => ({
  id: loan.id,
  itemId: loan.itemId,
  memberId: loan.memberId,
  dueOn: loan.dueOn.toISOString(),
});
`],
  ['contexts/lending/http/routes.ts', t`
import type { Route } from '../../../platform/http/router.js';
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
      return result.ok ? { status: 201, body: presentLoan(result.value) } : { status: 409, body: result.error };
    },
  },
];
`],
  // ---- billing: reacts to other contexts by event name only
  ['contexts/billing/index.ts', t`
export { issueInvoice } from './application/issue-invoice.js';
export { onLoanReturned } from './application/on-loan-returned.js';
export type { Invoice } from './domain/invoice.js';
`],
  ['contexts/billing/domain/invoice.ts', t`
import type { Money } from '../../../shared-kernel/money/money.js';
import type { InvoiceLine } from './line.js';

export interface Invoice {
  id: string;
  memberId: string;
  lines: InvoiceLine[];
  total: Money;
  paid: boolean;
}
`],
  ['contexts/billing/domain/line.ts', t`
import type { Money } from '../../../shared-kernel/money/money.js';

export interface InvoiceLine {
  description: string;
  amount: Money;
}
`],
  ['contexts/billing/domain/tax.ts', t`
import { money, type Money } from '../../../shared-kernel/money/money.js';

export const VAT_PERCENT = 20;

export const withVat = (net: Money): Money => money(net.cents * (100 + VAT_PERCENT) / 100, net.currency);
`],
  ['contexts/billing/application/deps.ts', t`
import type { Clock } from '../../../shared-kernel/time/clock.js';
import type { EventBus } from '../../../shared-kernel/events/bus.js';
import type { Invoice } from '../domain/invoice.js';

export interface BillingDeps {
  invoices: { put(invoice: Invoice): Promise<void> };
  clock: Clock;
  events: EventBus;
}
`],
  ['contexts/billing/application/issue-invoice.ts', t`
import { addMoney, zero } from '../../../shared-kernel/money/money.js';
import type { Invoice } from '../domain/invoice.js';
import type { InvoiceLine } from '../domain/line.js';
import { withVat } from '../domain/tax.js';
import type { BillingDeps } from './deps.js';

export const issueInvoice = (deps: BillingDeps) => async (memberId: string, lines: InvoiceLine[]): Promise<Invoice> => {
  const net = lines.reduce((sum, line) => addMoney(sum, line.amount), zero());
  const invoice: Invoice = { id: 'inv-' + memberId + '-' + deps.clock.now().getTime(), memberId, lines, total: withVat(net), paid: false };
  await deps.invoices.put(invoice);
  deps.events.publish({ name: 'billing.invoice-issued', at: deps.clock.now(), payload: { invoiceId: invoice.id } });
  return invoice;
};
`],
  ['contexts/billing/application/on-loan-returned.ts', t`
import { money } from '../../../shared-kernel/money/money.js';
import type { DomainEvent } from '../../../shared-kernel/events/event.js';
import type { BillingDeps } from './deps.js';
import { issueInvoice } from './issue-invoice.js';

export const onLoanReturned = (deps: BillingDeps) => async (event: DomainEvent): Promise<void> => {
  const feeCents = Number(event.payload.feeCents ?? 0);
  if (feeCents > 0) await issueInvoice(deps)(String(event.payload.loanId), [{ description: 'late fee', amount: money(feeCents) }]);
};
`],
  ['contexts/billing/application/record-payment.ts', t`
import type { Invoice } from '../domain/invoice.js';
import type { BillingDeps } from './deps.js';

export const recordPayment = (deps: BillingDeps) => async (invoice: Invoice): Promise<Invoice> => {
  const paid = { ...invoice, paid: true };
  await deps.invoices.put(paid);
  return paid;
};
`],
  // ---- notifications
  ['contexts/notifications/index.ts', t`
export { notify } from './application/notify.js';
export type { NotifyDeps } from './application/deps.js';
`],
  ['contexts/notifications/application/deps.ts', t`
import type { Channel } from '../channels/email.js';

export interface NotifyDeps {
  channels: Channel[];
}
`],
  ['contexts/notifications/application/templates.ts', t`
export const templateFor = (eventName: string): string =>
  eventName === 'lending.loan-returned' ? 'Thanks for returning the tool.' : 'Something changed on your account.';
`],
  ['contexts/notifications/application/notify.ts', t`
import type { DomainEvent } from '../../../shared-kernel/events/event.js';
import type { NotifyDeps } from './deps.js';
import { templateFor } from './templates.js';

export const notify = (deps: NotifyDeps) => async (event: DomainEvent): Promise<number> => {
  const text = templateFor(event.name);
  await Promise.all(deps.channels.map((channel) => channel.send(String(event.payload.memberId ?? ''), text)));
  return deps.channels.length;
};
`],
  ['contexts/notifications/channels/email.ts', t`
export interface Channel {
  send(memberId: string, text: string): Promise<void>;
}

export const emailChannel: Channel = {
  send: async (memberId, text) => {
    console.log('email to ' + memberId + ': ' + text);
  },
};
`],
  ['contexts/notifications/channels/sms.ts', t`
import type { Channel } from './email.js';

export const smsChannel: Channel = {
  send: async (memberId, text) => {
    console.log('sms to ' + memberId + ': ' + text.slice(0, 160));
  },
};
`],
  ['contexts/notifications/channels/push.ts', t`
import type { Channel } from './email.js';

export const pushChannel: Channel = {
  send: async (memberId, text) => {
    console.log('push to ' + memberId + ': ' + text.slice(0, 80));
  },
};
`],
];

export const TS_SERVICE_FILES = {
  ".gitignore": lines(
    "node_modules/",
    "dist/",
    "coverage/",
  ),
  "scratch/page-7.md": lines(
    "# Contributing to lendbox",
    "",
    "## Boundaries",
    "",
    "- Import another context only through its `index.ts`: nothing outside `src/contexts/lending/` imports from `src/contexts/lending/domain/`, `application/` or `http/`.",
    "",
    "## Events",
    "",
    "- Event names are `<context>.<past-tense-verb>` in kebab case, for example `lending.loan-returned`. A context reacts to another one by event name, never by importing its code.",
    "",
    "## Checks",
    "",
    "- `npm test` and `npm run lint` pass before a merge request is opened.",
  ),
  "README.md": lines(
    "# lendbox",
    "",
    "Back end of a community tool library: members borrow tools, late returns cost a fee, and",
    "the library invoices the fees.",
    "",
    "Organised by bounded context, with a shared kernel beside them:",
    "",
    "```",
    "src/contexts/catalog         the tools: add, search, retire",
    "src/contexts/members         who may borrow, and how many tools at once",
    "src/contexts/lending         loans, due dates and late or damage fees",
    "src/contexts/billing         invoices for fees, reacting to lending events",
    "src/contexts/notifications   messages to members over email, sms and push",
    "src/shared-kernel            ids, money, time, result and the event bus every context uses",
    "src/platform                 http server, config, logging and the in-memory tables",
    "src/composition.ts           the only file that wires contexts together",
    "```",
    "",
    "Run `npm test` and `npm run lint`.",
  ),
  "eslint.config.mjs": lines(
    "export default [{ files: ['src/**/*.ts'], rules: {} }];",
  ),
  "jest.config.cjs": lines(
    "module.exports = {",
    "  preset: 'ts-jest',",
    "  testEnvironment: 'node',",
    "  roots: ['<rootDir>/test'],",
    "  moduleNameMapper: { '^(\\\\.{1,2}/.*)\\\\.js$': '$1' },",
    "};",
  ),
  "package.json": lines(
    "{",
    "  \"name\": \"lendbox\",",
    "  \"version\": \"0.4.0\",",
    "  \"private\": true,",
    "  \"type\": \"module\",",
    "  \"scripts\": {",
    "    \"build\": \"tsc\",",
    "    \"start\": \"node dist/main.js\",",
    "    \"test\": \"jest\",",
    "    \"lint\": \"eslint src\"",
    "  },",
    "  \"devDependencies\": {",
    "    \"@types/jest\": \"^29.5.12\",",
    "    \"@types/node\": \"^22.0.0\",",
    "    \"eslint\": \"^9.0.0\",",
    "    \"jest\": \"^29.7.0\",",
    "    \"ts-jest\": \"^29.2.0\",",
    "    \"typescript\": \"^5.6.0\"",
    "  }",
    "}",
  ),
  "tsconfig.json": lines(
    "{",
    "  \"compilerOptions\": {",
    "    \"target\": \"ES2022\",",
    "    \"module\": \"NodeNext\",",
    "    \"moduleResolution\": \"NodeNext\",",
    "    \"strict\": true,",
    "    \"noUncheckedIndexedAccess\": true,",
    "    \"outDir\": \"dist\",",
    "    \"rootDir\": \"src\",",
    "    \"types\": [\"node\"]",
    "  },",
    "  \"include\": [\"src\"]",
    "}",
  ),
  ...Object.fromEntries(LB.map(([file, body]) => [`src/${file}`, body])),
  "test/fees.test.ts": t`
import { lateFee } from '../src/contexts/lending/domain/fees/late.js';

describe('late fees', () => {
  it('charges 50 cents for each day after the due date', () => {
    const due = new Date('2026-03-01T00:00:00Z');
    expect(lateFee(due, new Date('2026-03-04T00:00:00Z')).cents).toBe(150);
  });

  it('charges nothing for an early return', () => {
    const due = new Date('2026-03-10T00:00:00Z');
    expect(lateFee(due, new Date('2026-03-04T00:00:00Z')).cents).toBe(0);
  });
});
`,
  "test/borrow.test.ts": t`
import { borrowItem } from '../src/contexts/lending/application/borrow.js';
import { createBus } from '../src/shared-kernel/events/bus.js';

const deps = (lendable: boolean) => {
  const rows = new Map();
  return {
    loans: { get: async (id: string) => rows.get(id), put: async (loan: { id: string }) => void rows.set(loan.id, loan), all: async () => [...rows.values()] },
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
    expect(result.ok && result.value.dueOn.toISOString()).toBe('2026-03-08T00:00:00.000Z');
  });
});
`,
};
