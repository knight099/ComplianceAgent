import { readFileSync } from "node:fs";
export function deviceReview(e) {
  if (!e.collector || !Array.isArray(e.facts)) return e;
  const baseline = process.env.DEVICE_BASELINE_FILE
    ? JSON.parse(readFileSync(process.env.DEVICE_BASELINE_FILE, "utf8"))
    : {};
  return {
    ...e,
    facts: e.facts.map((f) => {
      const allowed = baseline[e.source]?.[f.group];
      if (!Array.isArray(allowed) || !Array.isArray(f.members))
        return { ...f, review: "Baseline review required" };
      const excess = f.members.filter((member) => !allowed.includes(member));
      return {
        ...f,
        excess,
        review: excess.length
          ? "Unapproved membership"
          : "Within approved membership",
      };
    }),
  };
}
