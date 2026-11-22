import test from "node:test";
import assert from "node:assert/strict";
import { richTextHtml, biographyHtml } from "../scripts/interview.mjs";
import { previewHtml, parseDraft, createPackagePanel } from "../scripts/preview.mjs";

const savedFoundry=globalThis.foundry;
globalThis.foundry = {
  utils: {
    escapeHTML: value => String(value).replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")
  }
};

const sample = () => ({
  story: "# Old Beginnings\n\nThe **young** traveler *walked*.\n\n- Went north\n- Met a friend",
  profile: { personality: "Cautious and **loyal**", motivations: "Find the missing road" },
  relationships: [{name:"Nara",connection:"sister",status:"alive",significance:"Old friend"}],
  secrets: [
    {title:"Player secret",description:"Known **only** to them.",visibility:"player"},
    {title:"GM twist",description:"Unrevealed",visibility:"gm_suggestion"}
  ],
  hooks: [{title:"Missing caravan",description:"Track the **trail**."}],
  physical: {age:"30",hair:"Black"}
});

test("Markdown in story is converted to readable prose, headings, lists and emphasis",()=>{
  const html=richTextHtml("# The Road\n\nA **bold** and *patient* traveler.\n\n- First\n- Second\n\n1. Third\n2. Fourth");
  assert.match(html,/<h3>The Road<\/h3>/);
  assert.match(html,/<strong>bold<\/strong>/);
  assert.match(html,/<em>patient<\/em>/);
  assert.match(html,/<ul><li>First<\/li><li>Second<\/li><\/ul>/);
  assert.match(html,/<ol><li>Third<\/li><li>Fourth<\/li><\/ol>/);
  assert.doesNotMatch(html,/\*\*bold\*\*|# The Road/);
});

test("Gemini-authored HTML and unsafe Markdown links remain inert",()=>{
  const html=richTextHtml('The **brave** rogue <img src=x onerror="alert(1)"> and [unsafe](javascript:alert(1)).');
  assert.match(html,/<strong>brave<\/strong>/);
  assert.match(html,/&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.doesNotMatch(html,/<img|<a |javascript:/i);
  const fenced=richTextHtml("Here:\n\n" + String.fromCharCode(96).repeat(3) +
    "\n<script>bad()</script>\n" + String.fromCharCode(96).repeat(3));
  assert.match(fenced,/<pre><code>&lt;script&gt;bad\(\)&lt;\/script&gt;<\/code><\/pre>/);
});

test("saved biography formats text and excludes GM suggestions",()=>{
  const html=biographyHtml(sample());
  assert.match(html,/<h2>Character History<\/h2>/);
  assert.match(html,/<h3>Old Beginnings<\/h3>/);
  assert.match(html,/<strong>young<\/strong>/);
  assert.match(html,/<li>Went north<\/li>/);
  assert.match(html,/Player secret/);
  assert.doesNotMatch(html,/GM twist|Unrevealed/);
  assert.doesNotMatch(html,/# Old Beginnings|\*\*young\*\*/);
});

test("preview shows the saved biography plus clearly unsaved physical suggestions",()=>{
  const html=previewHtml(sample());
  assert.match(html,/Suggested physical details \(review only\)/);
  assert.match(html,/not written to the character sheet/);
  assert.match(html,/>30</);
  assert.doesNotMatch(html,/GM twist/);
  assert.doesNotMatch(biographyHtml(sample()),/Suggested physical details|>30</);
});

test("invalid edited JSON reports a helpful error",()=>{
  assert.throws(()=>parseDraft("{bad"),/not valid JSON/);
  assert.throws(()=>parseDraft(JSON.stringify({story:""})),/omitted the character history/);
  assert.equal(parseDraft(JSON.stringify(sample())).story, sample().story);
});

class Node {
  constructor(tag){
    this.tagName=tag;this.children=[];this.handlers={};
    this.hidden=false;this.disabled=false;this.textContent="";this.innerHTML="";this.value="";
  }
  append(...children){this.children.push(...children);}
  setAttribute(name,value){this[name]=value;}
  addEventListener(name,fn){this.handlers[name]=fn;}
  click(){this.handlers.click?.();}
  find(predicate){
    if(predicate(this)) return this;
    for(const child of this.children){const hit=child.find?.(predicate);if(hit)return hit;}
    return null;
  }
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test("preview is default; switching to Edit and back refreshes from the latest JSON",()=>{
  const previous=globalThis.document;
  globalThis.document={createElement:tag=>new Node(tag)};
  try {
    const panel=createPackagePanel({packageData:sample(),onSave:async()=>{},onRegenerate:async()=>sample()});
    const preview=panel.find(x=>x.className==="bf-package-preview");
    const editor=panel.find(x=>x.className==="bf-json-editor");
    const edit=panel.find(x=>x.textContent==="Edit JSON");
    const view=panel.find(x=>x.textContent==="Readable Preview");
    assert.equal(preview.hidden,false);
    assert.equal(editor.hidden,true);
    assert.match(preview.innerHTML,/<strong>young<\/strong>/);
    edit.click();assert.equal(editor.hidden,false);
    const revised=sample();revised.story="**Changed** beginning.";
    editor.value=JSON.stringify(revised);
    view.click();
    assert.equal(editor.hidden,true);
    assert.match(preview.innerHTML,/<strong>Changed<\/strong> beginning/);
  } finally {globalThis.document=previous;}
});

test("saving always uses current edited JSON, never a stale generated draft",async()=>{
  const previous=globalThis.document;
  globalThis.document={createElement:tag=>new Node(tag)};
  let saved;
  try {
    const panel=createPackagePanel({
      packageData:sample(),
      onSave:async draft=>{saved=draft;},
      onRegenerate:async()=>sample()
    });
    const editor=panel.find(x=>x.className==="bf-json-editor");
    const save=panel.find(x=>x.textContent==="Save approved background to biography");
    const preview=panel.find(x=>x.className==="bf-package-preview");
    const revised=sample();revised.story="Latest edit, not first draft.";
    editor.value=JSON.stringify(revised);
    save.click();await tick();
    assert.equal(saved.story,"Latest edit, not first draft.");
    assert.match(preview.innerHTML,/Latest edit, not first draft/);
  } finally {globalThis.document=previous;}
});

test("bad JSON prevents save and remains visible for correction",async()=>{
  const previous=globalThis.document;
  globalThis.document={createElement:tag=>new Node(tag)};
  let count=0;
  try {
    const panel=createPackagePanel({
      packageData:sample(),onSave:async()=>{count++;},onRegenerate:async()=>sample()
    });
    const editor=panel.find(x=>x.className==="bf-json-editor");
    const save=panel.find(x=>x.textContent==="Save approved background to biography");
    const error=panel.find(x=>x.className==="bf-package-error");
    editor.value="{invalid";
    save.click();await tick();
    assert.equal(count,0);
    assert.equal(editor.hidden,false);
    assert.equal(error.hidden,false);
    assert.match(error.textContent,/not valid JSON/);
  } finally {globalThis.document=previous;}
});

test("regeneration receives the latest edited package and returns to preview",async()=>{
  const previous=globalThis.document;
  globalThis.document={createElement:tag=>new Node(tag)};
  let originalDraft, instructions;
  try {
    const panel=createPackagePanel({
      packageData:sample(),onSave:async()=>{},
      onRegenerate:async ({packageData,direction})=>{
        originalDraft=packageData;instructions=direction;
        return {...sample(),story:"A newer **history**."};
      }
    });
    const editor=panel.find(x=>x.className==="bf-json-editor");
    const direction=panel.find(x=>x.placeholder==="Optional: what should Gemini change?");
    const regenerate=panel.find(x=>x.textContent==="Regenerate with direction");
    const preview=panel.find(x=>x.className==="bf-package-preview");
    editor.value=JSON.stringify({...sample(),story:"Edited concept"});
    direction.value="Less melancholy";
    regenerate.click();await tick();
    assert.equal(originalDraft.story,"Edited concept");
    assert.equal(instructions,"Less melancholy");
    assert.match(preview.innerHTML,/A newer <strong>history<\/strong>/);
    assert.equal(editor.hidden,true);
    assert.equal(JSON.parse(editor.value).story,"A newer **history**.");
    assert.equal(direction.value,"");
  } finally {globalThis.document=previous;}
});
