// web/src/lib/version.ts: the line Settings shows under the app's name (sprint 5a, P4).
export function versionLine(status: { version?: string }): string | null {
  return status.version ? `Version ${status.version}` : null;
}
