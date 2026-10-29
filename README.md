# Black Flag Character Background Generator

**v0.1.5 testing baseline** for Foundry VTT **14.369** / Black Flag system **3.0.079** (system minimum **3.0.075**). This is an unreleased development build.

## Install and launch

1. Extract the installable ZIP directly into your Foundry `Data/modules/` directory. The archive already contains its own `black-flag-character-background-generator/` directory.
2. Restart Foundry, enable the module in a **test** Black Flag world, and log in as GM.
3. Open **Game Settings → Configure Settings → Module Settings** and re-enter your Gemini API key. **v0.1.1+ stores the key to client-local storage:** previously configured world-scoped keys will not be read. Each GM browser that handles requests needs its own key.
4. Open a Black Flag **PC** sheet. In its window header controls menu, choose **Generate Character Background** (book icon).
5. Alternative: **Ctrl+Shift+B** opens the generator for a controlled PC token or the first PC you own. Customize the shortcut under Configure Controls if necessary.

This module works with Black Flag's `pc` actor type, not a D&D `character` actor.

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

## Optional character artwork (v0.1.5)

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

Development branch: `development/v0.1.0` / draft PR #1. `main` remains unchanged until approved. GitHub Releases (ZIP + manifest) are the intended distribution path; no Foundry package-registry submission is planned.
