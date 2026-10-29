import { GeminiService } from "./gemini.mjs";
import { actorFacts } from "./character-data.mjs";
import { MODULE_ID as ID, QUESTION_INSTRUCTION, PACKAGE_INSTRUCTION, validatePackage, biographyHtml } from "./interview.mjs";

const SETTINGS = {
  apiKey: { name: "Gemini API Key", hint: "Only trusted GMs should configure this. Stored in Foundry world settings, not a server-side vault.", type: String, default: "", config: true, scope: "world", restricted: true },
  model: { name: "Gemini Model", hint: "Enter a compatible generateContent model ID.", type: String, default: "gemini-2.5-flash", config: true, scope: "world", restricted: true },
  campaignContext: { name: "Player-safe Campaign Context", hint: "Only lore that players are allowed to see.", type: String, default: "", config: true, scope: "world", restricted: true },
  requireApproval: { name: "Require GM Approval for Player Saves", type: Boolean, default: false, config: true, scope: "world", restricted: true },
  maxRequests: { name: "Maximum AI Requests per Player per Session", hint: "Enforced by the active GM client; resets when that GM reloads.", type: Number, default: 30, config: true, scope: "world", restricted: true }
};
const escape = value => foundry.utils.escapeHTML(String(value ?? ""));
const pending = new Map(), usage = new Map();
const SOCKET = `module.${ID}`;
const randomId = () => foundry.utils.randomID();
const onlineGM = () => game.users.filter(u => u.active && u.isGM).sort((a,b) => a.id.localeCompare(b.id))[0];
const own = (actor, user) => !!actor && (user.isGM || actor.testUserPermission(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER));
const actorById = id => game.actors.get(id);
function sendRequest(action, actorId, payload = {}) {
  const gm = onlineGM();
  if (!gm) throw new Error("A GM must be online to use Gemini.");
  if (game.user.isGM && gm.id === game.user.id) return runAI(action, actorId, payload);
  const requestId = randomId();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(requestId); reject(new Error("GM request timed out.")); }, 90000);
    pending.set(requestId, { resolve, reject, timer });
    game.socket.emit(SOCKET, { type: "request", requestId, gmId: gm.id, actorId, action, payload });
  });
}
async function runAI(action, actorId, payload, requester = game.user) {
  const actor = actorById(actorId);
  if (!own(actor, requester) || actor.type !== "pc") throw new Error("Character ownership required.");
  if (!["question","package","models","save"].includes(action)) throw new Error("Unsupported action.");
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
    // Only write the biography field after approval; preserve all other actor data.
    const path = actor.system?.biography?.backstory !== undefined ? "system.biography.backstory" :
      actor.system?.details?.biography !== undefined ? "system.details.biography.value" :
      actor.system?.biography !== undefined ? "system.biography.value" : null;
    if (!path) throw new Error("Could not identify the Black Flag biography field. Nothing was saved.");
    await actor.update({ [path]: biographyHtml(data) });
    return { saved: true };
  }
  const key = game.settings.get(ID,"apiKey");
  if (!key) throw new Error("GM has not configured a Gemini API key.");
  if (action === "models") return GeminiService.models(key);
  const model = game.settings.get(ID,"model");
  const context = game.settings.get(ID,"campaignContext");
  const instruction = action === "question" ? QUESTION_INSTRUCTION : PACKAGE_INSTRUCTION;
  const result = await GeminiService.request({ key, model, instruction,
    payload: { character: { ...actorFacts(actor), ...payload.questionnaire, classes: payload.questionnaire?.classes ?? actorFacts(actor).classes }, questionnaire: payload.questionnaire, answers: payload.answers, campaignContext: context, direction: payload.direction || "" }
  });
  if (action === "package") return validatePackage(result);
  if (typeof result?.question !== "string" || !result.question.trim()) throw new Error("Gemini did not return a question.");
  return { question: result.question, suggestions: Array.isArray(result.suggestions) ? result.suggestions.slice(0,3).map(String) : [] };
}
async function onSocket(message, senderId) {
  if (!message || typeof message !== "object") return;
  if (message.type === "response" && message.recipientId === game.user.id) {
    const entry = pending.get(message.requestId);
    if (!entry || message.gmId !== onlineGM()?.id) return;
    clearTimeout(entry.timer); pending.delete(message.requestId);
    if (message.error) entry.reject(new Error(message.error)); else entry.resolve(message.result);
    return;
  }
  if (message.type !== "request" || !game.user.isGM || onlineGM()?.id !== game.user.id || message.gmId !== game.user.id) return;
  const requester = game.users.get(senderId);
  if (!requester || !requester.active) return;
  const actor = actorById(message.actorId);
  if (!own(actor, requester) || actor?.type !== "pc") return;
  const used = usage.get(requester.id) || 0;
  const limit = Math.max(1, Number(game.settings.get(ID,"maxRequests")) || 30);
  if (used >= limit && message.action !== "save") {
    game.socket.emit(SOCKET, { type:"response", gmId:game.user.id, recipientId:requester.id, requestId:message.requestId, error:"AI request limit reached." });
    return;
  }
  if (message.action !== "save") usage.set(requester.id, used + 1);
  try {
    const result = await runAI(message.action, message.actorId, message.payload || {}, requester);
    game.socket.emit(SOCKET, { type:"response", gmId:game.user.id, recipientId:requester.id, requestId:message.requestId, result });
  } catch(error) {
    game.socket.emit(SOCKET, { type:"response", gmId:game.user.id, recipientId:requester.id, requestId:message.requestId, error:error.message });
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
    root.innerHTML=`<form>
      <h2>${escape(this.facts.name)}</h2>
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
        output.textContent="Answer the follow-up, then ask another or generate your package.";
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
        output.append(heading,editor,direction,revise,save);
      }
    } catch(error) { output.textContent=error.message; }
    finally { this.busy=false; for(const button of form.querySelectorAll("button")) button.disabled=false; }
  }
}
function openGenerator(actor) {
  if (!actor || actor.type!=="pc") return ui.notifications.warn("Select a character actor.");
  if (!own(actor,game.user)) return ui.notifications.warn("You do not own this character.");
  return new BackgroundGeneratorApp(actor).render(true);
}
Hooks.once("init",()=>{for(const [key,setting] of Object.entries(SETTINGS))game.settings.register(ID,key,setting);});
Hooks.once("ready",()=>{game.socket.on(SOCKET,onSocket);});
Hooks.on("renderActorSheetV2",(app,element)=>{
  const actor=app.actor??app.document;
  if(actor?.type!=="pc"||!own(actor,game.user))return;
  const host=element instanceof HTMLElement?element:(element?.[0] ?? app.element);
  if(!host||host.querySelector("[data-bf-background-open]"))return;
  const header=host.querySelector(".window-header");
  if(!header)return;
  const button=document.createElement("button");button.type="button";button.className="header-control";
  button.dataset.bfBackgroundOpen="";button.title="Generate character background";button.setAttribute("aria-label",button.title);
  button.innerHTML='<i class="fas fa-book-open"></i>';
  button.addEventListener("click",()=>openGenerator(actor));header.append(button);
});
globalThis.BlackFlagCharacterBackgroundGenerator={openGenerator,actorFacts,GeminiService};

// Black Flag uses the PC actor type and its own ApplicationV2 sheet implementation.
Hooks.on("renderPCSheet", (app, element) => {
  const actor = app.actor ?? app.document;
  if (actor?.type !== "pc" || !own(actor,game.user)) return;
  const host = element instanceof HTMLElement ? element : (element?.[0] ?? app.element);
  if (!host || host.querySelector("[data-bf-background-open]")) return;
  const header = host.querySelector(".window-header");
  if (!header) return;
  const button = document.createElement("button");
  button.type = "button"; button.className = "header-control";
  button.dataset.bfBackgroundOpen = ""; button.title = "Generate character background";
  button.innerHTML = '<i class="fas fa-book-open"></i>';
  button.addEventListener("click", () => openGenerator(actor));
  header.append(button);
});
Hooks.once("ready", () => {
  game.keybindings.register(ID, "openGenerator", {
    name: "Open Character Background Generator",
    hint: "Opens the generator for the first owned PC selected in the Actors directory or on the canvas.",
    editable: [{key: "KeyB", modifiers: ["CTRL","SHIFT"]}],
    onDown: () => {
      const actor = canvas?.tokens?.controlled?.find(t => t.actor?.type === "pc")?.actor
        ?? game.actors.find(a => a.type === "pc" && own(a,game.user));
      openGenerator(actor); return true;
    }, restricted: false, precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL
  });
});
