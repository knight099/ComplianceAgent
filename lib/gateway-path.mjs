// Only link to a configured route on the same origin as the dashboard.
export function gatewayPath(value) {
  if (!value) return null;
  if (!/^\/(?!\/)[a-zA-Z0-9_/-]+$/.test(value)) throw Error("Expected a same-origin gateway path");
  return value;
}
