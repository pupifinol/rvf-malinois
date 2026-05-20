import { Button, Card, CardBody, CardHeader, CardLabel } from '@rvf/ui';

import { Wordmark } from '@/components/shell/Wordmark';

/**
 * Login — Phase F0 placeholder.
 *
 * Uses the same server-component inline-SVG <Wordmark> the operations
 * console and client portal use, so the MALINOIS lockup picks up the
 * page-level Montserrat webfont (sidesteps the <img> font isolation issue).
 *
 * F1 replaces this with the real flow (Clerk/Auth0/WorkOS SSO) and a server
 * middleware that issues a httpOnly cookie session.
 */
export default function LoginPage() {
  return (
    <div className="flex flex-col items-center gap-9">
      <div className="flex flex-col items-center gap-4">
        <Wordmark variant="dark" className="h-[96px] shrink-0" />
        <span className="text-micro uppercase tracking-micro text-text-muted">
          Monitoring &amp; Predictive Intelligence
        </span>
      </div>
      <Card className="w-[360px]">
        <CardHeader>
          <CardLabel>Sign in</CardLabel>
        </CardHeader>
        <CardBody>
          <p className="text-sm text-text-secondary mb-5">
            Authentication is wired up in F1 (SSO / SAML for client tenants).
          </p>
          <Button variant="primary" className="w-full" disabled>
            Continue with SSO
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}
