# Black Flag Character Background Generator

**First testing baseline (unreleased)** for Foundry VTT **14.369** and Black Flag **3.0.079**.

## Current functionality
- Character sheet action for owned character actors (subject to verification against the Black Flag sheet).
- Editable lineage, heritage, background, class and level; system item fallback extraction.
- Initial questionnaire and Gemini-generated adaptive follow-up questions.
- GM-mediated player Gemini requests while an active GM is connected; no API key sent to players.
- Complete structured package with history, profile, relationships, secrets and hooks.
- JSON draft editor, regeneration with direction, and save to a detected biography field.
- Optional GM approval for player saves and configurable player request limit.

## Setup
1. Install a test build into Foundry's modules directory, or use a published GitHub Release manifest once available.
2. Enable the module in a **test world** using Black Flag 3.0.079.
3. As GM, enter a Gemini API key and a generateContent-compatible model ID in module settings.
4. Open an owned character sheet and select the book icon in the header.
5. Fill the initial questions, ask follow-ups, generate, review, and save.
6. Connect a separate player client with an owned character to test GM-mediated generation.

## Important caveats
- This is **not verified** in a running Foundry v14 instance; do not use in a live campaign yet.
- The API key lives in Foundry's GM-readable world settings and is accessible to the trusted GM browser. This is not a secure backend proxy.
- Player requests require an active GM client. GM approval uses a modal on that GM client.
- Actor schema extraction and biography save paths require validation with Black Flag 3.0.079 actor exports.
- Gemini model ID is GM-configurable in settings; a graphical model picker is pending.
- Edits are JSON-based for this testing baseline; polished section editing and resumable drafts are pending.
- The package's GM-suggestion secrets are omitted from the player biography; they are still visible in the draft editor. Do not enter hidden campaign secrets in player-safe context.
- GitHub Actions packages and validates builds; releases are published only from explicit version tags.
- GitHub Releases are the only distribution channel. No Foundry package registry submission is planned.

## Test checklist
- [ ] Module loads in Foundry v14.369 with Black Flag 3.0.079 without console errors
- [ ] Character header action appears for GM and owning player
- [ ] Lineage, heritage, background, class and level match actual character data
- [ ] Gemini interview produces a question and records the answer
- [ ] Complete package generates and can be revised
- [ ] GM can save biography without losing other actor fields
- [ ] Player request succeeds with GM online, fails clearly with GM offline
- [ ] Non-owner cannot generate or save another player's character
- [ ] GM approval setting blocks unauthorized save
- [ ] Player never receives the API key

## Development
Branch: `development/v0.1.0`. Draft PR #1. Keep `main` untouched until tested.
