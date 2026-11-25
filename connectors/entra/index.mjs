// Callers supply a token for their directory. Retain only identifiers in HR scope.
export async function collectDirectoryMatches(employees, token, send = fetch) {
  const endpoint = "https://graph.microsoft.com/v1.0/users";
  const matches = new Map(employees.map(({ id }) => [id, new Set()]));
  const seenPages = new Set();
  let url = new URL(endpoint + "?$select=id,employeeId");
  let complete = false;
  try {
    while (url) {
      if (url.origin !== "https://graph.microsoft.com" ||
          url.pathname !== "/v1.0/users" || url.username || url.password ||
          seenPages.has(url.href)) throw Error("Invalid directory continuation");
      seenPages.add(url.href);
      const response = await send(url, {
        headers: { Authorization: "Bearer " + token },
        redirect: "error",
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw Error("Directory read failed");
      const page = await response.json();
      if (!Array.isArray(page.value)) throw Error("Invalid directory page");
      for (const user of page.value) {
        if (typeof user?.id !== "string" || !user.id ||
            (user.employeeId != null && typeof user.employeeId !== "string"))
          throw Error("Invalid directory record");
        matches.get(user.employeeId)?.add(user.id);
      }
      const next = page["@odata.nextLink"];
      if (next !== undefined && (typeof next !== "string" || !next))
        throw Error("Invalid directory continuation");
      url = next === undefined ? null : new URL(next);
    }
    complete = true;
  } catch {
    // A failed page can hide another account with the same employee ID.
  }
  const observed = new Date().toISOString();
  return new Map([...matches].map(([employeeId, accounts]) => {
    const record = { source: "Microsoft Entra ID", observed };
    if (!complete) record.status = "unavailable";
    else if (accounts.size === 0) record.status = "unmatched";
    else if (accounts.size > 1) record.status = "ambiguous";
    else {
      record.status = "matched";
      record.accountId = [...accounts][0];
    }
    return [employeeId, record];
  }));
}
