import { GeminiService } from "./gemini.mjs";
import { actorFacts } from "./character-data.mjs";
const ID = "black-flag-character-background-generator";
const SETTINGS = {
  apiKey: { name: "Gemini API Key", hint: "For trusted GM browsers only. Never place this key in player-safe context.", type: String, default: "", config: true, scope: "world", restricted: true },
  model: { name: "Gemini Model ID", hint: "Enter a generateContent-compatible Gemini model ID.", type: String, default: "gemini-2.5-flash", config: true, scope: "world", restricted: true },
  campaignContext: { name: "Player-safe Campaign Context", hint: "Lore approved for players; never put GM secrets here.", type: String, default: "", config: true, scope: "world", restricted: true },
  requireApproval: { name: "Require GM Approval Before Saving", type: Boolean, default: false, config: true, scope: "world", restricted: true }
};
Hooks.once("init", () => { for (const [key, settings] of Object.entries(SETTINGS)) game.settings.register(ID, key, settings); });
const escape = value => foundry.utils.escapeHTML(String(value ?? ""));
const FIELDS = ["lineage", "heritage", "background", "class"];
const PROMPT = "Write an original, playable Tales of the Valiant character background. Treat character facts and player answers as fixed. Invent creative supporting people, places and events without altering mechanics or declaring invented campaign lore canonical. Return JSON keys story (string), profile (object), relationships (array), secrets (array), hooks (array). These are draft proposals subject to player and GM review.";
class BackgroundGeneratorApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "bf-character-background-generator",
    classes: ["bf-character-background-app"],
    window: { title: "Character Background Generator", icon: "fas fa-book-open", resizable: true },
    position: { width: 650, height: 760 }
  };
  constructor(actor, options = {}) { super(options); this.actor = actor; this.facts = actorFacts(actor); this.result = null; this.busy = false; }
  async _renderHTML() {
    const root = document.createElement("section");
    root.className = "bf-background-form";
    root.innerHTML = `<form>
      <p><strong>${escape(this.facts.name)}</strong> — Review the imported Black Flag character data before generating.</p>
      ${FIELDS.map(k => `<label>${escape(k)}<input name="${k}" value="${escape(this.facts[k])}"></label>`).join("")}
      <label>Level<input name="level" value="${escape(this.facts.level)}"></label>
      <label>Character concept<textarea name="concept" rows="2"></textarea></label>
      <label>Formative experience<textarea name="formative" rows="2"></textarea></label>
      <label>Important relationship<textarea name="relationship" rows="2"></textarea></label>
      <label>Reason to adventure<textarea name="motivation" rows="2"></textarea></label>
      <label>Gemini model<input name="model" value="${escape(game.settings.get(ID,"model"))}"></label>
      <div class="bf-actions"><button type="button" data-action="models">Find available models</button><button type="submit">Generate draft</button></div>
      <p class="hint">Prototype: GM-side generation only. Adaptive interview, player routing, review and saving are pending.</p>
      <div class="bf-result" role="status" aria-live="polite"></div>
    </form>`;
    return root;
  }
  _replaceHTML(result, content) { content.replaceChildren(result); }
  _onRender(context, options) {
    super._onRender(context, options);
    const form = this.element.querySelector("form");
    form?.addEventListener("submit", event => { event.preventDefault(); void this.generate(form); });
    form?.querySelector('[data-action="models"]')?.addEventListener("click", () => void this.showModels(form));
  }
  async showModels(form) {
    const output = form.querySelector(".bf-result");
    try {
      const models = await GeminiService.models(game.settings.get(ID,"apiKey"));
      output.textContent = "Available models: " + models.join(", ");
    } catch(error) { output.textContent = error.message; }
  }
  async generate(form) {
    if (this.busy) return;
    const output = form.querySelector(".bf-result");
    const fields = Object.fromEntries(new FormData(form).entries());
    this.busy = true;
    const submit = form.querySelector('[type="submit"]'); submit.disabled = true;
    output.textContent = "Generating character draft…";
    try {
      const { model, ...answers } = fields;
      const result = await GeminiService.request({
        key: game.settings.get(ID,"apiKey"), model, instruction: PROMPT,
        payload: { character: { ...this.facts, ...answers }, campaignContext: game.settings.get(ID,"campaignContext") }
      });
      this.result = result;
      const pre = document.createElement("pre"); pre.textContent = JSON.stringify(result,null,2);
      output.replaceChildren(pre);
    } catch(error) { output.textContent = error.message; }
    finally { this.busy = false; submit.disabled = false; }
  }
}
function openGenerator(actor) {
  if (!actor || actor.type !== "character") return ui.notifications.warn("Select a character actor.");
  if (!actor.isOwner && !game.user.isGM) return ui.notifications.warn("You cannot access this character.");
  if (!game.user.isGM) return ui.notifications.warn("Player requests are not yet implemented; ask your GM to open the generator.");
  return new BackgroundGeneratorApp(actor).render(true);
}
// V14 actor sheet integration: inject an action on the rendered sheet rather than relying on legacy header-button hooks.
Hooks.on("renderActorSheetV2", (app, element) => {
  const actor = app.actor ?? app.document;
  if (actor?.type !== "character" || (!actor.isOwner && !game.user.isGM)) return;
  const host = element instanceof HTMLElement ? element : element?.[0];
  if (!host || host.querySelector("[data-bf-background-open]")) return;
  const header = host.querySelector(".window-header .window-title")?.parentElement;
  if (!header) return;
  const button = document.createElement("button");
  button.type = "button"; button.className = "header-control"; button.dataset.bfBackgroundOpen = "";
  button.title = "Open Character Background Generator"; button.setAttribute("aria-label", button.title);
  button.innerHTML = '<i class="fas fa-book-open"></i>';
  button.addEventListener("click", () => openGenerator(actor));
  header.append(button);
});
globalThis.BlackFlagCharacterBackgroundGenerator = { openGenerator, actorFacts, GeminiService };
