import { GeminiService } from "./gemini.mjs";
import { actorFacts } from "./character-data.mjs";
import { hasCustomArtwork, prepareArtwork } from "./artwork.mjs";
import { MODULE_ID as ID, QUESTION_INSTRUCTION, PACKAGE_INSTRUCTION, validatePackage, biographyHtml } from "./interview.mjs";

const SETTINGS = {
  apiKey: { name: "Gemini API Key", hint: "Set this on the GM browser only. This key is stored in client settings, not world settings.", type: String, default: "", config: true, scope: "client", restricted: true },
  model: { name: "Gemini Model", hint: "Interactions API model ID (default: gemini-3.8-flash). Existing 2.5 Flash settings automatically upgrade.", type: String, default: "gemini-3.8-flash", config: true, scope: "world", restricted: true },
  fallbackModel: { name: "Fallback Gemini Model (when overloaded)", hint: "Only used after the primary model returns HTTP 503. Default: gemini-3.6-flash. Leave blank to disable automatic fallback.", type: String, default: "gemini-3.6-flash", config: true, scope: "world", restricted: true },
  campaignContext: { name: "Player-safe Campaign Context", hint: "Only lore that players are allowed to see.", type: String, default: "", config: true, scope: "world", restricted: true },
  requireApproval: { name: "Require GM Approval for Player Saves", type: Boolean, default: false, config: true, scope: "world", restricted: true },
  maxRequests: { name: "Maximum AI Requests per Player per Session", hint: "Enforced by the active GM client; resets when that GM reloads.", type: Number, default: 30, config: true, scope: "world", restricted: true }
};
const escape = value => foundry.utils.escapeHTML(String(value ?? ""));
const pending = new Map(), usage = new Map();
const SOCKET = `module.${ID}`;
const RESPONSE_QUERY = `${ID}.receiveResponse`;
const randomId = () => foundry.utils.randomID();
const onlineGM = () => game.users.filter(u => u.active && u.isGM).sort((a,b) => a.id.localeCompare(b.id))[0];
const own = (actor, user) => !!actor && !!user && (user.isGM || actor.testUserPermission(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER));
const actorById = id => game.actors.get(id);
const ACTIONS = new Set(["question", "package", "save"]);

