# Black Flag Character Background Generator v0.1.5-beta.1

**First public beta** for Foundry VTT 14 and the Black Flag Roleplaying game system (Tales of the Valiant).

> **Requires your own Google Gemini API key and access to a supported Gemini model.**
> Obtain a key at https://aistudio.google.com/apikey. Google API usage is subject to your account's quotas, availability and possible charges. No key is bundled.

## Installation

**Foundry manifest URL** (Install Module → Manifest URL):
```
https://github.com/ghost00-Ricgames/black-flag-character-background-generator/releases/download/v0.1.5-beta.1/module.json
```

**Manual installation:** Download `black-flag-character-background-generator.zip` from this release and extract it into your Foundry `Data/modules/` directory. The ZIP already includes the enclosing `black-flag-character-background-generator/` folder. Restart Foundry and activate the module.

**Set up your Gemini key:** As GM, open **Game Settings → Configure Settings → Module Settings → Black Flag Character Background Generator → Gemini API Key**. Each GM browser needs a configured key. The GM must remain online to process player AI requests.

## Beta features

- Create AI-assisted Tales of the Valiant backstories through a guided questionnaire and adaptive Gemini follow-up questions.
- Import and edit multiple classes/subclasses, talents, lineage, heritage, background, skills, tool proficiencies and physical traits before generation.
- Optionally analyze **custom PC portrait art** to inspire visible character details. Black Flag and Foundry placeholder portraits are skipped; unreadable/oversized portraits fall back to text-only generation.
- Generate character history, roleplaying profile, relationships, secrets and adventure hooks.
- Review/edit and regenerate before saving approved content to the PC's backstory.
- Gemini 3.8 Flash Interactions API with bounded retries and configurable fallback model for overloads.

## Compatibility and limitations

- Foundry VTT **14** (tested with **14.369**).
- Black Flag system **3.0.075+** (verified with **3.0.079**).
- Requires a working Google Gemini API connection; model rate limits, availability and API charges are outside this module's control.
- Physical characteristics suggested by Gemini are **not automatically saved** to the actor. Only approved biography content is saved.
- Custom portrait analysis only supports Foundry-hosted raster images; remote and default portraits are skipped.
- This is a **beta release**. Please test in a non-critical world and keep a world backup.

**Privacy:** Character questionnaire details and any opted-in compressed portrait are sent to Google's Gemini API. Do not share your Gemini API key. See the [README](https://github.com/ghost00-Ricgames/black-flag-character-background-generator/blob/v0.1.5-beta.1/README.md) for setup and detailed caveats.

Report issues with the module version, Foundry version, Black Flag system version and redacted error text. **Do not include API keys.**
