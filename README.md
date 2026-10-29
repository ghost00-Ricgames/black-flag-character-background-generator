# Black Flag Character Background Generator

Early **v0.1.0 development prototype** for Foundry VTT v13 and Tales of the Valiant.

## Planned experience
Character sheet → structured form → adaptive Gemini interview → editable story, roleplaying profile, relationships, secrets and adventure hooks → explicit save.

## Current limitations
This first scaffold provides a **GM-only prototype** of character extraction, a basic form, and one-shot Gemini JSON generation. It does **not yet** implement adaptive questions, player-to-GM request routing, approval, editing, biography saving, or secure credential isolation. Do not install as a production-ready release.

## Configuration
Configure a Gemini API key and model in Foundry module settings. Only trusted GMs should handle the key. Browser-based requests are not a secure server-side proxy. A compatible model can be discovered using the `GeminiService.models(key)` helper in development; the UI picker is not yet implemented.

## Distribution
GitHub Releases only. The published release must attach `module.json` and `black-flag-character-background-generator.zip` with the module manifest at the ZIP root. No release is published by this scaffold.

## Development
Keep changes on `development/v0.1.0` until reviewed and tested in Foundry. Mechanical character fields are system-dependent; imported fields must be verified by the user.
