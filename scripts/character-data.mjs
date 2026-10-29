/** Extract from Black Flag PCData progression (koboldpress/black-flag pc-data.mjs). */
const nameOf = value => typeof value === "string" ? value : (value?.name ?? value?.document?.name ?? "");
export function actorFacts(actor) {
  const s = actor.system ?? {};
  const progression = s.progression ?? {};
  const classEntries = Object.values(progression.classes ?? {});
  const classes = classEntries.map(entry => ({
    name: nameOf(entry.document),
    level: Number(entry.levels) || null,
    subclass: nameOf(entry.subclass)
  })).filter(entry => entry.name);
  // Progression classes are prepared from progression.levels; fall back to those
  // individual level records if the derived mapping has not yet been prepared.
  if (!classes.length) {
    const levels = Object.values(progression.levels ?? {});
    for (const entry of levels) {
      const doc = entry?.class;
      if (!doc) continue;
      const name = nameOf(doc);
      let existing = classes.find(c => c.name === name);
      if (!existing) { existing = {name, level:0, subclass:""}; classes.push(existing); }
      existing.level++;
    }
  }
  const talents = Array.from(actor.items ?? []).filter(i => i.type === "talent").map(i => i.name).filter(Boolean);
  const prof = s.proficiencies ?? {};
  const skillProficiencies = Object.entries(prof.skills ?? {}).filter(([,v]) => Number(v?.proficiency?.multiplier ?? 0) > 0).map(([key]) => key);
  const toolProficiencies = Object.entries(prof.tools ?? {}).filter(([,v]) => Number(v?.proficiency?.multiplier ?? 0) > 0).map(([key]) => key);
  const physical = Object.fromEntries(["age","height","weight","eyes","skin","hair"].map(k=>[k,s.biography?.[k] ?? ""]));
  const total = Object.keys(progression.levels ?? {}).length || classes.reduce((n,c)=>n+(c.level||0),0);
  return {
    name: actor.name ?? "",
    lineage: nameOf(progression.lineage),
    heritage: nameOf(progression.heritage),
    background: nameOf(progression.background),
    class: classes.map(c=>[c.name,c.level,c.subclass && `(${c.subclass})`].filter(Boolean).join(" ")).join(" / "),
    classes,
    talents,
    skillProficiencies,
    toolProficiencies,
    physical,
    subclassNotes: "",
    level: total || "",
    notes: s.biography?.backstory ?? ""
  };
}
