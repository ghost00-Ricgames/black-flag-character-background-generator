/**
 * Gemini Interactions API (v1beta).
 * REST avoids bundling a Google SDK into Foundry; requests run on the GM client.
 * https://ai.google.dev/gemini-api/docs/get-started
 * Interactions are stateless (store: false); the existing interview sends its full
 * history each time instead of storing characters' private histories on Google.
 */
const INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const MODELS_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const textField = () => ({ type: "string" });
const namedFields = names => Object.fromEntries(names.map(name => [name, textField()]));
const listOf = (schema, minItems, maxItems) => ({
  type: "array", items: schema,
  ...(minItems == null ? {} : { minItems }),
  ...(maxItems == null ? {} : { maxItems })
});
const objectWith = (names, required = names) => ({
  type: "object", properties: namedFields(names), required
});

const QUESTION_SCHEMA = {
  type: "object",
  properties: {
    question: textField(),
    suggestions: listOf(textField(), 0, 3)
  },
  required: ["question"]
};

const PACKAGE_SCHEMA = {
  type: "object",
  properties: {
    story: textField(),
    physical: objectWith(["age", "height", "weight", "eyes", "skin", "hair"]),
    profile: objectWith(["personality", "ideals", "bonds", "flaws", "motivations", "fears", "mannerisms"]),
    relationships: listOf(objectWith(["name", "connection", "status", "significance"]), 3, 5),
    secrets: listOf({
      type: "object",
      properties: {
        title: textField(),
        description: textField(),
        visibility: { type: "string", enum: ["player", "gm_suggestion"] }
      },
      required: ["title", "description", "visibility"]
    }),
    hooks: listOf(objectWith(["title", "description"]), 2, 3)
  },
  required: ["story", "physical", "profile", "relationships", "secrets", "hooks"]
};

/** Extract the final model_output text, ignoring any reasoning or input steps. */
export function interactionText(interaction) {
  if (interaction?.status && interaction.status !== "completed") {
    throw new Error("Gemini interaction did not complete (" + interaction.status + ").");
  }
  const steps = interaction?.steps;
  if (!Array.isArray(steps)) throw new Error("Gemini returned an invalid Interactions API response.");
  const text = steps
    .filter(step => step?.type === "model_output")
    .flatMap(step => Array.isArray(step.content) ? step.content : [])
    .filter(part => part?.type === "text" && typeof part.text === "string")
    .map(part => part.text)
    .join("")
    .trim();
  if (!text) throw new Error("Gemini returned no final text.");
  return text;
}

async function jsonResponse(response) {
  try { return await response.json(); }
  catch { throw new Error("Gemini returned a non-JSON HTTP response."); }
}

/** Short, capped exponential backoff with jitter; honor a modest Retry-After. */
function retryDelayMs(response, attempt) {
  const header = response.headers?.get?.("retry-after");
  if (header) {
    const seconds = Number(header);
    const millis = Number.isFinite(seconds) && seconds >= 0
      ? seconds * 1000 : Date.parse(header) - Date.now();
    if (Number.isFinite(millis) && millis >= 0) return Math.min(millis, 12000);
  }
  return Math.min(1200 * (2 ** attempt), 6000) + Math.floor(Math.random() * 300);
}

function httpError(status, data, model) {
  const message = typeof data?.error?.message === "string"
    ? data.error.message.slice(0, 500) : "Gemini request failed.";
  return new Error("Gemini HTTP " + status + " (" + model + "): " + message);
}