async function sendRequest(action, actorId, payload = {}) {
  const gm = onlineGM();
  if (!gm) throw new Error("A GM must be online to use Gemini.");
  if (!ACTIONS.has(action)) throw new Error("Unsupported generator action.");
  if (gm.id === game.user.id) return runAI(action, actorId, payload, game.user);
  const requestId = randomId();
  // Previous 90s player timeout was shorter than a single 150s package call.
  // Allow one primary retry and an overloaded-model fallback to complete.
  const responseDeadline = action === "package" ? 360000
    : action === "question" ? 210000 : 90000;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error("The GM did not respond before the request deadline."));
    }, responseDeadline);
    pending.set(requestId, { resolve, reject, timer, gmId: gm.id });
    // Foundry server supplies the authenticated sender ID to the receiving handler.
    // Do not include or trust a client-supplied requester ID.
    game.socket.emit(SOCKET, { type: "request", requestId, gmId: gm.id, actorId, action, payload });
  });
}
async function runAI(action, actorId, payload, requester = game.user) {
  const actor = actorById(actorId);
  if (!own(actor, requester) || actor?.type !== "pc") throw new Error("PC ownership required.");
  if (!ACTIONS.has(action)) throw new Error("Unsupported action.");
  if (action === "save") {
    if (!payload?.package) throw new Error("No package supplied.");
    const data = validatePackage(payload.package);
    if (!requester.isGM && game.settings.get(ID,"requireApproval")) {
      const approved = await foundry.applications.api.DialogV2.confirm({
        window: { title: "Approve Character Background" },
        content: `<p>Allow ${escape(requester.name)} to save a generated background to ${escape(actor.name)}?</p><p>The biography will be replaced.</p>`,
        modal: true
      });
      if (!approved) throw new Error("GM declined the save request.");
    }
    await actor.update({ "system.biography.backstory": biographyHtml(data) });
    return { saved: true };
  }
  // Never transmit or return the GM's client-local Gemini key.
  const key = game.settings.get(ID,"apiKey");
  if (!key) throw new Error("The GM must configure a Gemini API key in this browser.");
  const configuredModel = String(game.settings.get(ID,"model") ?? "").trim();
  // Existing worlds persist their old 2.5 default even when the registered default changes.
  const model = !configuredModel || configuredModel === "gemini-2.5-flash"
    ? "gemini-3.8-flash" : configuredModel;
  const fallbackModel = String(game.settings.get(ID,"fallbackModel") ?? "").trim();
  const context = game.settings.get(ID,"campaignContext");
  const instruction = action === "question" ? QUESTION_INSTRUCTION : PACKAGE_INSTRUCTION;
  const canonical = actorFacts(actor);
  const submitted = payload?.questionnaire ?? {};
  const { useArtwork, ...questionnaireFacts } = submitted;
  const character = { ...canonical, ...questionnaireFacts, name: canonical.name, classes: submitted.classes ?? canonical.classes };
  // Select and decode ONLY the GM's authoritative actor portrait.
  // The player sends an opt-in boolean, never an image URL or image bytes.
  const artwork = useArtwork === true
    ? await prepareArtwork(actor.img) : {image:null,reason:"disabled"};
  const result = await GeminiService.request({
    key, model, fallbackModel, instruction, kind: action, image: artwork.image,
    onStatus: message => ui.notifications.info(message),
    payload: { character, questionnaire: submitted, answers: payload?.answers ?? [], campaignContext: context, direction: payload?.direction || "" }
  });
  if (artwork.reason === "unavailable") {
    result.artworkNotice = "The portrait could not be read; Gemini continued with text only.";
  }
  if (action === "package") return validatePackage(result);
  if (typeof result?.question !== "string" || !result.question.trim()) throw new Error("Gemini did not return a question.");
  return { question: result.question, suggestions: Array.isArray(result.suggestions) ? result.suggestions.slice(0,3).map(String) : [], artworkNotice: result.artworkNotice || "" };
}
// Query responses are targeted to the requesting User rather than broadcast.
// A response may update only a pending client promise, never a document.
function receiveResponse(message) {
  if (!message || typeof message !== "object") return false;
  const entry = pending.get(message.requestId);
  if (!entry || entry.gmId !== message.gmId || onlineGM()?.id !== entry.gmId) return false;
  clearTimeout(entry.timer);
  pending.delete(message.requestId);
  if (message.error) entry.reject(new Error(String(message.error)));
  else entry.resolve(message.result);
  return true;
}
async function onSocket(message, senderId) {
  if (message?.type !== "request" || !game.user.isGM || onlineGM()?.id !== game.user.id || message.gmId !== game.user.id) return;
  // The second argument is attached by Foundry's server, not taken from the packet.
  const requester = typeof senderId === "string" ? game.users.get(senderId) : null;
  if (!requester?.active) return;
  if (typeof message.requestId !== "string" || !/^[A-Za-z0-9]{8,64}$/.test(message.requestId)) return;
  if (!ACTIONS.has(message.action)) return;
  let result, error;
  try {
    if (JSON.stringify(message.payload ?? {}).length > 60000) throw new Error("Generator request is too large.");
    const actor = actorById(message.actorId);
    if (!own(actor, requester) || actor?.type !== "pc") throw new Error("PC ownership required.");
    const used = usage.get(requester.id) ?? 0;
    const limit = Math.max(1, Number(game.settings.get(ID,"maxRequests")) || 30);
    if (used >= limit && message.action !== "save") throw new Error("AI request limit reached.");
    if (message.action !== "save") usage.set(requester.id, used+1);
    result = await runAI(message.action, message.actorId, message.payload || {}, requester);
  } catch (err) {
    error = err instanceof Error ? err.message : "The GM could not complete this request.";
  }
  try {
    await requester.query(RESPONSE_QUERY, { requestId: message.requestId, gmId: game.user.id, result, error }, { timeout: 30000 });
  } catch (err) {
    console.warn(`[${ID}] Could not return response to ${requester.name}`, err);
  }
}
class BackgroundGeneratorApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "bf-character-background-generator",
    classes: ["bf-character-background-app"],
    window: { title: "Character Background Generator", icon: "fas fa-book-open", resizable: true },
    position: { width: 700, height: 780 }
  };
  constructor(actor, options={}) { super(options); this.actor=actor; this.facts=actorFacts(actor); this.questionnaire=null; this.answers=[]; this.package=null; this.question=null; this.busy=false; }
  async _renderHTML() {
    const root=document.createElement("section"); root.className="bf-background-form";
    const fields=["lineage","heritage","background"];
    const customArtwork = hasCustomArtwork(this.actor.img);
    root.innerHTML=`<form>
      <h2>${escape(this.facts.name)}</h2>
      <section class="bf-artwork-option" aria-label="Character portrait analysis">
        ${customArtwork
          ? `<img class="bf-portrait-preview" src="${escape(this.actor.img)}" alt="Portrait of ${escape(this.facts.name)}" loading="lazy">
             <label class="bf-artwork-toggle"><input type="checkbox" name="useArtwork" checked>
               Use this character portrait to inspire the background</label>
             <p class="hint">Visible details are suggestions, not changes to character facts. To change this image, update the portrait on the character sheet.</p>`
          : `<p class="hint">Default or missing character portrait detected. Artwork analysis will be skipped; Gemini will use character details and answers only.</p>`}
      </section>
      <p>Review imported details and answer the starting questions.</p>
      ${fields.map(k=>`<label>${escape(k)}<input name="${k}" value="${escape(this.facts[k])}"></label>`).join("")}
      <label>Classes, individual levels, and subclasses<textarea name="classDetails" rows="4">${escape(this.facts.classes.length ? this.facts.classes.map(c => [c.name,c.level ?? "",c.subclass].join(" | ")).join("\n") : this.facts.class)}</textarea></label>\n      <p class="hint">One class per line: Class | Level | Subclass. Leave unknown values blank. Verify imported values against your character sheet.${this.facts.subclassNotes ? " Unmatched subclasses: "+escape(this.facts.subclassNotes) : ""}</p>\n      <label>Total character level<input name="level" value="${escape(this.facts.level)}"></label>
      <label>Talents (one per line)<textarea name="talents" rows="3">${escape(this.facts.talents.join("\n"))}</textarea></label>
      <label>Skill proficiencies (one per line)<textarea name="skills" rows="3">${escape(this.facts.skillProficiencies.join("\n"))}</textarea></label>
      <label>Tool proficiencies (one per line)<textarea name="tools" rows="3">${escape(this.facts.toolProficiencies.join("\n"))}</textarea></label>
      ${["age","height","weight","eyes","skin","hair"].map(k=>`<label>${escape(k)}<input name="physical_${k}" value="${escape(this.facts.physical[k])}" placeholder="Optional — Gemini may suggest"></label>`).join("")}
      <label>Character concept<textarea name="concept" rows="2"></textarea></label>
      <label>Formative experience<textarea name="formative" rows="2"></textarea></label>
      <label>Important relationship<textarea name="relationship" rows="2"></textarea></label>
      <label>Reason to adventure<textarea name="motivation" rows="2"></textarea></label>
      <div class="bf-actions"><button type="button" data-action="question">Ask follow-up</button><button type="button" data-action="generate">Generate package</button></div>
      <div class="bf-interview" aria-live="polite"></div>
      <div class="bf-result" aria-live="polite"></div>
      <p class="hint">Review all invented lore with your GM before treating it as campaign canon. GM-only suggestions are not saved to player biography.</p>
    </form>`;
    return root;
  }
  _replaceHTML(result, content) { content.replaceChildren(result); }
  _onRender(context, options) {
    super._onRender(context, options);
    const form=this.element.querySelector("form");
    form?.addEventListener("submit",event=>event.preventDefault());
    for (const action of ["question","generate"]) form?.querySelector(`[data-action="${action}"]`)?.addEventListener("click",()=>void this.execute(action,form));
  }
  collect(form) {
    const data=Object.fromEntries(new FormData(form).entries());
    data.useArtwork = hasCustomArtwork(this.actor.img) && data.useArtwork === "on";
    for (const key of ["lineage","heritage","background","level"]) this.facts[key]=data[key];
    this.facts.classes = String(data.classDetails ?? "").split(/\r?\n/).filter(line => line.trim()).map(line => { const [name,level,subclass] = line.split("|").map(v => v.trim()); return {name,level:level || null,subclass:subclass || ""}; });
    this.facts.class = this.facts.classes.map(c => [c.name,c.level,c.subclass && `(${c.subclass})`].filter(Boolean).join(" ")).join(" / ");
    data.classes = this.facts.classes;
    this.facts.talents = String(data.talents ?? "").split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    this.facts.skillProficiencies = String(data.skills ?? "").split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    this.facts.toolProficiencies = String(data.tools ?? "").split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    this.facts.physical = Object.fromEntries(["age","height","weight","eyes","skin","hair"].map(k=>[k,data[`physical_${k}`] ?? ""]));
    data.talents = this.facts.talents; data.skillProficiencies = this.facts.skillProficiencies; data.toolProficiencies = this.facts.toolProficiencies; data.physical = this.facts.physical;
    return data;
  }
  async execute(action,form) {
    if (this.busy) return;
    const output=form.querySelector(".bf-result"), interview=form.querySelector(".bf-interview");
    const questionnaire=this.collect(form);
    this.busy=true;
    for (const button of form.querySelectorAll("button")) button.disabled=true;
    output.textContent=action==="question" ? "Asking Gemini…" : "Generating character package…";
    try {
      const currentAnswer = this.question ? {question:this.question,answer:interview.querySelector("[data-answer]")?.value || ""} : null;
      const answerHistory = currentAnswer ? [...this.answers,currentAnswer] : [...this.answers];
      const result=await sendRequest(action==="question"?"question":"package",this.actor.id,{questionnaire,answers:answerHistory});
      if (action==="question") {
        if (this.question) {
          const previous=interview.querySelector("[data-answer]");
          this.answers.push({question:this.question,answer:previous?.value || ""});
        }
        this.question=result.question;
        interview.replaceChildren();
        const label=document.createElement("label"); label.textContent=result.question;
        const textarea=document.createElement("textarea"); textarea.dataset.answer=""; textarea.rows=3;
        label.append(textarea); interview.append(label);
        if (result.suggestions?.length) {
          const hint=document.createElement("p"); hint.className="hint"; hint.textContent="Ideas: "+result.suggestions.join(" | "); interview.append(hint);
        }
        output.textContent="Answer the follow-up, then ask another or generate your package."
          + (result.artworkNotice ? "\n" + result.artworkNotice : "");
      } else {
        if (this.question) {
          this.answers.push({question:this.question,answer:interview.querySelector("[data-answer]")?.value || ""});
          this.question=null; interview.replaceChildren();
        }
        this.package=result;
        output.replaceChildren();
        const heading=document.createElement("h3"); heading.textContent="Editable character package";
        const editor=document.createElement("textarea"); editor.className="bf-json-editor"; editor.rows=18; editor.value=JSON.stringify(result,null,2);
        const save=document.createElement("button"); save.type="button"; save.textContent="Save approved package to biography";
        const revise=document.createElement("button"); revise.type="button"; revise.textContent="Regenerate with direction";
        const direction=document.createElement("textarea"); direction.rows=2; direction.placeholder="What should Gemini change?";
        save.addEventListener("click",async()=>{
          try { const parsed=JSON.parse(editor.value); await sendRequest("save",this.actor.id,{package:parsed}); ui.notifications.info("Character biography saved."); }
          catch(error){ui.notifications.error(error.message);}
        });
        revise.addEventListener("click",async()=>{
          if(this.busy)return;
          this.busy=true; revise.disabled=true;
          try {
            const revised=await sendRequest("package",this.actor.id,{questionnaire,answers:this.answers,direction:direction.value+"\nPrevious draft: "+editor.value});
            editor.value=JSON.stringify(revised,null,2); this.package=revised;
          }catch(error){ui.notifications.error(error.message);}
          finally{this.busy=false;revise.disabled=false;}
        });
        if (result.artworkNotice) {
          const notice = document.createElement("p");
          notice.className = "hint";
          notice.textContent = result.artworkNotice;
          output.append(notice);
        }
        output.append(heading,editor,direction,revise,save);
      }
    } catch(error) { output.textContent=error.message; }
    finally { this.busy=false; for(const button of form.querySelectorAll("button")) button.disabled=false; }
  }
}
function openGenerator(actor) {
  if (!actor || actor.type !== "pc") return ui.notifications.warn("Choose a Black Flag PC actor.");
  if (!own(actor, game.user)) return ui.notifications.warn("You do not own this PC.");
  return new BackgroundGeneratorApp(actor).render({force: true});
}

