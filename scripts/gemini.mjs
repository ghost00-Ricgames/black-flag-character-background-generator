/** Gemini calls run only on an authorized GM client. Browser-side keys are NOT secret from that GM. */
export class GeminiService {
  static async request({ key, model, instruction, payload, temperature = 0.8 }) {
    if (!key || !model) throw new Error("Configure a Gemini API key and model.");
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: instruction }] },
        contents: [{ role: "user", parts: [{ text: JSON.stringify(payload) }] }],
        generationConfig: { temperature, responseMimeType: "application/json" }
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || `Gemini HTTP ${response.status}`);
    const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("");
    if (!text) throw new Error("Gemini returned no text.");
    try { return JSON.parse(text); } catch { throw new Error("Gemini returned invalid JSON."); }
  }
  static async models(key) {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000", { headers: { "x-goog-api-key": key } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "Could not retrieve Gemini models.");
    return (data.models || []).filter(m => m.supportedGenerationMethods?.includes("generateContent")).map(m => m.name.replace(/^models\//, ""));
  }
}
