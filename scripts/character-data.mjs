/** Black Flag character extraction. No assumption that class/subclass is a single scalar. */
const asText = value => {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value && typeof value === "object") return asText(value.name ?? value.label ?? value.value ?? "");
  return "";
};
const first = (...values) => values.map(asText).find(Boolean) || "";
const itemType = item => String(item.type ?? "").toLowerCase();
const positiveLevel = value => { const n = Number(value); return Number.isInteger(n) && n > 0 ? n : null; };
const subclassFrom = (item, subclasses) => {
  const s = item.system ?? {};
  const direct = first(s.subclass, s.details?.subclass, s.archetype, s.specialization);
  if (direct) return direct;
  const linked = subclasses.find(sub => {
    const data = sub.system ?? {};
    const parent = first(data.class, data.parentClass, data.className, data.parent?.name);
    return parent && parent.toLowerCase() === String(item.name).toLowerCase();
  });
  return linked?.name ?? "";
};
export function actorFacts(actor) {
  const s = actor.system ?? {};
  const items = Array.from(actor.items ?? []);
  const named = (...types) => items.filter(i => types.includes(itemType(i))).map(i => i.name).filter(Boolean).join(", ");
  const classItems = items.filter(i => itemType(i) === "class");
  const subclassItems = items.filter(i => ["subclass","archetype"].includes(itemType(i)));
  const classes = classItems.map(item => ({
    name: item.name ?? "",
    level: positiveLevel(item.system?.levels ?? item.system?.level ?? item.system?.advancement?.level),
    subclass: subclassFrom(item, subclassItems)
  }));
  // Preserve system-level values when the installed Black Flag actor does not use class items.
  if (!classes.length && first(s.class, s.details?.class)) {
    classes.push({ name: first(s.class,s.details?.class), level: positiveLevel(s.details?.level ?? s.level), subclass: first(s.subclass,s.details?.subclass) });
  }
  // Unmatched subclasses must not silently disappear.
  const unmatched = subclassItems.filter(item => !classes.some(c => c.subclass === item.name));
  const classNotes = unmatched.map(i => i.name).join(", ");
  const sum = classes.reduce((n,c) => n + (c.level ?? 0),0);
  const level = positiveLevel(s.details?.level ?? s.level) ?? (sum || null);
  return {
    name: actor.name ?? "",
    lineage: first(s.lineage,s.details?.lineage,named("lineage","ancestry","race")),
    heritage: first(s.heritage,s.details?.heritage,named("heritage")),
    background: first(s.background,s.details?.background,named("background")),
    class: classes.map(c => `${c.name}${c.level ? " "+c.level : ""}${c.subclass ? " ("+c.subclass+")" : ""}`).join(" / ") || named("class"),
    classes,
    subclassNotes: classNotes,
    level: level ?? "",
    notes: first(s.biography?.backstory,s.details?.biography?.value,s.biography?.value)
  };
}
