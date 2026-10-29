import test from "node:test";
import assert from "node:assert/strict";
import { actorFacts } from "../scripts/character-data.mjs";
import { validatePackage } from "../scripts/interview.mjs";

const onceHooks = new Map(), hooks = new Map(), registeredSettings = new Map(), keybindings = new Map();
const socketListeners = new Map(), queried = [];
const gm = { id: "gm", name: "Game Master", isGM: true, active: true };
const player = { id: "player", name: "Player", isGM: false, active: true, can: () => true };
const intruder = { id: "intruder", name: "Intruder", isGM: false, active: true, can: () => true };
const users = [gm, player, intruder]; users.get = id => users.find(u => u.id === id);
class FakeApp {
  static renders = [];
  constructor() { this.element = {querySelector:()=>null}; }
  render(options) { FakeApp.renders.push({app:this, options}); return Promise.resolve(this); }
  _onRender() {}
}
class FakeActorSheet {}
let confirmApproval = true;
gm.query = async () => { throw Error("GM is not a player"); };
player.query = async (queryName, message) => { queried.push({queryName, message, recipient:"player"}); return true; };
intruder.query = async (queryName, message) => { queried.push({queryName, message, recipient:"intruder"}); return true; };
const pc = {
  id:"hero", type:"pc", name:"Hero", items:[{name:"Alert",type:"talent"}],
  updates:[],
  system:{
    biography:{backstory:"",age:"28",height:"",weight:"",eyes:"Brown",skin:"",hair:""},
    progression:{
      lineage:{name:"Human"},heritage:{name:"Wanderer"},background:{name:"Guide"},
      levels:{"1":{class:{name:"Fighter"}},"2":{class:{name:"Fighter"}},"3":{class:{name:"Wizard"}}},
      classes:{fighter:{document:{name:"Fighter"},levels:2,subclass:{name:"Champion"}},wizard:{document:{name:"Wizard"},levels:1}}
    },
    proficiencies:{skills:{athletics:{proficiency:{multiplier:1}},arcana:{proficiency:{multiplier:0}}},tools:{smith:{proficiency:{multiplier:1}}}}
  },
  testUserPermission(user) { return user.id === "player"; },
  async update(data) { this.updates.push(data); return this; }
};
const actors=[pc]; actors.get=id=>actors.find(a=>a.id===id);
const values={apiKey:"not-a-real-key",model:"gemini-test",campaignContext:"",requireApproval:false,maxRequests:30};
globalThis.foundry={
  utils:{randomID:()=>"0123456789abcdef",escapeHTML:x=>String(x).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;")},
  helpers:{interaction:{KeyboardManager:{MODIFIER_KEYS:{CONTROL:"Control",SHIFT:"Shift"}}}},
  applications:{api:{ApplicationV2:FakeApp,DialogV2:{confirm:async()=>confirmApproval}},sheets:{ActorSheetV2:FakeActorSheet}}
};
globalThis.Hooks={once:(name,fn)=>onceHooks.set(name,fn),on:(name,fn)=>hooks.set(name,fn)};
globalThis.CONST={DOCUMENT_OWNERSHIP_LEVELS:{OWNER:3},KEYBINDING_PRECEDENCE:{NORMAL:0}};
globalThis.CONFIG={queries:{}};
globalThis.canvas={tokens:{controlled:[]}};
globalThis.ui={notifications:{warn:message=>message,info:message=>message,error:message=>message}};
globalThis.game={
  user:gm,users,actors,
  settings:{register:(id,key,config)=>registeredSettings.set(key,config),get:(id,key)=>values[key]},
  keybindings:{register:(id,key,config)=>keybindings.set(key,config)},
  socket:{on:(key,fn)=>socketListeners.set(key,fn),emit:()=>{}}
};
const ID="black-flag-character-background-generator";
await import("../scripts/main.mjs");
onceHooks.get("init")();
onceHooks.get("ready")();
const request=socketListeners.get(`module.${ID}`);
let lastPayload;
globalThis.fetch=async (url, options)=>{
  lastPayload=JSON.parse(options.body);
  const text=JSON.stringify({question:"What did you lose?",suggestions:["A friend"]});
  return {ok:true,json:async()=>({candidates:[{content:{parts:[{text}]}}]})};
};

test("v14 ApplicationV2 header control launches for an owned Black Flag PC only",async()=>{
  assert.equal(typeof hooks.get("getHeaderControlsApplicationV2"),"function");
  const sheet=new FakeActorSheet();sheet.actor=pc;
  const controls=[];hooks.get("getHeaderControlsApplicationV2")(sheet,controls);
  assert.equal(controls.length,1);
  assert.equal(controls[0].action,"bf-character-background");
  await controls[0].onClick();
  assert.equal(FakeApp.renders.at(-1).app.actor,pc);
  assert.deepEqual(FakeApp.renders.at(-1).options,{force:true});
  const noControls=[];hooks.get("getHeaderControlsApplicationV2")({actor:pc},noControls);
  assert.equal(noControls.length,0);
  game.user=intruder;
  const forbidden=[];hooks.get("getHeaderControlsApplicationV2")(sheet,forbidden);
  assert.equal(forbidden.length,0);
  game.user=gm;
});
test("keybinding is registered at init with Foundry modifier constants",()=>{
  const kb=keybindings.get("openGenerator");assert.ok(kb);
  assert.deepEqual(kb.editable[0].modifiers,["Control","Shift"]);
});
test("Black Flag progression and proficiencies are extracted",()=>{
  const f=actorFacts(pc);
  assert.deepEqual(f.classes.map(c=>c.name),["Fighter","Wizard"]);
  assert.deepEqual(f.classes.map(c=>c.level),[2,1]);
  assert.deepEqual(f.talents,["Alert"]);
  assert.deepEqual(f.skillProficiencies,["athletics"]);
  assert.deepEqual(f.toolProficiencies,["smith"]);
  assert.equal(f.physical.age,"28");
});
test("module manifest settings keep Gemini key client-local",()=>{
  assert.equal(registeredSettings.get("apiKey").scope,"client");
  assert.equal(typeof CONFIG.queries[`${ID}.receiveResponse`],"function");
});
test("GM accepts authenticated sender and returns a targeted Gemini answer",async()=>{
  queried.length=0;
  await request({
    type:"request",gmId:"gm",requestId:"0123456789abcdef",actorId:"hero",action:"question",
    payload:{questionnaire:{talents:["Alert"],physical:{age:"28"}},answers:[]}
  },"player");
  assert.equal(queried.length,1);
  assert.equal(queried[0].recipient,"player");
  assert.equal(queried[0].message.result.question,"What did you lose?");
  assert.deepEqual(JSON.parse(lastPayload.contents[0].parts[0].text).character.talents,["Alert"]);
  assert.equal(lastPayload.contents[0].parts[0].text.includes("not-a-real-key"),false);
});
test("GM rejects forged requester ID when server sender is missing",async()=>{
  queried.length=0;
  await request({type:"request",gmId:"gm",requestId:"0123456789abcdef",actorId:"hero",action:"question",requesterId:"player",payload:{}},undefined);
  assert.equal(queried.length,0);
});
test("non-owner cannot save another player's PC",async()=>{
  queried.length=0;pc.updates.length=0;
  await request({type:"request",gmId:"gm",requestId:"0123456789abcdef",actorId:"hero",action:"save",payload:{package:{}}},"intruder");
  assert.equal(pc.updates.length,0);
  assert.equal(queried.at(-1).recipient,"intruder");
  assert.match(queried.at(-1).message.error,/ownership/i);
});
test("GM-approved save writes only Black Flag backstory",async()=>{
  const pack=validatePackage({story:"A brief history.",profile:{personality:"Curious"},relationships:[],secrets:[],hooks:[]});
  pc.updates.length=0;queried.length=0;
  await request({type:"request",gmId:"gm",requestId:"0123456789abcdef",actorId:"hero",action:"save",payload:{package:pack}},"player");
  assert.equal(pc.updates.length,1);
  assert.deepEqual(Object.keys(pc.updates[0]),["system.biography.backstory"]);
  assert.match(pc.updates[0]["system.biography.backstory"],/A brief history/);
});
