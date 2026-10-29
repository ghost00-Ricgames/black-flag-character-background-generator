import { GeminiService } from "./gemini.mjs";
const ID = "black-flag-character-background-generator";
const SETTINGS = {
  apiKey: { name: "Gemini API Key", hint: "GM-side only. Do not share your GM account or API key.", type: String, default: "", config: true, scope: "world", restricted: true },
  model: { name: "Gemini Model ID", hint: "Choose a generateContent-compatible model. Model discovery is available in the generator.", type: String, default: "gemini-2.5-flash", config: true, scope: "world", restricted: true },
  campaignContext: { name: "Player-safe Campaign Context", hint: "Only include lore players are permitted to read.", type: String, default: "", config: true, scope: "world", restricted: true },
  requireApproval: { name: "Require GM Approval Before Saving", type: Boolean, default: false, config: true, scope: "world", restricted: true }
};
Hooks.once("init", () => {
  for (const [name, options] of Object.entries(SETTINGS)) game.settings.register(ID, name, options);
});
function actorFacts(actor) {
  const sys = actor.system || {};
  const plain = value => typeof value === "string" ? value : (value?.name || value?.value || "");
  return { name: actor.name, type: actor.type, lineage: plain(sys.lineage), heritage: plain(sys.heritage), background: plain(sys.background), class: plain(sys.class), level: sys.details?.level ?? sys.level ?? null };
}
function generatorHtml(facts) {
  const esc = foundry.utils.escapeHTML;
  return `<form class="bf-background-form">
    <p><strong>${esc(facts.name)}</strong> — Verify the imported details; Foundry system fields vary.</p>
    ${["lineage","heritage","background","class"].map(k => `<label>${k}<input name="${k}" value="${esc(String(facts[k] || ""))}"></label>`).join("")}
    <label>Character concept<textarea name="concept" rows="2"></textarea></label>
    <label>Formative experience<textarea name="formative" rows="2"></textarea></label>
    <label>Important relationship<textarea name="relationship" rows="2"></textarea></label>
    <label>Reason to adventure<textarea name="motivation" rows="2"></textarea></label>
    <label>Gemini model <input name="model" value="${esc(game.settings.get(ID,"model"))}"></label>
    <p class="hint">AI generation is GM-only in this scaffold; player routing and approval are not yet implemented.</p>
    <button type="submit">Generate character package</button>
    <div class="bf-result" aria-live="polite"></div>
  </form>`;
}
async function openGenerator(actor) {
  if (!game.user.isGM) return ui.notifications.warn("Player requests require the GM-mediated workflow, not yet implemented.");
  const facts = actorFacts(actor);
  const content = generatorHtml(facts);
  const dialog = new Dialog({
    title: "Character Background Generator — Prototype",
    content,
    buttons: { close: { label: "Close" } },
    render: html => {
      const form = html.find("form")[0];
      form.addEventListener("submit", async event => {
        event.preventDefault();
        const output = form.querySelector(".bf-result");
        const fields = Object.fromEntries(new FormData(form).entries());
        output.textContent = "Generating…";
        try {
          const result = await GeminiService.request({
            key: game.settings.get(ID, "apiKey"), model: fields.model,
            instruction: "You create grounded, original Tales of the Valiant character backgrounds. Treat character facts and player answers as authoritative. You may invent supporting characters, locations and events, but never invent mechanical abilities or assert invented campaign lore as canon. Respond as JSON with keys story (string), profile (object), relationships (array), secrets (array), hooks (array). This is a proposed draft requiring player and GM review.",
            payload: { character: { ...facts, ...fields }, campaignContext: game.settings.get(ID,"campaignContext") }
          });
          output.replaceChildren();
          const pre = document.createElement("pre");
          pre.textContent = JSON.stringify(result, null, 2);
          output.append(pre);
        } catch (error) { output.textContent = error.message; }
      });
    }
  }, { width: 620, height: "auto", resizable: true });
  dialog.render(true);
}
Hooks.on("getActorSheetHeaderButtons", (sheet, buttons) => {
  if (sheet.actor?.type !== "character" || !sheet.actor.isOwner) return;
  buttons.unshift({ label: "Background Generator", class: "bf-character-background", icon: "fas fa-book-open", onclick: () => openGenerator(sheet.actor) });
});
globalThis.BlackFlagCharacterBackgroundGenerator = { openGenerator, actorFacts, GeminiService };
