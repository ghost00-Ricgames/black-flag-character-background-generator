export const MODULE_ID = "black-flag-character-background-generator";
export const QUESTION_INSTRUCTION = `You are conducting a character creation interview for a Tales of the Valiant fantasy RPG. Based on fixed character facts, questionnaire answers, prior interview answers, and any supplied character artwork, ask exactly ONE insightful, specific follow-up question. Treat any portrait as inspiration for visible details only; it cannot override established character facts, mechanics, or user answers. Avoid repeating earlier questions. Give the player creative room; do not force a premise. Return JSON {"question":"...", "suggestions":["...", "...", "..."]}. Suggestions are optional inspirations, not fixed choices.`;
export const PACKAGE_INSTRUCTION = `Create a compelling, grounded, playable Tales of the Valiant character background. The supplied character facts and player responses are authoritative. If character artwork accompanies the text, use clothing, expression, scars and other *visible* features as optional inspiration, never as proof of past events, affiliations, ancestry, talents, mechanics, or established lore. Never override player-supplied physical details. Respect all classes, subclasses, class levels, talents, background, heritage, skill and tool proficiencies. Physical traits (age, height, weight, eyes, skin, hair) supplied by the player are fixed; for missing physical traits, propose plausible values separately for review. You have creative freedom to invent NPCs, places, relationships, and significant events, but never change character mechanics, contradict player answers, or assert invented campaign lore as canon. If campaign context is provided, honor it. Return ONLY a JSON object with these exact keys: story (string, 350-650 words), physical (object with age, height, weight, eyes, skin, hair; leave player-provided values unchanged), profile (object containing personality, ideals, bonds, flaws, motivations, fears, mannerisms), relationships (array of 3-5 objects with name, connection, status, significance), secrets (array of objects with title, description, visibility set to "player" or "gm_suggestion"), hooks (array of 2-3 objects with title and description). GM suggestions are proposals, not established campaign facts. Avoid generic fantasy tropes and purple prose.`;
export function validatePackage(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Gemini returned an invalid character package.");
  if (typeof data.story !== "string" || !data.story.trim()) throw new Error("Gemini omitted the character history.");
  for (const key of ["profile","relationships","secrets","hooks"]) {
    if (!data[key] || typeof data[key] !== "object") throw new Error(`Gemini omitted ${key}.`);
  }
  if (!Array.isArray(data.relationships) || !Array.isArray(data.secrets) || !Array.isArray(data.hooks)) throw new Error("Gemini returned malformed lists.");
  if (!data.physical || typeof data.physical !== "object" || Array.isArray(data.physical)) data.physical = {};
  return data;
}

/**
 * Limited markdown-to-HTML formatter for character prose.
 * All model-authored text is escaped before safe formatting tags are added.
 * We never accept raw HTML or make model-supplied links clickable.
 */
function formatInline(value) {
  return foundry.utils.escapeHTML(String(value ?? "")).replace(
    /\x60([^\x60\n]+)\x60|\*\*([^*\n]+)\*\*|__([^_\n]+)__|\*([^*\n]+)\*|(?<!\w)_([^_\n]+)_(?!\w)|\[([^\]\n]+)\]\([^)\n]+\)/g,
    (match, code, boldStar, boldUnderscore, italicStar, italicUnderscore, linkLabel) => {
      if (code !== undefined) return "<code>" + code + "</code>";
      if (boldStar !== undefined || boldUnderscore !== undefined) return "<strong>" + (boldStar ?? boldUnderscore) + "</strong>";
      if (italicStar !== undefined || italicUnderscore !== undefined) return "<em>" + (italicStar ?? italicUnderscore) + "</em>";
      if (linkLabel !== undefined) return linkLabel;
      return match;
    }
  );
}
export function richTextHtml(value) {
  const lines = String(value ?? "").replace(/\r\n?/g, "\n").split("\n");
  const result = [], paragraph = [], list = [], code = [];
  let listType = null, inCode = false;
  const flushParagraph = () => {
    if (!paragraph.length) return;
    result.push("<p>" + paragraph.map(formatInline).join("<br>") + "</p>");
    paragraph.length = 0;
  };
  const flushList = () => {
    if (!list.length) return;
    result.push("<" + listType + ">" +
      list.map(item => "<li>" + formatInline(item) + "</li>").join("") +
      "</" + listType + ">");
    list.length = 0; listType = null;
  };
  const flushCode = () => {
    result.push("<pre><code>" + foundry.utils.escapeHTML(code.join("\n")) + "</code></pre>");
    code.length = 0;
  };
  for (const line of lines) {
    if (/^\s*\x60{3}/.test(line)) {
      flushParagraph(); flushList();
      if (inCode) flushCode();
      inCode = !inCode; continue;
    }
    if (inCode) { code.push(line); continue; }
    if (!line.trim()) { flushParagraph(); flushList(); continue; }
    const heading = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      flushParagraph(); flushList();
      const level = Math.min(4, Math.max(3, heading[1].length + 2));
      result.push("<h" + level + ">" + formatInline(heading[2]) + "</h" + level + ">");
      continue;
    }
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flushParagraph(); flushList(); result.push("<hr>"); continue;
    }
    const bullet = /^\s*[-*+]\s+(.+)$/.exec(line);
    const number = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    if (bullet || number) {
      flushParagraph();
      const type = bullet ? "ul" : "ol";
      if (listType && listType !== type) flushList();
      listType = type; list.push((bullet || number)[1]); continue;
    }
    flushList();
    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (quote) {
      flushParagraph();
      result.push("<blockquote><p>" + formatInline(quote[1]) + "</p></blockquote>");
      continue;
    }
    paragraph.push(line);
  }
  flushParagraph(); flushList();
  if (inCode) flushCode();
  return result.join("\n");
}

export function biographyHtml(data) {
  const escape = value => foundry.utils.escapeHTML(String(value ?? ""));
  const section = (title, html) => '<section class="bf-bio-section"><h2>' + escape(title) + '</h2>' + html + '</section>';
  const profile = Object.entries(data.profile || {}).map(([key, value]) =>
    '<div class="bf-bio-field"><h3>' + escape(key) + '</h3>' +
    richTextHtml(Array.isArray(value) ? value.join(", ") : value) + '</div>'
  ).join("");
  const list = (items, format) => items.length
    ? "<ul>" + items.map(item => "<li>" + format(item) + "</li>").join("") + "</ul>"
    : "<p>None recorded.</p>";
  return [
    section("Character History", richTextHtml(data.story)),
    section("Roleplaying Profile", profile),
    section("Relationships", list(data.relationships || [], item =>
      "<strong>" + formatInline(item.name) + "</strong> (" +
      formatInline(item.connection) + "): " + formatInline(item.significance) + " — " + formatInline(item.status))),
    section("Secrets", list((data.secrets || []).filter(item => item.visibility !== "gm_suggestion"), item =>
      "<strong>" + formatInline(item.title) + "</strong>: " + richTextHtml(item.description))),
    section("Adventure Hooks", list(data.hooks || [], item =>
      "<strong>" + formatInline(item.title) + "</strong>: " + richTextHtml(item.description)))
  ].join("\n");
}
