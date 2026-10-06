// server/security.ts: runs before everything else (design §11 "Server security")
import type { MiddlewareHandler } from 'hono';

/**
 * Host allowlist on every request, which stops DNS rebinding. Origin allowlist and a JSON body on
 * every request that is not GET or HEAD, which stops cross-site form posts. No CORS headers are
 * ever set, so no other origin can read a response.
 */
export function securityMiddleware(port: number, devOrigin?: string): MiddlewareHandler {
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const origins = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`, ...(devOrigin ? [devOrigin] : [])]);
  return async (c, next) => {
    const host = c.req.header('host')?.toLowerCase();
    if (!host || !hosts.has(host)) return c.text('Forbidden host', 403);
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
      const origin = c.req.header('origin');
      if (!origin || !origins.has(origin)) return c.text('Forbidden origin', 403);
      if (!(c.req.header('content-type') ?? '').toLowerCase().startsWith('application/json')) return c.text('JSON only', 415);
    }
    await next();
  };
}
