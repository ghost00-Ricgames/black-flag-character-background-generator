# Black Flag Character Background Generator

**v0.1.1 testing baseline** for Foundry VTT **14.369** / Black Flag system **3.0.079** (system minimum **3.0.075**). This is an unreleased development build.

## Install and launch

1. Extract the installable ZIP directly into your Foundry `Data/modules/` directory. The archive already contains its own `black-flag-character-background-generator/` directory.
2. Restart Foundry, enable the module in a **test** Black Flag world, and log in as GM.
3. Open **Game Settings → Configure Settings → Module Settings** and re-enter your Gemini API key. **v0.1.1 switches the key to client-local storage:** previously configured world-scoped keys will not be read. Each GM browser that handles requests needs its own key.
4. Open a Black Flag **PC** sheet. In its window header controls menu, choose **Generate Character Background** (book icon).
5. Alternative: **Ctrl+Shift+B** opens the generator for a controlled PC token or the first PC you own. Customize the shortcut under Configure Controls if necessary.

This module works with Black Flag's `pc` actor type, not a D&D `character` actor.

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
