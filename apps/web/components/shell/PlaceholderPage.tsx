import { Card, CardBody, CardHeader, CardLabel, StatusDot } from '@rvf/ui';

/**
 * PlaceholderPage — shared shell for routes that exist for navigation only
 * during Phase F0. Each route gets its own real screen in a later phase.
 */
export const PlaceholderPage = ({
  title,
  phase,
  description,
}: {
  title: string;
  phase: string;
  description: string;
}) => {
  return (
    <div className="flex flex-col gap-7">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-text-secondary mt-1">{description}</p>
      </header>

      <Card>
        <CardHeader>
          <CardLabel>Status</CardLabel>
          <StatusDot kind="stale" size="sm" />
        </CardHeader>
        <CardBody>
          <p className="text-sm text-text-secondary">
            This surface is scheduled for <span className="text-text-primary">{phase}</span>. The F0
            build only mounts the route so navigation stays functional.
          </p>
        </CardBody>
      </Card>
    </div>
  );
};
