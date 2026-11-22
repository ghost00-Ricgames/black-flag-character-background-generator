import { biographyHtml, validatePackage, richTextHtml } from "./interview.mjs";

export function parseDraft(text) {
  let data;
  try { data = JSON.parse(text); }
  catch { throw new Error("The edited draft is not valid JSON. Correct it in Edit mode before continuing."); }
  return validatePackage(data);
}

/** The main preview matches what Save writes; suggested appearance is separate. */
export function previewHtml(data) {
  const safe = validatePackage(data);
  let html = biographyHtml(safe);
  const physical = Object.entries(safe.physical || {}).filter(([,v]) => String(v ?? "").trim());
  if (physical.length) {
    html += '<section class="bf-bio-section bf-preview-unsaved">' +
      '<h2>Suggested physical details (review only)</h2>' +
      '<p class="hint">Physical details are not written to the character sheet when you save.</p>' +
      physical.map(([key, value]) =>
        '<div class="bf-bio-field"><h3>' + foundry.utils.escapeHTML(key) + '</h3>' +
        richTextHtml(value) + '</div>'
      ).join("") + '</section>';
  }
  return html;
}

export function createPackagePanel({ packageData, artworkNotice = "", onSave, onRegenerate, onError }) {
  const root = document.createElement("section");
  root.className = "bf-package-panel";
  const heading = document.createElement("h3");
  heading.textContent = "Generated Character Background";
  const tabs = document.createElement("div");
  tabs.className = "bf-package-view-tabs";
  const previewButton = document.createElement("button");
  previewButton.type = "button"; previewButton.textContent = "Readable Preview";
  const editButton = document.createElement("button");
  editButton.type = "button"; editButton.textContent = "Edit JSON";
  tabs.append(previewButton, editButton);
  const note = document.createElement("p");
  note.className = "hint";
  note.textContent = "Preview matches the saved biography, excluding GM-only suggestions.";
  const error = document.createElement("p");
  error.className = "bf-package-error";
  error.setAttribute("role", "alert");
  error.hidden = true;
  const preview = document.createElement("article");
  preview.className = "bf-package-preview";
  const editor = document.createElement("textarea");
  editor.className = "bf-json-editor"; editor.rows = 18;
  editor.setAttribute("aria-label", "Edit generated character background as JSON");
  editor.value = JSON.stringify(packageData, null, 2);
  editor.hidden = true;
  const direction = document.createElement("textarea");
  direction.rows = 2; direction.placeholder = "Optional: what should Gemini change?";
  direction.setAttribute("aria-label", "Regeneration instructions");
  const actions = document.createElement("div");
  actions.className = "bf-actions";
  const regenerate = document.createElement("button");
  regenerate.type = "button"; regenerate.textContent = "Regenerate with direction";
  const save = document.createElement("button");
  save.type = "button"; save.textContent = "Save approved background to biography";
  actions.append(regenerate, save);
  const notice = document.createElement("p");
  notice.className = "hint"; notice.textContent = artworkNotice; notice.hidden = !artworkNotice;
  root.append(heading, tabs, note, error, preview, editor, direction, actions, notice);

  function showError(err) {
    const message = err instanceof Error ? err.message : String(err);
    error.textContent = message; error.hidden = false;
    if (typeof onError === "function") onError(message);
  }
  function clearError() { error.textContent = ""; error.hidden = true; }
  function renderPreview() {
    const edited = parseDraft(editor.value);
    preview.innerHTML = previewHtml(edited);
    return edited;
  }
  function switchMode(mode) {
    if (mode === "preview") {
      try { renderPreview(); clearError(); }
      catch(err) {
        showError(err);
        editor.hidden = false; preview.hidden = true;
        editButton.disabled = true; previewButton.disabled = false;
        return false;
      }
    }
    preview.hidden = mode !== "preview"; editor.hidden = mode !== "edit";
    previewButton.disabled = mode === "preview"; editButton.disabled = mode === "edit";
    return true;
  }
  let working = false;
  async function run(action) {
    if (working) return;
    let edited;
    try { edited = parseDraft(editor.value); }
    catch (err) { showError(err); switchMode("edit"); return; }
    working = true;
    save.disabled = regenerate.disabled = true;
    clearError();
    try {
      if (action === "save") {
        await onSave(edited);
        switchMode("preview");
      } else {
        const revised = validatePackage(await onRegenerate({
          packageData: edited, direction: direction.value
        }));
        editor.value = JSON.stringify(revised, null, 2);
        direction.value = "";
        switchMode("preview");
      }
    } catch (err) { showError(err); }
    finally {
      working = false;
      save.disabled = regenerate.disabled = false;
    }
  }
  previewButton.addEventListener("click", () => switchMode("preview"));
  editButton.addEventListener("click", () => switchMode("edit"));
  save.addEventListener("click", () => void run("save"));
  regenerate.addEventListener("click", () => void run("regenerate"));
  switchMode("preview");
  return root;
}
