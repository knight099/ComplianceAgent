const endpoint = "https://graph.microsoft.com/v1.0/deviceManagement/managedDevices";
const day = 24 * 60 * 60 * 1000;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function deviceKey(value) {
  return typeof value === "string" && uuid.test(value) && value !== "00000000-0000-0000-0000-000000000000"
    ? value.toLowerCase() : null;
}
function fresh(value, now) {
  const timestamp = typeof value === "string" ? Date.parse(value) : NaN;
  return timestamp <= now && now - timestamp <= day;
}

// The inventory is the denominator, including issued laptops absent from the
// directory. Scope the Graph credential to the same customer's Intune tenant.
export async function auditLaptops(inventory, token, send = fetch, now = new Date()) {
  if (!token || !Array.isArray(inventory?.assets) || typeof inventory.observedAt !== "string" ||
      !Number.isFinite(Date.parse(inventory.observedAt))) throw Error("Supply a dated asset inventory and Intune access token");
  const ids = new Set(), keyCounts = new Map(), matches = new Map();
  for (const asset of inventory.assets) {
    if (typeof asset?.assetId !== "string" || !asset.assetId.trim() || ids.has(asset.assetId))
      throw Error("Missing or duplicate asset ID");
    ids.add(asset.assetId);
    const key = deviceKey(asset.entraDeviceId);
    keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
  }
  let coverage = "complete";
  let unidentifiedDevices = 0;
  try {
    let url = new URL(endpoint + "?$select=id,azureADDeviceId,lastSyncDateTime,isEncrypted");
    const pages = new Set(), managedIds = new Set();
    while (url) {
      if (url.origin !== "https://graph.microsoft.com" || url.pathname !== new URL(endpoint).pathname ||
          url.username || url.password || url.hash || pages.has(url.href)) throw Error("Invalid continuation");
      pages.add(url.href);
      const response = await send(url, { headers: {Authorization: "Bearer " + token}, redirect: "error", signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw Error("Intune unavailable");
      const page = await response.json();
      if (!Array.isArray(page.value)) throw Error("Invalid page");
      for (const device of page.value) {
        if (typeof device?.id !== "string" || !device.id || managedIds.has(device.id)) throw Error("Invalid device page");
        managedIds.add(device.id);
        const key = deviceKey(device.azureADDeviceId);
        if (!key) {
          unidentifiedDevices++;
          continue;
        }
        if (!keyCounts.has(key)) continue;
        if (!matches.has(key)) matches.set(key, []);
        matches.get(key).push(device);
      }
      const next = page["@odata.nextLink"];
      url = next === undefined ? null : new URL(next);
    }
  } catch {
    coverage = "unavailable";
    matches.clear();
  }
  const rows = inventory.assets.map(asset => {
    const key = deviceKey(asset.entraDeviceId);
    const devices = matches.get(key) ?? [];
    let outcome;
    if (coverage === "unavailable") outcome = "COLLECTION_UNAVAILABLE";
    else if (!fresh(inventory.observedAt, +now)) outcome = "STALE_INVENTORY";
    else if (!key || keyCounts.get(key) !== 1 || devices.length > 1) outcome = "IDENTITY_NEEDS_REVIEW";
    else if (!devices.length) outcome = unidentifiedDevices ? "IDENTITY_NEEDS_REVIEW" : "MISSING_FROM_INTUNE_SCOPE";
    else if (!fresh(devices[0].lastSyncDateTime, +now)) outcome = "STALE_DEVICE_EVIDENCE";
    else if (typeof devices[0].isEncrypted !== "boolean") outcome = "ENCRYPTION_UNKNOWN";
    else outcome = devices[0].isEncrypted ? "REPORTED_ENCRYPTED" : "REPORTED_UNENCRYPTED";
    const device = key && keyCounts.get(key) === 1 && devices.length === 1 ? devices[0] : undefined;
    return { assetId: asset.assetId, entraDeviceId: key, outcome, managedDeviceId: device?.id ?? null,
      lastSync: typeof device?.lastSyncDateTime === "string" ? device.lastSyncDateTime : null };
  });
  return { format:"complyos.laptop-audit/v1", source:"Microsoft Intune", observedAt:now.toISOString(),
    inventoryObservedAt:inventory.observedAt, coverage, rows };
}
