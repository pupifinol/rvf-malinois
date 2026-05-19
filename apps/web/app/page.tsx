import { redirect } from 'next/navigation';

/**
 * Root route handler.
 *
 * The (rvf-console) route group also serves `/`, but having an explicit
 * redirect documents intent and prevents Next from picking the wrong group
 * when we add another root-level page later. F1 will swap this for a
 * session-aware redirect (RVF user -> /, client user -> /portal).
 */
export default function Index(): never {
  redirect('/operations');
}
