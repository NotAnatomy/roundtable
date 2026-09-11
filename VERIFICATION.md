# Roundtable 0.6.0 verification

`npm test`: 43 passed, 0 failed. Tests make no paid model calls and no live GitHub calls.

Coverage includes:

- Real local HTTP server with fixture native CLIs: one reply per selected agent, later speakers see earlier replies, incremental resumed prompts, room switching during generation, interruption, persistence and retry in place.
- Codex thread and turn sandbox types, late item completion, reported usage.
- Claude CLI stream-image input and reported usage; Antigravity stream protocol and pinned effort handling.
- Bootstrap launch-secret gate, request authorization, Host/Origin protection and secret redaction.
- Gateway environment cleanup, workspace guards and resolved symlinks.
- Exact serialized transcript capacity, older attachment metadata and code-aware mentions.
- Image storage, content deduplication, invalid-file rejection and Google/AgentRouter image request formats.
- Actual client helpers for persistent drafts, room-switch attachment races, send completion preserving edited text and isolated delta updates.
- Actual safe Markdown DOM construction, including inert script text, rejected javascript links, no remote images and hidden reference definitions.
- Retention: completed replies lose their retry file, failed, interrupted and in-flight replies keep it, unreferenced uploads older than the grace period are swept, and deleting a room removes only the uploads no remaining room references.
- Archive and delete against the real server: archive clears native sessions and keeps messages, both actions are refused while the room is replying, delete requires the exact title, archived rooms refuse new messages, and deleting every room leaves a usable empty one.
- A shared notes edit between turns keeps the incremental native prompt instead of resending the transcript.
- Decoded media bytes per request are bounded independently of page count.
- Generated avatars are deterministic per agent ID, differ between agents, build only SVG namespace elements and contain no image or external reference.
- Voice with a mocked fetcher: dictation request shape and transcript extraction, key redaction, PCM to WAV framing, Markdown stripping for speech, the browser WAV encoder's header and sample scaling.
- Skill import with a mocked fetcher: raw SKILL.md, repository listing without body fetches, folder scoping, depth and result caps, rejected hosts, credentials, redirects, oversized responses, rate limit responses, and the instructions-only limitation carried into the saved skill and the agent prompt.

Additional local check: PDF.js extracted known text and rasterized a real one-page PDF containing text and graphics. The check used the runtime's installed canvas library, not an application dependency. It caught missing modern-engine functionality; the bundled PDF.js legacy compatibility build resolved it.

0.5.0 was also exercised in a local browser against a scratch data directory: the generated avatars rendered in the roster, Import from URL listed 20 skills from the public anthropics/skills repository in two GitHub API requests, the docx skill preview showed the scripts/ limitation with nine flagged lines and saved with that note, archive moved the room into the Archived section and created a replacement, the delete button stayed disabled until the exact title was typed, and delete closed both dialogs with no console errors at 1440px and 375px widths. Pressing Enter in the URL field was not exercised by the automation; the Fetch button was.

0.6.0 browser check against a scratch data directory: the shader rendered behind the conversation at 640x400 and was removed and restored by the Preferences toggle, the ⋯ room menu listed Archive, Export and Delete, the mic button rendered and explained the missing Google connection, and the Google connection form showed the voice settings. Live dictation, live read aloud and microphone capture were not exercised because no Google key is configured in the scratch instance.

Not verified in 0.4.0: complete browser workflows or rendering on the user's Mac. The cloud browser rejected access to the local server with ERR_BLOCKED_BY_CLIENT. No visual QA or live subscription/API inference is claimed. Adapter fixture success does not establish account availability or AgentRouter client authorization.

Tests were added after the implementation changes. No before-fix frontend test results are claimed. Existing assertions were kept or updated where authentication and additive usage fields intentionally changed the contract. During testing, a fixture incorrectly inspected the first JSON array in a prompt instead of the transcript; it was corrected to select the final transcript array.