export class GeminiService {
  /**
   * Retry only transient overload and rate-limit errors. When a primary model
   * stays overloaded, optionally try one configured fallback. Do not fall back
   * on invalid API keys, project spend caps, unsupported models, or malformed
   * requests. Never save the input in Gemini interaction history (store:false).
   */
  static async request({
    key, model = "gemini-3.8-flash", fallbackModel = "", image = null,
    instruction, payload, kind = "package", timeoutMs,
    // Injected by tests; the default is a normal browser delay.
    sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
    onStatus
  }) {
    if (!key) throw new Error("Configure a Gemini API key on the GM browser.");
    const normalize = value => String(value || "").trim().replace(/^models\//, "");
    const selectedModel = normalize(model) || "gemini-3.8-flash";
    const backupModel = normalize(fallbackModel);
    for (const name of [selectedModel, backupModel].filter(Boolean)) {
      if (!/^[\w.-]+$/.test(name)) throw new Error("Gemini model ID contains invalid characters.");
    }
    const schema = kind === "question" ? QUESTION_SCHEMA : kind === "package" ? PACKAGE_SCHEMA : null;
    if (!schema) throw new Error("Unsupported Gemini response format.");
    const deadlineMs = timeoutMs ?? (kind === "question" ? 75000 : 150000);
    const mayFallback = !!backupModel && backupModel !== selectedModel;
    const models = mayFallback ? [selectedModel, backupModel] : [selectedModel];
    let imageInput = null;
    if (image != null) {
      if (image.type !== "image" || image.mime_type !== "image/jpeg" ||
          typeof image.data !== "string" || image.data.length > 2_000_000 ||
          !/^[A-Za-z0-9+/]+={0,2}$/.test(image.data)) {
        throw new Error("Invalid portrait image payload.");
      }
      imageInput = {type:"image",mime_type:"image/jpeg",data:image.data};
    }
    let primaryOverloaded = false;

    for (const [modelIndex, activeModel] of models.entries()) {
      if (modelIndex > 0 && !primaryOverloaded) break;
      const body = {
        model: activeModel,
        input: imageInput ? [{type:"text",text:JSON.stringify(payload)},imageInput] : JSON.stringify(payload),
        system_instruction: instruction,
        // Gemini 3.8 Flash no longer uses explicit sampling parameters such as
        // temperature. Only request short reasoning for a follow-up question.
        ...(kind === "question" && /^gemini-3\./.test(activeModel)
          ? { generation_config: { thinking_level: "low" } } : {}),
        response_format: { type: "text", mime_type: "application/json", schema },
        store: false
      };
      // One retry for transient errors on the primary, no repeated requests
      // against a fallback that is itself overloaded.
      const attempts = modelIndex === 0 ? 2 : 1;
      for (let attempt = 0; attempt < attempts; attempt++) {
        let response;
        try {
          response = await fetch(INTERACTIONS_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": key },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(deadlineMs)
          });
        } catch (error) {
          if (error?.name === "TimeoutError" || error?.name === "AbortError") {
            throw new Error("Gemini took too long to respond (" + Math.round(deadlineMs / 1000) +
              " seconds). Check Google AI Studio usage, then retry.");
          }
          throw new Error("Could not reach the Gemini Interactions API. Check your network connection.");
        }
        // 503 proxy responses are not always JSON, but are still overloads.
        const data = response.ok ? await jsonResponse(response)
          : await response.json().catch(() => ({error:{message: "Service temporarily unavailable."}}));
        if (response.ok) {
          const output = interactionText(data);
          try { return JSON.parse(output); }
          catch { throw new Error("Gemini returned invalid JSON for the character " + kind + "."); }
        }
        const overloaded = response.status === 503;
        const rateLimited = response.status === 429;
        const reason = String(data?.error?.message ?? "");
        const spendingCap = /spend cap|billing|payment|daily quota|per.day|hard limit/i.test(reason);
        const canRetry = overloaded || (rateLimited && !spendingCap);
        if (canRetry && attempt + 1 < attempts) {
          await sleep(retryDelayMs(response, attempt));
          continue;
        }
        if (overloaded && modelIndex === 0 && mayFallback) {
          primaryOverloaded = true;
          if (typeof onStatus === "function") onStatus(
            activeModel + " is overloaded. Trying " + backupModel + "."
          );
          break;
        }
        if (overloaded) {
          const details = mayFallback && modelIndex > 0
            ? "Both " + selectedModel + " and " + backupModel + " are overloaded."
            : activeModel + " is overloaded.";
          throw new Error(details + " Google returned HTTP 503 (high demand). Try again later" +
            (mayFallback ? "." : " or configure a fallback model in Module Settings."));
        }
        if (rateLimited) {
          throw new Error(httpError(429, data, activeModel).message +
            " Check your Google AI Studio rate limits and billing caps.");
        }
        throw httpError(response.status, data, activeModel);
      }
    }
    throw new Error("Gemini did not produce a response.");
  }

  /** Optional discovery for future model picker; unlike the old helper, do not
   * restrict models to generateContent support since interactions is now used. */
  static async models(key) {
    if (!key) throw new Error("Configure a Gemini API key on the GM browser.");
    const response = await fetch(MODELS_URL + "?pageSize=1000", {
      headers: { "x-goog-api-key": key }
    });
    const data = await jsonResponse(response);
    if (!response.ok) throw new Error("Could not retrieve Gemini models (HTTP " + response.status + ").");
    return (Array.isArray(data.models) ? data.models : [])
      .map(m => String(m.name ?? "").replace(/^models\//, ""))
      .filter(name => /^gemini-[\w.-]+$/.test(name));
  }
}
