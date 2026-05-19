import { Button, Card, CardBody, CardHeader, CardLabel } from '@rvf/ui';

/**
 * Login — Phase F0 placeholder.
 *
 * F1 replaces this with the real flow (Clerk/Auth0/WorkOS SSO) and a server
 * middleware that issues a httpOnly cookie session.
 */
export default function LoginPage() {
  return (
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
  );
}
