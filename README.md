# Roundtable 0.9.0

A local group chat with one to four agents. You send a message, each selected agent replies once in order, then the room stops until you send another message. Later speakers see earlier replies. A routine can send a message for you on a schedule, and the room then takes that same single turn. No autonomous continuation button or background conversation loop.

## Update on your Mac

1. Stop the old Roundtable Terminal with Control+C.
2. Unzip the new archive and replace the old application folder. Keep your `~/.roundtable` data folder.
3. Open Terminal in the new `roundtable` folder and run `npm start`, or run `Start-Roundtable.command`.
4. Open the private launch link printed in Terminal. The launcher opens it automatically. A plain localhost link no longer grants access. After a server restart, use the new link.

Node.js 22 or newer is required. No npm install is needed. Marked and PDF.js are bundled with their licenses, fonts and decoders. No npm install is needed. Existing Codex and Claude logins are reused. Existing `room.json` is migrated into `rooms.json`; the original file remains untouched. Your chat and shared notes are preserved. Old archived conversations are left untouched but are not imported into the room list.

## Rooms and conversation

New room opens a setup form: choose one to four agents, provider, model, reasoning effort, name, job and instructions. Load available models from the provider or enter its exact model ID. Codex and Claude can use their configured default. Antigravity supports default or a slug from `agy models`. API participants require an explicit model ID.

Reasoning effort is model dependent, not a guaranteed latency setting. Provider default is the safest starting point. AgentRouter uses model selection for speed; custom effort is not sent. Google supports configured effort mappings for Gemini 3 and 2.5 families only.

The left sidebar switches between saved rooms, including while another room is replying. You can edit notes, skills and pins during generation. Agent settings and another send remain locked only in the generating room. Concurrent project work is rejected when folders overlap and either room permits edits. On a narrow screen, use the menu button. Shared notes and agent roles are room specific. The To menu selects one agent or everyone. Routing ignores mentions in code, URLs and email addresses, and reports when a real mention overrides To. You can also use the exact @ID shown in participant settings. Mentions in agent replies never trigger another turn. Pause interrupts the current reply and cancels remaining speakers. Wait for it to finish before sending your correction.

Each CLI participant has a separate native session. The first native turn includes successful room history and labeled peers. Later native turns resume that agent’s own session and send only shared messages since its last successful reply. Editing shared notes, skills, an agent’s name, job or instructions keeps the session, because those travel in every prompt. Changing an agent’s provider, model or effort, the room mode, the project folder or edit permission starts a fresh native session. Each participant has its own ten minute turn limit. API agents are stateless and receive successful room history. Earlier agents see later agents' replies on your next message. Failed and interrupted replies stay visible but are excluded from context. The same serialized transcript budget is checked before accepting a message and before each reply. At 75% capacity the context panel shows usage. Continue in a new room carries forward the decisions and next steps you enter, preserving the old conversation. Older attachment contents become metadata after three user messages; attach them again when exact contents are needed. Export creates a Markdown copy of the current conversation.

## Archive and delete rooms

Hover a room in the list and use its ⋯ menu to archive, export or delete it. Room settings also ends with Room actions. Archive keeps every message, drops the room’s native CLI sessions and moves it into a collapsed Archived section at the bottom of the room list. Archived rooms do not count toward the 50 active room limit. Open one to read it; Unarchive to continue, at which point agents start fresh sessions. Delete asks you to type the room name, offers an export first, then removes the room, its retry context and any uploaded file that no other room references. Both actions are refused while that room is replying. If the last active room is archived or deleted, an empty room is created so the app always has one.

## Connections

Codex and Claude Code use their official CLIs. Run `codex login` and `claude` in Terminal if needed. Check connections verifies that a binary runs, not whether your account can complete a paid or subscription model request. The first message checks that live access.

Google API: enter your Gemini API key in Connections, then load models in room settings. Keys are sent only to Google's fixed API host.

AgentRouter API: enter your key, https://agentrouter.org, and choose Anthropic messages for the Claude setup. Roundtable adds /v1 to a bare host and sends Authorization: Bearer for this gateway. Existing URLs ending in /v1 remain unchanged. The adapter restricts URLs to agentrouter.org and its subdomains and rejects redirects. The public documentation could not be verified in this build environment. Treat this as a configurable compatibility adapter, not a verified live integration. If your dashboard documents another hostname or protocol, this version needs an adapter update. Do not substitute an unrelated endpoint.

