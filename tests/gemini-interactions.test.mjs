import test from "node:test";
import assert from "node:assert/strict";
import { GeminiService, interactionText } from "../scripts/gemini.mjs";

const response = (text, extra = {}) => ({
  ok: true, status: 200,
  json: async () => ({
    status: "completed",
    steps: [
      { type: "thought", signature: "not-user-visible" },
      { type: "model_output", content: [{ type: "text", text }] }
    ], ...extra
  })
});

test("3.8 Flash Interactions REST request uses stateless structured JSON", async () => {
  const saved = globalThis.fetch;
  let url, init;
  globalThis.fetch = async (requestUrl, options) => {
    url = requestUrl;
    init = options;
    return response(JSON.stringify({question:"What changed?",suggestions:["A lost friend"]}));
  };
  try {
    const result = await GeminiService.request({
      key:"secret-test-key",model:"gemini-3.8-flash",kind:"question",
      instruction:"Ask exactly one question.",payload:{character:{name:"Hero"},answers:[]}
    });
    assert.equal(url,"https://generativelanguage.googleapis.com/v1beta/interactions");
    assert.equal(init.method,"POST");
    assert.equal(init.headers["x-goog-api-key"],"secret-test-key");
    const body=JSON.parse(init.body);
    assert.equal(body.model,"gemini-3.8-flash");
    assert.equal(body.store,false);
    assert.equal(body.system_instruction,"Ask exactly one question.");
    assert.deepEqual(JSON.parse(body.input),{character:{name:"Hero"},answers:[]});
    assert.deepEqual(body.response_format.schema.required,["question"]);
    assert.equal(body.response_format.type,"text");
    assert.equal(body.response_format.mime_type,"application/json");
    assert.equal(typeof body.generation_config.temperature,"number");
    assert.equal(body.contents,undefined);
    assert.equal(body.generationConfig,undefined);
    assert.deepEqual(result,{question:"What changed?",suggestions:["A lost friend"]});
    assert.equal(init.body.includes("secret-test-key"),false);
  } finally { globalThis.fetch=saved; }
});

test("package parser ignores thought and user_input steps, handles schema", async () => {
  const saved=globalThis.fetch;
  let body;
  const payload={
    story:"An adventurer learned patience.",physical:{age:"29",height:"6 feet",weight:"180 lbs",eyes:"Green",skin:"Tan",hair:"Black"},
    profile:{personality:"Kind",ideals:"Freedom",bonds:"Family",flaws:"Proud",motivations:"Truth",fears:"Loss",mannerisms:"Taps a coin"},
    relationships:[{name:"Nara",connection:"sister",status:"alive",significance:"Trust"}],
    secrets:[],hooks:[]
  };
  globalThis.fetch=async (_url,options) => {
    body=JSON.parse(options.body);
    return response(JSON.stringify(payload));
  };
  try {
    const value=await GeminiService.request({key:"key",kind:"package",instruction:"Create a background",payload:{}});
    assert.deepEqual(value,payload);
    assert.ok(body.response_format.schema.properties.physical);
    assert.deepEqual(body.response_format.schema.properties.hooks.minItems,2);
    assert.equal(body.model,"gemini-3.8-flash");
  } finally {globalThis.fetch=saved;}
});

test("Interactions API error messages propagate without exposing key or payload", async () => {
  const saved=globalThis.fetch;
  globalThis.fetch=async ()=>({ok:false,status:429,json:async()=>({error:{message:"Rate limit exceeded"}})});
  try {
    await assert.rejects(GeminiService.request({key:"secret-key",instruction:"Private",payload:{name:"Hero"}}),
      error => error.message.includes("429") && error.message.includes("Rate limit")
        && !error.message.includes("secret-key") && !error.message.includes("Hero"));
  } finally {globalThis.fetch=saved;}
});

test("interaction parser rejects incomplete, missing and malformed JSON outputs", async () => {
  assert.throws(()=>interactionText({status:"in_progress",steps:[]}),/did not complete/);
  assert.throws(()=>interactionText({status:"completed",steps:[{type:"thought"}]}),/no final text/);
  const saved=globalThis.fetch;
  globalThis.fetch=async()=>response("not json");
  try { await assert.rejects(GeminiService.request({key:"key",kind:"question",instruction:"Ask",payload:{}}),/invalid JSON/); }
  finally {globalThis.fetch=saved;}
});
