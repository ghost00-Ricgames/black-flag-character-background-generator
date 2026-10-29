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

export class GeminiService {
  static async request({ key, model = "gemini-3.8-flash", instruction, payload, kind = "package", temperature = 0.8 }) {
    if (!key) throw new Error("Configure a Gemini API key on the GM browser.");
    const selectedModel = String(model || "gemini-3.8-flash").trim().replace(/^models\//, "");
    if (!/^[\w.-]+$/.test(selectedModel)) throw new Error("Gemini model ID contains invalid characters.");
    const schema = kind === "question" ? QUESTION_SCHEMA : kind === "package" ? PACKAGE_SCHEMA : null;
    if (!schema) throw new Error("Unsupported Gemini response format.");
    const requestBody = {
      model: selectedModel,
      input: JSON.stringify(payload),
      system_instruction: instruction,
      generation_config: { temperature },
      response_format: { type: "text", mime_type: "application/json", schema },
      // We already send complete answer history; do not retain character backstories
      // for server-side conversational state.
      store: false
    };
    let response;
    try {
      response = await fetch(INTERACTIONS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(requestBody)
      });
    } catch (error) {
      throw new Error("Could not reach the Gemini Interactions API. Check your network connection.");
    }
    const data = await jsonResponse(response);
    if (!response.ok) {
      const message = data?.error?.message || "Gemini request failed";
      // Never log the key or the submitted biography.
      throw new Error("Gemini HTTP " + response.status + ": " + String(message));
    }
    const output = interactionText(data);
    try { return JSON.parse(output); }
    catch { throw new Error("Gemini returned invalid JSON for the character " + kind + "."); }
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
