import { Card, CardBody, CardHeader, CardLabel } from '@rvf/ui';

/**
 * Client portal landing — Phase F0 placeholder.
 *
 * UI/UX §5 — "the portal is the showcase: cleaner, lower density, the same
 * design system." F6 fleshes this out into the real customer surface.
 */
export default function ClientPortalHome() {
  return (
    <div className="max-w-[1200px] mx-auto flex flex-col gap-7">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Welcome</h1>
        <p className="text-sm text-text-secondary mt-1">
          Read-only view of your active Well Testing operations. The real surface launches in F6.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardLabel>Your wells</CardLabel>
        </CardHeader>
        <CardBody>
          <p className="text-sm text-text-secondary">
            No active jobs yet. Once a Well Testing service is in progress your wells will appear
            here with their live readings and trend history.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
