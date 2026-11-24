# Changelog

## 0.10.0

### Added

- Browser: a real Brave, Chrome or Edge window, launched in a profile of Roundtable's own, that Codex and Claude drive one step at a time through an `rtbrowse` command put on their path only while their own turn runs. Open, read, click, type, press, scroll, wait, back, forward, reload and screenshot. Every step answers with the page that resulted.
- Saved sign-ins: a name, a site, a username and a password that Roundtable types into the page itself. The agent is told the name and the site, never either value, and both are removed from anything it reports. A sign-in is typed only when the page in front of the browser is that exact origin.
- A Browser section in the room details panel with the live page, a screenshot of it and the steps taken, and the steps taken during a reply are kept with that reply.
- Per-room Browser permission in Room settings, a Browser dialog to open, close and delete the window's browsing data, and a Browser entry in the command palette.

### Changed

- Static assets are served with `Cache-Control: no-store`, so an upgraded server is never paired with a cached `app.js`.
- The README no longer says Roundtable has no browser. The vault's website logins, declined in 0.9.0 for exactly that reason, are now the saved sign-ins above. Card numbers are still deliberately absent.

### Notes

- Only `open` can start a window; every other step needs a page already in front of the browser. Only http and https, downloads blocked, Roundtable's own address refused, local and private addresses refused outside a Work room, forty steps per turn.
- A page is untrusted text: each agent is told that instructions written on a page are never its instructions, and that nothing on the web is permission to buy, send, post or agree to anything.
- API participants run no commands and Antigravity runs in its own sandbox, so neither can browse.

## 0.9.0

### Added

- Routines: a message you wrote, sent to a room on a repeating, daily or one-off schedule, which then takes one ordinary turn. Pause, resume, test and delete; upcoming runs in the room details panel; the injected message is labelled with its routine.
- Secrets: write-only values put in the environment of a native agent's process in rooms you assign them to. The name and description reach the prompt, the value never does, and it is redacted from replies, activity labels and errors.

### Changed

- The README no longer claims there is no unattended scheduler. Routines are one, bounded as described there.

### Notes

- A room that allows project edits cannot carry a routine; there is nobody present to approve a file change.
- Website logins and card storage from the source spec are deliberately not implemented. Roundtable has no browser to fill them into, so the guarantee that makes that feature safe cannot hold here.

## 0.8.0

### Added

- Agent characters: a silhouette-and-eyes mascot per agent whose animation follows the real turn lifecycle (idle, thinking, working, streaming, done, failed, sleeping).
- Command palette (⌘K) over rooms, skills and actions, with ranked matching.
- Keyboard shortcuts for new room, settings, skills, composer focus, find, room list, details pane, room 1 to 9, previous/next room, and a shortcuts sheet on ⌘/.
- Find in conversation (⌘F) with match position, next/previous and a flash on the message it reveals.
- Unread counts on background rooms, and an opt-in desktop notification when one finishes a turn.
- Reset a conversation: clears messages, pins and native sessions while keeping the room, its agents and its notes.

### Changed

- The stylesheet is built on a token system: one ink seed with alpha-derived text, icon, border and fill roles, plus 4px spacing, radius, control height, type, duration and easing scales. Depth comes from hairline borders rather than heavy shadows.
- Preferences gained a Reduce motion switch that applies in Roundtable only, alongside the system setting.

## 0.7.0

### Added

- Live task list for native agents: Claude tool calls and Codex items become steps with drawn checks, a travelling underline under the live row, and a plan (TodoWrite or Codex plan) as the top level when the agent publishes one. Shown in the reply and in a Working now rail section; kept with the message.
- Claude may use TodoWrite in Work mode so it can publish a plan. It touches no files.

### Changed

- Work prompts ask agents to publish a short plan for multi-step requests.

## 0.6.0

### Added

- Per-room ⋯ menu in the sidebar with Archive, Export and Delete.
- Dictation: a mic button records locally as WAV and transcribes through the saved Gemini key; the transcript lands in the composer as editable text. Command+Shift+M toggles it.
- Listen: completed replies can be read aloud by a Gemini TTS model with a selectable voice.
- Voice settings (dictation model, voice model, voice) in the Google connection form.
- Preferences dialog with an animated WebGL background that can be switched off; still under reduced motion, paused when hidden.

## 0.5.0

### Added

- Archive and delete rooms from Room settings. Archive keeps messages, drops native sessions and moves the room to a collapsed Archived section; delete requires typing the room name, offers an export first, and removes retry context and uploads only that room referenced.
- Import skills from a GitHub repository, folder or SKILL.md link. Package skills that rely on scripts, references or assets are marked Instructions only in the preview, on the card, in the agent picker and in the agent prompt.
- Generated inline SVG avatars per agent, provider tinted, animated only while that agent is replying, desaturated after a failed reply, still under reduced motion.
- Disk cleanup: retry context is removed when a reply completes; unreferenced uploads older than seven days are swept at startup and daily.
- A decoded byte budget of 10 MB of image pages per request, alongside the existing 20 page cap.
- A help line pointing at macOS system dictation.

### Changed

- Editing shared notes, skills, or an agent's name, job or instructions no longer discards that agent's native session. Only provider, model, effort, mode, project folder and edit permission changes do.
- Each participant now has its own ten minute turn limit instead of one limit for the whole group.
- Sessions belonging to agents removed from a room are dropped when settings are saved.
- Export file names use the room title.
- The version shown in the app comes from package.json.

## 0.4.0

See README.md and RESEARCH.md for the 0.4.0 notes.