Antigravity: install Google's official `agy` CLI and sign in there. Roundtable uses its documented headless JSON protocol and cached native login, with terminal sandboxing enabled and no auto-approval flag. Model and account availability depend on your Google plan and native CLI settings. This adapter has protocol-fixture coverage but no live Google account test.

API keys are stored in `~/.roundtable/connections.json` with user-only file permissions. This is a plaintext private local file, not macOS Keychain. Keys are never returned to the browser after saving or included in exports. Leave the password field blank to retain the saved key. Remove key disconnects that API provider. Enter keys only in your local Connections form.

## Project assistance

Lounge is for discussion. Claude's built-in tools are disabled there. Codex uses its read-only sandbox in a dedicated lounge folder. Work requires an existing absolute project folder. Root, home, system and common credential directories are rejected. Symlinks are resolved and the resolved folder appears in the Work caption. Enabling edits asks you to confirm that folder. Codex and Claude start with file inspection only; optional edits are enabled in room settings. Claude has Read, Glob and Grep, plus Edit and Write when enabled, without Bash. Codex write mode uses its workspace sandbox with network access disabled. Additional approval requests are declined.

Google and AgentRouter API agents are chat-only: they have the room transcript but no local file tools. Antigravity is available in Lounge only because the adapter cannot yet enforce the room's project editing permissions. Its native tool settings still apply in Lounge. Role instructions describe a job, not installed tools or plugins.

Agents take turns, including file work. Stopping does not undo edits. Native CLI plugins, hooks and configuration can affect tools and permissions. A project folder is not a virtual machine.

## Storage and privacy

Rooms and native session IDs live in `~/.roundtable/rooms.json`. The app listens only on 127.0.0.1, checks Host and Origin, and uses a per-process request token. Subscription tokens stay inside the official CLIs. Native child processes strip the following environment variables to avoid inherited API/gateway routing:

`ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL`, `ANTHROPIC_SMALL_FAST_MODEL`, `ANTHROPIC_CUSTOM_HEADERS`, `ANTHROPIC_DEFAULT_OPUS_MODEL`, `ANTHROPIC_DEFAULT_SONNET_MODEL`, `ANTHROPIC_DEFAULT_HAIKU_MODEL`, `CLAUDE_CODE_USE_BEDROCK`, `CLAUDE_CODE_USE_VERTEX`, `CLAUDE_CODE_USE_FOUNDRY`, `CLAUDE_CODE_USE_AWS`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_ORGANIZATION`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`.

Connections shows the number present at launch, never their values. Native CLI configuration files, plugins and hooks can still affect routing, permissions and billing; environment cleanup does not override those files. A private launch URL is saved in `~/.roundtable/launch-url.txt` with mode 0600. Bootstrap requires its secret or an existing request token, and SSE requires a request token. The browser stores the token in sessionStorage and removes the secret from the address bar. This protects against unauthenticated local callers and other operating-system users who cannot read the private file; it cannot isolate another process running as your same user.

Every selected provider receives the shared transcript. Local storage does not mean model inference is local. Multiple participants using one account share that account's limits. This release has no Slack integration, cloud hosting or remote Mac control. Routines are the one thing that starts a turn without you present; they are described below.

## Verification and troubleshooting

Run `npm test`. Tests exercise the real HTTP server with labeled provider fixtures and mocked API responses. They cover the Codex sandbox wire formats, detection, one reply per user message, peer context, interruption, separate rooms, migration, API formats, key redaction and request authorization. No paid model calls are made by these tests. Live account responses have not been tested. Functional cloud-browser access to localhost was blocked, so full browser interaction and Mac rendering remain unverified. A local renderer check extracted text and rasterized a real PDF using the bundled PDF.js engine.

The Codex correction is retained: thread start/resume send `read-only` or `workspace-write`; turn policy uses the separate `readOnly` / `workspaceWrite` object types. These are intentionally different protocol fields.

If detection fails, run `codex --version`, `claude --version` or `agy --version` in the Terminal used to launch the app. Override a binary path with `ROUNDTABLE_CODEX_BIN`, `ROUNDTABLE_CLAUDE_BIN` or `ROUNDTABLE_AGY_BIN`. If a stored session cannot resume, create another room with the relevant shared notes. Errors are shown without simulated replacement replies.

If port 4317 is occupied, stop the old server or run `PORT=4318 npm start`. Set `ROUNDTABLE_DATA_DIR` to relocate storage. Keep Terminal open and the Mac awake while agents reply.

## References

