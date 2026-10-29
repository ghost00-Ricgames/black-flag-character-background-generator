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
    assert.ok(init.signal instanceof AbortSignal);
    assert.equal(init.headers["x-goog-api-key"],"secret-test-key");
    const body=JSON.parse(init.body);
    assert.equal(body.model,"gemini-3.8-flash");
    assert.equal(body.store,false);
    assert.equal(body.system_instruction,"Ask exactly one question.");
    assert.deepEqual(JSON.parse(body.input),{character:{name:"Hero"},answers:[]});
    assert.deepEqual(body.response_format.schema.required,["question"]);
    assert.equal(body.response_format.type,"text");
    assert.equal(body.response_format.mime_type,"application/json");
    assert.equal(body.generation_config.temperature,undefined);
    assert.equal(body.generation_config.thinking_level,"low");
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

test("question timeout shows a useful error instead of hanging forever", async () => {
  const saved=globalThis.fetch;
  globalThis.fetch=async (_url,{signal})=>{
    assert.ok(signal instanceof AbortSignal);
    throw Object.assign(new Error("timed out"), {name:"TimeoutError"});
  };
  try {
    await assert.rejects(
      GeminiService.request({key:"key",kind:"question",instruction:"Ask",payload:{},timeoutMs:5}),
      /Gemini took too long to respond/
    );
  } finally {globalThis.fetch=saved;}
});


const overload = (status=503, message="This model is currently experiencing high demand.", retryAfter=null) => ({
  ok: false, status,
  headers: { get: name => name.toLowerCase() === "retry-after" ? retryAfter : null },
  json: async () => ({error:{message,status:status===503?"UNAVAILABLE":"RESOURCE_EXHAUSTED"}})
});

test("503 overload is retried with backoff then falls back to Gemini 3.6", async () => {
  const saved=globalThis.fetch;
  const models=[], waits=[];
  globalThis.fetch=async (_,options)=>{
    const model=JSON.parse(options.body).model;
    models.push(model);
    if (model === "gemini-3.8-flash") return overload();
    return response(JSON.stringify({question:"Tell me about your home.", suggestions:[]}));
  };
  try {
    const result=await GeminiService.request({
      key:"key", model:"gemini-3.8-flash",fallbackModel:"gemini-3.6-flash",
      kind:"question",instruction:"Ask",payload:{},sleep:async ms=>waits.push(ms)
    });
    assert.deepEqual(models,["gemini-3.8-flash","gemini-3.8-flash","gemini-3.6-flash"]);
    assert.equal(waits.length,1);
    assert.ok(waits[0]>=1200 && waits[0]<1500);
    assert.equal(result.question,"Tell me about your home.");
  } finally {globalThis.fetch=saved;}
});

test("503 overload and unsuccessful fallback yield a helpful error without loops", async () => {
  const saved=globalThis.fetch;
  let calls=0;
  globalThis.fetch=async()=>{calls++;return overload();};
  try {
    await assert.rejects(GeminiService.request({
      key:"key",model:"gemini-3.8-flash",fallbackModel:"gemini-3.6-flash",
      kind:"question",instruction:"Ask",payload:{},sleep:async()=>{}
    }),/Both gemini-3.8-flash and gemini-3.6-flash are overloaded.*503/);
    assert.equal(calls,3);
  } finally {globalThis.fetch=saved;}
});

test("HTTP 503 without configured fallback only retries the primary model", async () => {
  const saved=globalThis.fetch;
  let calls=0;
  globalThis.fetch=async()=>{calls++;return overload();};
  try {
    await assert.rejects(GeminiService.request({
      key:"key",model:"gemini-3.8-flash",fallbackModel:"",
      kind:"question",instruction:"Ask",payload:{},sleep:async()=>{}
    }),/configure a fallback model/);
    assert.equal(calls,2);
  } finally {globalThis.fetch=saved;}
});

test("HTTP 429 spend caps are not retried or sent to backup model", async () => {
  const saved=globalThis.fetch;
  let calls=0;
  globalThis.fetch=async()=>{calls++;return overload(429,"Project spend cap exceeded");};
  try {
    await assert.rejects(GeminiService.request({
      key:"key",model:"gemini-3.8-flash",fallbackModel:"gemini-3.6-flash",
      kind:"question",instruction:"Ask",payload:{},sleep:async()=>{}
    }),/429.*spend cap.*billing caps/);
    assert.equal(calls,1);
  } finally {globalThis.fetch=saved;}
});

test("HTTP 400 invalid payload is never retried or sent to fallback", async () => {
  const saved=globalThis.fetch;
  let calls=0;
  globalThis.fetch=async()=>{calls++;return overload(400,"Invalid response_format schema");};
  try {
    await assert.rejects(GeminiService.request({
      key:"key",model:"gemini-3.8-flash",fallbackModel:"gemini-3.6-flash",
      kind:"question",instruction:"Ask",payload:{},sleep:async()=>{}
    }),/400.*Invalid response_format/);
    assert.equal(calls,1);
  } finally {globalThis.fetch=saved;}
});

test("HTTP 429 transient rate limit honors Retry-After and does not switch models", async () => {
  const saved=globalThis.fetch;
  const models=[], delays=[];
  globalThis.fetch=async (_,options)=>{
    models.push(JSON.parse(options.body).model);
    if(models.length===1) return overload(429,"Rate limit exceeded","2");
    return response(JSON.stringify({question:"Now?",suggestions:[]}));
  };
  try {
    const result=await GeminiService.request({
      key:"key",model:"gemini-3.8-flash",fallbackModel:"gemini-3.6-flash",
      kind:"question",instruction:"Ask",payload:{},sleep:async ms=>delays.push(ms)
    });
    assert.deepEqual(delays,[2000]);
    assert.deepEqual(models,["gemini-3.8-flash","gemini-3.8-flash"]);
    assert.equal(result.question,"Now?");
  } finally {globalThis.fetch=saved;}
});
