import { Card, CardBody, CardHeader, CardLabel, StatusDot } from '@rvf/ui';

/**
 * Console landing — Phase F0 placeholder.
 *
 * F3 will replace this with the live Operations Centre (UI/UX §6): fleet
 * KPI strip + multiwell mosaic. For now, the page exists only so the
 * design tokens, layout chrome, and connection banner can be reviewed.
 */
export default function ConsoleHome() {
  return (
    <div className="flex flex-col gap-7">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Operations</h1>
        <p className="text-sm text-text-secondary mt-1">
          Phase F0 — engineering foundations. Live screens land in F3.
        </p>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <Card>
          <CardHeader>
            <CardLabel>Wells in test</CardLabel>
            <StatusDot kind="stale" size="sm" aria-label="No data — placeholder" />
          </CardHeader>
          <CardBody>
            <div className="text-display font-semibold tabular-nums">—</div>
            <p className="text-xs text-text-muted mt-1">Awaiting telemetry pipeline (F2)</p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardLabel>Active alarms</CardLabel>
            <StatusDot kind="stale" size="sm" aria-label="No data — placeholder" />
          </CardHeader>
          <CardBody>
            <div className="text-display font-semibold tabular-nums">—</div>
            <p className="text-xs text-text-muted mt-1">Alarm engine ships in F4</p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardLabel>Sensors online</CardLabel>
            <StatusDot kind="stale" size="sm" aria-label="No data — placeholder" />
          </CardHeader>
          <CardBody>
            <div className="text-display font-semibold tabular-nums">—</div>
            <p className="text-xs text-text-muted mt-1">SignalFire health screen in F3</p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardLabel>Live data rate</CardLabel>
            <StatusDot kind="stale" size="sm" aria-label="No data — placeholder" />
          </CardHeader>
          <CardBody>
            <div className="text-display font-semibold tabular-nums">—</div>
            <p className="text-xs text-text-muted mt-1">Ring buffer + tick wired in F2</p>
          </CardBody>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardLabel>Foundations checklist</CardLabel>
        </CardHeader>
        <CardBody>
          <ul className="space-y-2 text-sm">
            <li className="flex gap-3">
              <StatusDot kind="normal" size="sm" />
              <span>Monorepo, TypeScript, Tailwind, design tokens</span>
            </li>
            <li className="flex gap-3">
              <StatusDot kind="normal" size="sm" />
              <span>NestJS backend skeleton, healthcheck, WebSocket gateway</span>
            </li>
            <li className="flex gap-3">
              <StatusDot kind="normal" size="sm" />
              <span>Prisma + TimescaleDB extension ready</span>
            </li>
            <li className="flex gap-3">
              <StatusDot kind="stale" size="sm" />
              <span>Domain schema, ThingsBoard wrapper, dashboards (F1+)</span>
            </li>
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
