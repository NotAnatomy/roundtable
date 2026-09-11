# Changelog

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
