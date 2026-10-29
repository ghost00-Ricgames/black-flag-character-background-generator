# Black Flag Character Background Generator

> **PUBLIC BETA v0.1.5-beta.1 — GOOGLE GEMINI API ACCESS REQUIRED**
>
> This module **does not work without your own Google Gemini API key and access to a supported Gemini model**. The GM must obtain a key through [Google AI Studio](https://aistudio.google.com/apikey), configure it in Foundry, and have an eligible Google API project with available quota. Google may impose usage limits or charges; any Google API costs are the user's responsibility. A Gemini API key is **not included**, and the module does not provide free AI requests.

**System compatibility:** Foundry VTT **14** (tested against **14.369**), Kobold Press Black Flag / Tales of the Valiant **3.0.075+** (verified with **3.0.079**). This is a **beta**, not a Foundry Package Directory listing.

**Install via Foundry manifest:**
`https://github.com/ghost00-Ricgames/black-flag-character-background-generator/releases/download/v0.1.5-beta.1/module.json`

**Release and ZIP download:** [v0.1.5-beta.1](https://github.com/ghost00-Ricgames/black-flag-character-background-generator/releases/tag/v0.1.5-beta.1).

## Required Gemini API setup

1. Create or access a Gemini API project in [Google AI Studio](https://aistudio.google.com/apikey). Generate your **own** API key and ensure the project can use a configured model.
2. Install this module and enable it in a Foundry world using the **Black Flag** game system.
3. Sign in **as the GM** and open **Game Settings → Configure Settings → Module Settings → Black Flag Character Background Generator**.
4. Paste the Gemini API key into **Gemini API Key**. The key is stored **locally in the GM's browser**, not in the module, README, or player prompts. Other GM browsers need their own configured key.
5. Use **Gemini Model** (default `gemini-3.8-flash`) and optional **Fallback Gemini Model** (default `gemini-3.6-flash`). Availability depends on your Google account, API project and rate limits. If neither model is available to your key, select a supported model and review any error.
6. Open an owned Black Flag PC actor's sheet and choose **Generate Character Background** from its header controls. Players can request generation for actors they own **only while a GM client with an API key is online**.

**Privacy:** Generating a background sends the character's questionnaire and sheet details to Google's Gemini API. If you choose **Use this character portrait**, a compressed version of custom Foundry-hosted artwork is also sent to Google. Placeholder artwork is skipped automatically. Do not submit private data without permission. Never commit or share your API key.

## Install and launch

1. Install from the manifest URL above in Foundry, **or** download the release ZIP and extract it directly into `FoundryVTT/Data/modules/`. The ZIP contains its own top-level `black-flag-character-background-generator/` directory.
2. Restart Foundry and enable the module in a Black Flag world.
3. Complete the **Required Gemini API setup** section above.
4. On a PC sheet, use the book icon / **Generate Character Background** control. Alternatively, **Ctrl+Shift+B** opens it for a controlled PC token or the first PC you own.

This module supports Black Flag's `pc` actor type, not the D&D `character` actor type.

## Temporary Gemini overload handling (v0.1.4)

- If the chosen model returns **503 high demand**, the GM client retries once with a short capped exponential backoff, then tries the configurable **Fallback Gemini Model** (default `gemini-3.6-flash`).
- Leave the fallback-model setting blank to disable it. A request will never retry indefinitely.
- Transient `429` rate limits receive at most one backoff retry, honoring a capped `Retry-After` header; **billing/spend cap** problems do not retry or cause fallback.
- Invalid request/credential errors (4xx other than 429) do not retry or fall back.
- The total player/GM socket response timeout is extended to accommodate generation retries. This does not change the individual model request timeout.
- Gemini 3.8 Flash does not support explicitly setting temperature; requests omit deprecated sampling fields and use low thinking only for short interview questions.
- A backup model may have different quality, pricing and per-project quota limits. Check Google AI Studio usage if both return overload errors.

## Gemini 3.8 Flash / Interactions API

- Default model is `gemini-3.8-flash`, using the REST **Interactions API** (`POST /v1beta/interactions`).
- Existing worlds configured with the old default `gemini-2.5-flash` automatically switch to 3.8 Flash. Custom model choices are preserved.
- The Gemini key remains local to the GM's browser; no API-key migration is needed from v0.1.1.
- Each request uses structured JSON response format and `store: false` to avoid retaining character histories for server-side conversation state. All prior interview answers are included with each request.
- 3.8 Flash availability, pricing, and rate limits depend on the API key's Google AI Studio project; a running Foundry instance and a real Gemini key are needed for a live integration test.
- API documentation: https://ai.google.dev/gemini-api/docs/get-started and https://ai.google.dev/gemini-api/docs/migrate-to-interactions

## Optional character artwork (v0.1.5-beta.1)

- On Black Flag PC sheets, the generator previews the PC's **existing actor portrait** if it is custom artwork. Use the checkbox to opt out.
- Foundry's placeholder `icons/svg/mystery-man.svg` and Black Flag's default `systems/black-flag/artwork/types/pc.svg` automatically skip image analysis; no image is sent.
- Upload/change a portrait using the normal Foundry character-sheet image picker. This baseline intentionally does not include a second file picker.
- The **GM client** loads the actor's authoritative artwork, never image bytes or arbitrary URLs submitted by players. Only same-origin Foundry-hosted raster images are accepted. External URLs, SVG files and inaccessible art fall back to text-only generation.
- Images are resized to at most 1024px per side, converted to JPEG and bounded to a 2 MB base64 payload. Original portrait files aren't uploaded, changed, or written by this module.
- When opted in, the Interactions API receives one text part plus one JPEG image part. Portraits are *inspiration*, never substitutes for fixed player facts or proof of past events.
- Missing or invalid art is nonfatal: the background generator proceeds with only the questionnaire and character sheet. Gemini may receive the converted JPEG when enabled; don't opt in if an image must remain private.

## Interview

The generator imports and allows editing:

- Name, lineage, heritage, background, multiple classes and subclasses with per-class levels.
- All embedded **Talent** items; skill and tool proficiencies.
- Age, height, weight, eye color, skin color, hair color.
- Character concept, formative experience, important relationship, motivation.

Blank physical traits can be proposed by Gemini. Suggestions remain in the generated JSON for review; **this baseline saves only the approved story/package to `system.biography.backstory`**, not physical traits. Edited mechanical details are supplied to Gemini, not written back into the actor.

Ask one adaptive Gemini follow-up at a time, or generate the package immediately. The package contains story, roleplaying profile, relationships, secrets, hooks and proposed physical traits. The draft can be edited as JSON and regenerated with direction. GM-suggestion secrets are excluded from the saved biography.

## Multiplayer and access control

- GMs generate directly using a **client-local API key**; the key never goes into player socket messages.
- Players may request generation for PCs they **own** while an active GM client is online.
- The GM validates the **Foundry server-supplied socket sender ID** and rechecks ownership before invoking Gemini or saving. Requests without an authenticated sender are ignored.
- Answers and complete packages are returned through Foundry's **targeted User.query** rather than globally broadcasting generated results.
- Optional GM approval for player saves, and per-player request limits, are available in Module Settings.
- **Privacy limitation:** basic module socket requests are broadcast by Foundry to connected clients even though only the selected GM processes them. Player questionnaire content should not contain privileged GM secrets. This is not an end-to-end private messaging system.
- Other installed modules and anyone using the **same GM browser session** may access local client settings. A key stored in a browser is not equivalent to a secure server vault.

## Automated checks

The CI workflow runs:
1. `node --check` against all module scripts.
2. A Foundry-v14 **mock integration suite** for header controls, keybinding registration, Black Flag schema extraction, sender authentication, ownership denial, targeted reply, and backstory-only saving.
3. Manifest validation including `socket: true`.
4. ZIP packaging inside the required top-level module directory.

**Automated mocks are not a substitute for launching the module inside Foundry.** Manual GM/player browser testing is still necessary.

### Manual acceptance checklist

- [ ] The module enables in Foundry v14 without errors.
- [ ] The PC sheet header **Generate Character Background** control appears for GM and an owning player.
- [ ] The ApplicationV2 form opens and includes talents, proficiencies and physical fields.
- [ ] Multiple classes/subclasses and entered details appear in Gemini's output.
- [ ] GM Gemini follow-up and full package generation succeed.
- [ ] A player with ownership can generate while a GM is online.
- [ ] A player without ownership cannot generate or save for another PC.
- [ ] GM approval blocks an unapproved player save.
- [ ] Saving modifies only the PC biography backstory; no mechanics or physical traits are overwritten.
- [ ] No Gemini API key is exposed to a player client.

## Development

Beta published from the `development/v0.1.0` branch at tag `v0.1.5-beta.1`; `main` is not merged. This beta is distributed through GitHub Releases (ZIP + manifest), not Foundry's package directory. For issues, include Foundry, Black Flag and module versions, and redact all API keys and personal character details.
