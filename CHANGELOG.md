# Changelog

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
