/**
 * Public env access for the browser. Anything that needs to ship to the
 * client MUST start with `NEXT_PUBLIC_`. Never leak server-only secrets.
 */
export const publicEnv = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
  wsUrl: process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:4000',
} as const;
