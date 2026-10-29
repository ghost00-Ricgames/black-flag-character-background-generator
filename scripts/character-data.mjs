/** Black Flag 3.x extraction. The editable form remains authoritative when system schemas differ. */
const text = value => {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object") return text(value.name ?? value.label ?? value.value ?? "");
  return "";
};
function first(...values) { return values.map(text).find(Boolean) || ""; }
export function actorFacts(actor) {
  const s = actor.system ?? {};
  const items = Array.from(actor.items ?? []);
  const find = (...types) => items.filter(i => types.includes(String(i.type).toLowerCase()));
  const names = (...types) => find(...types).map(i => i.name).filter(Boolean).join(", ");
  const classItems = find("class");
  return {
    name: actor.name ?? "",
    lineage: first(s.lineage, s.details?.lineage, names("lineage", "ancestry", "race")),
    heritage: first(s.heritage, s.details?.heritage, names("heritage")),
    background: first(s.background, s.details?.background, names("background")),
    class: first(s.class, s.details?.class, names("class")),
    level: first(s.details?.level, s.level, classItems.reduce((n,i) => n + (Number(i.system?.levels ?? i.system?.level) || 0), 0) || ""),
    notes: first(s.details?.biography?.value, s.biography?.value)
  };
}
