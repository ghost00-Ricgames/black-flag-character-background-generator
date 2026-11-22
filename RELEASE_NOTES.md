# Black Flag Character Background Generator v0.1.6-beta.1

**Second public beta — human-readable generated backgrounds.** This release is based on the previously tested v0.1.6 development build.

> **Google Gemini API access is REQUIRED.** GMs must provide their own Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey) and have access to a supported model. Google quotas and possible charges are the user's responsibility. No API key or free AI allowance is bundled with this module.

## What's new since v0.1.5-beta.1

- **Readable Preview is now the default:** Gemini's response appears as a formatted character background instead of raw JSON markup.
- Switch between Readable Preview and **Edit JSON** to review or modify the full structured background.
- Switching back to Preview validates edits and refreshes the formatted text.
- **Save and Regenerate use the most recent edits**, preventing a stale draft from being saved.
- Markdown headings, paragraphs, bullet and numbered lists, and emphasis display cleanly; text supplied by the model is escaped before HTML formatting.
- The saved actor biography uses the same readable formatting.
- GM-only secrets are excluded from preview and saved biography; proposed physical details are shown separately and not automatically saved.

Existing Gemini API integration, optional portrait analysis (with default/invalid art skip), follow-up questions, ownership validation and GM-mediated requests remain in place.

## Install in Foundry VTT

**Foundry manifest URL (Install Module → Manifest URL):**
```text
https://github.com/ghost00-Ricgames/black-flag-character-background-generator/releases/download/v0.1.6-beta.1/module.json
```

**Manual download:** Download `black-flag-character-background-generator.zip` from this release and extract into Foundry's `Data/modules/` directory. The ZIP includes the correct top-level `black-flag-character-background-generator/` folder. Close Foundry before replacing an existing module folder.

**Gemini setup:** Log into the world as GM, open **Game Settings → Configure Settings → Module Settings → Black Flag Character Background Generator**, then enter your own Gemini API key. Players can request AI generation only while a GM with a configured key is online.

**Important upgrade note:** v0.1.5-beta.1 used a version-specific manifest URL and might not detect this beta automatically. Install using the new manifest URL above or replace the module files manually. The [previous beta](https://github.com/ghost00-Ricgames/black-flag-character-background-generator/releases/tag/v0.1.5-beta.1) remains available for rollback.

## Compatibility and known constraints

- Foundry VTT v14, including v14.370.
- Black Flag / Tales of the Valiant system 3.0.075+ (developed and tested with 3.0.079).
- Requires working Gemini API access, a valid key, usable model quota, and an active GM client.
- Generated details remain subject to player/GM review; saving writes only approved content into the actor's backstory field.
- Text and optional compressed custom character artwork are transmitted to Google's Gemini API. Default placeholder art is automatically skipped.
- Automated regression suite runs in a mocked Foundry environment; the v0.1.6 development build has also been successfully tested by the module author in Foundry. Back up your world before installing a beta.

Report issues with module version, Foundry version, Black Flag system version and redacted error messages. **Never post your Gemini API key.**

Full setup and privacy details: [README](https://github.com/ghost00-Ricgames/black-flag-character-background-generator/blob/v0.1.6-beta.1/README.md).
