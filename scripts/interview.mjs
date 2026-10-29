export const MODULE_ID = "black-flag-character-background-generator";
export const QUESTION_INSTRUCTION = `You are conducting a character creation interview for a Tales of the Valiant fantasy RPG. Based on fixed character facts, questionnaire answers, and prior interview answers, ask exactly ONE insightful, specific follow-up question. Avoid repeating earlier questions. Give the player creative room; do not force a premise. Return JSON {"question":"...", "suggestions":["...", "...", "..."]}. Suggestions are optional inspirations, not fixed choices.`;
export const PACKAGE_INSTRUCTION = `Create a compelling, grounded, playable Tales of the Valiant character background. The supplied character facts and player responses are authoritative. You have creative freedom to invent NPCs, places, relationships, and significant events, but never change character mechanics, contradict player answers, or assert invented campaign lore as canon. If campaign context is provided, honor it. Return ONLY a JSON object with these exact keys: story (string, 350-650 words), profile (object containing personality, ideals, bonds, flaws, motivations, fears, mannerisms), relationships (array of 3-5 objects with name, connection, status, significance), secrets (array of objects with title, description, visibility set to "player" or "gm_suggestion"), hooks (array of 2-3 objects with title and description). GM suggestions are proposals, not established campaign facts. Avoid generic fantasy tropes and purple prose.`;
export function validatePackage(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Gemini returned an invalid character package.");
  if (typeof data.story !== "string" || !data.story.trim()) throw new Error("Gemini omitted the character history.");
  for (const key of ["profile","relationships","secrets","hooks"]) {
    if (!data[key] || typeof data[key] !== "object") throw new Error(`Gemini omitted ${key}.`);
  }
  if (!Array.isArray(data.relationships) || !Array.isArray(data.secrets) || !Array.isArray(data.hooks)) throw new Error("Gemini returned malformed lists.");
  return data;
}
export function biographyHtml(data) {
  const escape = value => foundry.utils.escapeHTML(String(value ?? ""));
  const paragraph = value => escape(value).replace(/\n\n+/g,"</p><p>").replace(/\n/g,"<br>");
  const section = (title, html) => `<h2>${escape(title)}</h2>${html}`;
  const profile = Object.entries(data.profile || {}).map(([k,v]) => `<p><strong>${escape(k)}:</strong> ${paragraph(Array.isArray(v) ? v.join(", ") : v)}</p>`).join("");
  const list = (items, format) => `<ul>${items.map(i => `<li>${format(i)}</li>`).join("")}</ul>`;
  return [
    section("Character History", `<p>${paragraph(data.story)}</p>`),
    section("Roleplaying Profile", profile),
    section("Relationships", list(data.relationships, i => `<strong>${escape(i.name)}</strong> (${escape(i.connection)}): ${escape(i.significance)} — ${escape(i.status)}`)),
    section("Secrets", list(data.secrets.filter(i => i.visibility !== "gm_suggestion"), i => `<strong>${escape(i.title)}:</strong> ${escape(i.description)}`)),
    section("Adventure Hooks", list(data.hooks, i => `<strong>${escape(i.title)}:</strong> ${escape(i.description)}`))
  ].join("");
}