- [Codex app server](https://learn.chatgpt.com/docs/app-server)
- [Claude Code CLI](https://code.claude.com/docs/en/cli-reference)
- [Google models API](https://ai.google.dev/api/models)
- [Google content generation](https://ai.google.dev/api/generate-content)
- [Antigravity installation and authentication](https://antigravity.google/docs/cli/install/)
- [Antigravity headless protocol](https://antigravity.google/docs/cli/headless/)

## Version 0.2.1 connection correction

The user supplied [this setup guide](https://skilltrek.dev/how-to-use-claude-code-for-free-with-agent-router-api-in-vs-code/), which specifies the AgentRouter host and ANTHROPIC_AUTH_TOKEN. Anthropic documents the corresponding [gateway protocol](https://code.claude.com/docs/en/llm-gateway-protocol). This establishes a configuration to test, not verification of AgentRouter model availability or a live request. The adapter now uses Bearer authentication and accepts a bare host without sending requests to the wrong path.


## Formatting and collaboration

The conversation now renders Markdown lists, emphasis, headings, tables, links and code blocks. Inline code remains inline; code blocks have copy controls. Raw HTML is not executed and remote Markdown images are not loaded. Existing stored replies receive the new formatting when displayed.

The interface now has a room search, a context sidebar, readable mention labels and a composer plus menu. Use + to attach images, PDFs, text/code, open Skills, add an agent or edit notes. Drafts and pending file references survive room switches and page reloads using browser localStorage. Clearing browser storage removes these drafts.

Agent avatars are generated inline SVG marks derived from each agent ID, tinted by provider, so the same agent looks the same in every room and no image is loaded. The ring turns slowly only while that agent is replying and is desaturated when its last reply failed or was interrupted; both respect the reduced motion setting. macOS system dictation also works in the composer; set its shortcut in System Settings, Keyboard, Dictation.

## Routines

A routine is a message you wrote, sent to a room on a schedule. When it fires, the room takes its ordinary turn: one reply from each selected participant, then it stops. A routine cannot start a second turn, and a reply cannot start one either. This is the only thing in Roundtable that begins a turn while you are away.

Schedules are repeating (every N minutes, at least 15), daily at a time with an optional weekday or weekend filter, or once at a date and time. Times are your Mac's local time. The spec this was modelled on also offers cron and event triggers from GitHub, Slack and similar; those are not here. Event triggers need an inbound address, and Roundtable listens only on 127.0.0.1, so nothing outside your Mac can reach it.

Rules that bound a routine:

- **A room that allows project edits cannot carry one.** Roundtable grants file tools per room rather than approving each action, so an unattended turn would be able to write to your project with nobody there to approve it. Turn edits off in Room settings to use a routine with a Work room; read-only Work rooms are fine.
- Each run spends the same provider quota as a message you send. The minimum repeat interval is 15 minutes and you can save up to 20 routines.
- A run is skipped, not queued, when its room is replying, archived, deleted, or has no enabled participants. After three runs that could not start, the routine pauses itself and says why.
- Runs missed while Roundtable was closed are not backfilled. The routine runs at its next scheduled time.
- Test sends the message immediately so you can see what a run does before leaving it to the schedule.

A routine's message appears in the transcript as an ordinary message from you, labelled with the routine's name. Upcoming runs are listed in the room details panel.

## Secrets

A secret is a value your agents' commands can use but your agents never see. It is an environment variable given to Codex, Claude or Antigravity when they run in a room you assigned it to, so a command they run can read it.

- The value is never put in a prompt. The agent is told the name and your description, so it knows what exists and what it is for.
- The value is removed from a reply, from an activity label and from an error before any of them is stored, shown or passed to the next participant, in case a command printed it.
- Values live in a private file in your Roundtable data folder with user-only permissions, never in `rooms.json`, never in the browser, and never in an export.
- A name must be a valid environment variable name. Names Roundtable strips to keep each CLI on its own login, such as `ANTHROPIC_API_KEY` or `OPENAI_BASE_URL`, are reserved, as are names that control how a process loads code, such as `PATH` and `NODE_OPTIONS`. A secret cannot be used to redirect an agent to another provider or to preload code into it.
- Values are 8 to 4,096 characters. The floor exists because redaction works by matching the value in output, and a very short value would match ordinary words.
- API participants run no commands, so they are never given secrets. Changing a room's secrets starts fresh native sessions, because a resumed agent would otherwise keep an environment it no longer has.

### What is not here, and why

The spec this was modelled on also has a Vault of website logins, card numbers and contact details. That feature exists there because that app drives a browser on its own machine and types the values into real web pages, which is what lets it promise that the model never sees them. Roundtable has no browser and no computer use: its agents are two command-line tools and some chat-only API participants. A stored password here could only ever be used by putting it into a prompt, which is the one thing the original design exists to prevent. Storing card numbers and website passwords in a plain local file, to deliver less safety than the password manager already on your Mac, is not worth doing, so it is deliberately absent. Secrets above are the part of that idea that does hold: a value that reaches the work without reaching the model.

## Agent characters

Each agent is drawn as a small character: one of eight silhouettes picked from its ID, a two-stop gradient from its provider, and two eyes. The character reacts to what the agent is actually doing. It breathes and blinks while idle, sways with narrowed eyes while thinking, bobs while a tool runs, pulses while text streams, hops once when a reply lands, desaturates when a reply failed, and closes its eyes in an archived room or when a participant is disabled. Nothing is loaded from outside the page and nothing animates in an idle room. The motion is CSS driven by one state attribute, so your system's reduced-motion setting or the Reduce motion preference stops all of it.

## Command palette, find and shortcuts

Press the command key with K for a palette over rooms, skills and actions: create, settings, skills, connections, preferences, export, notes, reset, archive, delete. Type to filter, arrows to move, Enter to run.

| Action | Keys |
|---|---|
| Command palette | ⌘K |
| New room | ⌘N |
| Room settings | ⌘, |
| Skills | ⌘⇧W |
| Focus the composer | ⌘I |
| Find in conversation | ⌘F |
| Dictate | ⌘⇧M |
| Toggle the room list | ⌘B |
| Toggle room details | ⌘⌥B |
| Go to room 1 to 9 | ⌘1 … ⌘9 |
| Previous / next room | ⌥↑ / ⌥↓ |
| Keyboard shortcuts | ⌘/ |
| Close anything open | Esc |

Find in conversation searches the message text the server sent rather than the rendered nodes, so Markdown structure and a streaming reply cannot desynchronise the matches. It reports a position in the match list and flashes the message it scrolls to.

## Unread rooms and notifications

A room you are not looking at shows a count of messages added since you last had it open. The marker is per browser. A room you have never opened starts read, so an existing install does not light up every row at once, and a room that was reset never shows a negative count. Preferences can also show a desktop notification when a background room finishes a turn; the browser asks for permission the first time you turn it on, and the preference stays off if it is refused.

## Reset a conversation

Reset clears a room's messages and pins and drops its native sessions, while agents, skills, shared notes, project folder and mode stay exactly as they were. Attachments only that room referenced are deleted with it; anything another room still uses is kept. A room that is replying refuses to reset.

## Task list

While a native agent works, its reply shows a task card and the right rail shows Working now. Rows come from what the CLI actually reports: each Claude tool call (Read, Grep, Edit, and so on) and each Codex command or file change becomes a step that ticks when its result arrives. When the agent publishes a plan (Claude's TodoWrite, which is allowed in Work mode because it touches no files, or Codex's plan updates), the plan becomes the top level and tool calls nest under the step in progress. Counts are derived from the rows. The card stays open while the reply is live, folds to a step count on completion, and is kept with the message so history shows what was done. Tool steps settle when the turn ends; plan steps keep the status the agent last reported. Lists are bounded to 40 steps and 6 nested calls per step, with an "earlier steps" note when older rows are dropped. API agents have no tools, so they show no card.

## Voice

The mic button in the composer (or Command+Shift+M) records up to 60 seconds locally as 16 kHz WAV, then sends the recording to Gemini with your saved Google key for transcription. The transcript is inserted at the cursor as editable text and is never sent as a message on its own. Listen on a completed reply asks a Gemini TTS model to read it aloud; code blocks are skipped and long replies are read up to 4,000 characters. Both features need a Google Gemini key in Connections, where you can change the dictation model (default gemini-2.5-flash), the voice model (default gemini-2.5-flash-preview-tts) and one of the prebuilt voices. Audio and text go to Google's API host only; Roundtable stores neither. The button is hidden when the browser has no microphone API and explains itself when Google is not connected. These paths have protocol tests with mocked responses; they were not exercised against a live Google account in this build.

## Appearance

Preferences in the sidebar toggles an animated background: a WebGL shader with three slow, low-contrast lobes and faint grain behind the conversation, rendered at most 640 pixels wide at 30 frames per second, paused while the tab is hidden and held still when the system asks for reduced motion. The preference is saved in the browser. Without WebGL the background stays flat.

Skills lets you create, edit, delete or import reusable instructions from Markdown. Assign them in individual agent settings. These are instruction skills, not executable native packages: referenced scripts, assets and permissions are not installed. Deleting a skill also removes its assignments.

Import from URL accepts a public GitHub repository, a folder inside one, or a direct SKILL.md link, in the open Agent Skills format that most skill galleries use. The server fetches from github.com, raw.githubusercontent.com and api.github.com only, over https, without following redirects, with a 15 second timeout and a response size cap. A repository link lists SKILL.md files up to three folders deep (at most 50) without downloading their bodies; choose one to preview it in the editor before saving. When the package also contains scripts, references or assets, the preview says so, lists the instruction lines that refer to those files, and the saved skill keeps an Instructions only note on its card, in the agent picker and in the agent’s prompt. Instructions longer than 12,000 characters are cut and flagged. Unauthenticated GitHub access allows 60 requests per hour. Pin completed messages to find decisions in the context sidebar. Settings include controls to change reply order.

Antigravity models ending in low, medium or high no longer receive a second conflicting effort flag. This also protects existing saved rooms. Model discovery now runs the installed agy models command. Live account access remains unverified.

AgentRouter's reported unauthorized client detected rejection remains unresolved externally. It is now distinguished from an ordinary credential failure. The app does not impersonate another client or attempt to evade that rejection. Connections includes an explicit saved-connection test with a model ID, short prompt, output limit and timeout. This can incur provider usage and requires a click. A failed model listing is not presented as a working connection.

Read [RESEARCH.md](RESEARCH.md) for the evidence, design decisions, limits and next priorities. No live remote Mac update or paid model test was performed in the build environment.


## Images and PDFs

Attach up to three files. Images (PNG, JPEG or WebP) are resized to a maximum 1,600 pixels on the long edge and converted to JPEG locally. PDFs keep their original file and are rendered locally into one image per page, with extracted text for reference. Image/PDF originals must be under 6 MB; PDFs support up to six pages, at most 12 MB including rendered pages. Split longer documents first. Extracted PDF text is capped at 24,000 characters, while all accepted pages are still sent as images. Text/code files are capped at 24,000 characters each, with 40,000 text characters across a message’s files.

Codex and Claude receive native image inputs; Google receives inline image parts. AgentRouter supports the corresponding image request formats when its client authorization and the selected model support vision. Antigravity media is not implemented and requests are rejected before sending if it would receive attached media. API participants cannot open your project folder.

The last three user messages supply media to stateless requests and new native sessions. Resumed native agents receive only new attachments since their checkpoint. Identical media is stored once by content hash under `~/.roundtable/uploads`; room snapshots contain references, never base64 payloads. At most 20 recent image pages can be sent in a request. Reattach an older file if needed. File chips download the locally stored version; image downloads are the resized JPEG. Retry context for a completed reply is removed as soon as it finishes; failed and interrupted replies keep theirs. At startup and once a day, uploads that no room references and that are older than seven days are removed, so a file attached to an abandoned draft does not stay forever. One request may carry at most 20 image pages and 10 MB of decoded image data across the recent attachments; the message is refused before any provider call if either limit is exceeded. Local files are sent to selected providers only when you send a message.

## Streaming, retries and usage

Named SSE state events carry full snapshots only at lifecycle changes. Streaming delta events contain only room/message IDs, current reply text and activity, throttled to 60 ms with a completion flush. They update one message without rebuilding the room list or context panel. Selected reply text is left intact until the selection is released.

A failed or interrupted agent reply has a Retry button. It retries only that agent, in place, using the saved original prompt context and a fresh native session. It does not roll back earlier file edits or guarantee identical provider output. Changed project permissions block retries. Replies created before this release have no saved retry context. Retry requests are stored privately in `~/.roundtable/requests` and can include the original transcript.

Reported token counts and provider cost estimates appear below replies and in the context panel. Missing values stay blank. A provider estimate is not an invoice or an extra charge against a subscription; room figures sum the usage the adapters receive, including recorded retry attempts. These figures are not a complete account billing meter.

Work prompts tell agents to reuse prior findings, inspect only relevant files and verify before editing. Native binary resolution is cached briefly. This reduces avoidable context and startup overhead, but agents may still reread changed or necessary files; provider reasoning time and rate limits remain outside Roundtable’s control.