Hooks.once("init", () => {
  for (const [key, setting] of Object.entries(SETTINGS)) game.settings.register(ID, key, setting);
  CONFIG.queries[RESPONSE_QUERY] = receiveResponse;
  game.keybindings.register(ID, "openGenerator", {
    name: "Open Character Background Generator",
    hint: "Open for a controlled PC token, or the first PC you own.",
    editable: [{ key: "KeyB", modifiers: [foundry.helpers.interaction.KeyboardManager.MODIFIER_KEYS.CONTROL, foundry.helpers.interaction.KeyboardManager.MODIFIER_KEYS.SHIFT] }],
    onDown: () => {
      const actor = canvas?.tokens?.controlled?.find(t => t.actor?.type === "pc" && own(t.actor, game.user))?.actor
        ?? game.actors.find(a => a.type === "pc" && own(a, game.user));
      void openGenerator(actor);
      return true;
    },
    restricted: false,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL
  });
});
Hooks.once("ready", () => {
  game.socket.on(SOCKET, onSocket);
  // Show the new model in Module Settings, not just in API requests.
  // Only the designated active GM migrates the former world-scoped default.
  if (game.user.isGM && onlineGM()?.id === game.user.id &&
      game.settings.get(ID,"model") === "gemini-2.5-flash") {
    void game.settings.set(ID, "model", "gemini-3.8-flash")
      .catch(error => console.warn("[" + ID + "] Could not migrate Gemini model setting", error));
  }
});
// Official ApplicationV2 header-control hook works with Black Flag's PCSheet
// via its ActorSheetV2 inheritance; no fragile .window-header DOM manipulation.
Hooks.on("getHeaderControlsApplicationV2", (app, controls) => {
  if (!(app instanceof foundry.applications.sheets.ActorSheetV2)) return;
  const actor = app.actor ?? app.document;
  if (actor?.type !== "pc" || !own(actor, game.user)) return;
  controls.push({
    action: "bf-character-background",
    label: "Generate Character Background",
    icon: "fas fa-book-open",
    onClick: () => { void openGenerator(actor); },
    ownership: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
  });
});
globalThis.BlackFlagCharacterBackgroundGenerator = { openGenerator, actorFacts };
