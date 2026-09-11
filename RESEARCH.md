# Roundtable product research and design decisions

## Product direction

Roundtable should make a small group of separately configured agents understandable and useful in one conversation. The core experience is a person asking a question, each selected participant contributing once, and the room returning control to that person. The product should make roles, shared material, available tools and connection status visible without turning every conversation into a configuration exercise.

The recommended direction is a three part desktop workspace: a quiet room list, a readable central conversation, and a compact context panel. The context panel contains the roster, selected skills, shared notes and pinned decisions. On narrow screens the two side areas become optional drawers. The conversation and composer remain the primary surface. This is a design recommendation, not a claim that a particular arrangement has been measured to improve productivity.

The supplied Grokbot reference is useful as a visual example of clear navigation, differentiated participants, a composer plus button and a contextual side area. Its visible routines and computer screen should not be copied into Roundtable as decorative promises. Those elements imply scheduling and computer control, capabilities this release does not provide. The reference is evidence of the requested visual direction, not independent verification of another product's advertised capabilities. [1]

## Findings from the reported failures

| Observation | Supported diagnosis | Product response | Remaining uncertainty |
|---|---|---|---|
| Claude replies contain visible bold markers, backticks and list syntax | The previous renderer supported fenced code only and left most Markdown literal | Render semantic Markdown with readable typography and separate code controls | Model content can still be poorly written even when correctly rendered |
| Antigravity rejects a model ending in `high` with separate `medium` effort | The exact runtime error identifies two contradictory selections | Preserve the exact model ID and omit the additional effort flag when its suffix specifies effort | Live access still depends on installed CLI version, login and model availability |
| AgentRouter reports HTTP 401 and unauthorized client detected | The service rejected this application on the model discovery request | Show client authorization separately from ordinary bad key errors and provide bounded diagnostics | The screenshot does not establish whether the account, client policy, endpoint or another provider rule caused the rejection |
| Agent settings have one instructions field without reusable skills | Existing code had no separate skill records or assignment controls | Add a reusable instruction collection with per agent assignment, editing and Markdown import | Executable skill bundles need a separate native integration |
| Composer has no plus menu | Attachments and supporting actions were not available at the point of writing | Add text/code attachment, skills, participant and notes actions | Image and PDF extraction remain outside this release |

The AgentRouter error is particularly important. A successful account login and an enabled token do not establish that an arbitrary application is authorized. The supplied screenshot proves that this request received a rejection; it does not prove that the API key is invalid or that changing the model will help. The previous adapter update corrected URL and authentication construction, but that correction was not evidence of a successful live connection. [1]

## Provider configuration and compatibility

### Antigravity

Google documents a model listing command and shows identifiers that already include reasoning levels. It also documents the headless JSON event protocol used by the adapter. These support runtime model discovery and exact model selection rather than a static list of guessed model names. [2]

The product rule is that an explicit model variant takes precedence over the separate effort selector. For a model ending in `low`, `medium` or `high`, the selector becomes unavailable with an explanation. At the adapter boundary, the extra effort flag is omitted even for old room data that still stores a conflicting value. This makes the correction apply before the room is edited again.

A base model without one of these suffixes can still receive a supported separate effort value. The model list comes from the installed CLI, so availability is not inferred from marketing names. Discovery has a timeout and returns a useful failure if the installed output cannot be recognized. This parser follows the currently documented plain text layout; future CLI output changes may require an update.

Antigravity remains restricted to Lounge because the adapter does not yet enforce the room's project editing permission. Terminal sandboxing alone should not be presented as proof of read only project access. Native tool configuration can still affect a Lounge session. The connection screen describes installation separately from successful authentication.

### AgentRouter

The supplied third party tutorial names `https://agentrouter.org` as the Claude base URL and uses `ANTHROPIC_AUTH_TOKEN`. It provides a configuration lead, not authoritative confirmation that all custom applications are permitted. Its free credit and model claims are not relied on for product behavior. [3]

Anthropic's own documentation maps that token variable to the Bearer authorization header and documents the Messages endpoint under `/v1/messages`. The previous patch aligned Roundtable's request construction with that protocol. Anthropic also states that it does not endorse or audit third party gateway products. Protocol compatibility therefore does not amount to provider approval. [4][5]

Roundtable now classifies the observed rejection as `client_not_authorized`. The diagnostic includes the requested endpoint and HTTP status, while removing the saved key from provider error text. There is no automatic retry, client impersonation, header guessing loop or route switching to escape the rejection. AgentRouter's original documentation remained inaccessible through the research browser's security check. I cannot confirm which custom client authorization procedure AgentRouter currently supports. [6]

The practical next step is a support inquiry with the error and endpoint, not the credential. A suitable message is:

> I am using my AgentRouter token in a custom local application. The model discovery request receives HTTP 401 with "unauthorized client detected". Are custom clients supported for this account, and what client authorization, endpoint and authentication format should I use? I can provide a request ID if one is available.

A connection test is still useful because model discovery and text generation are different requests. It must not automatically treat a discovery failure as success or silently try paid model calls. The implemented test requires an explicit click and an exact model ID, uses the saved configuration, requests a short response, applies an output cap and times out. A failure remains visible in the connection panel.

### Codex and Claude Code

Existing native sessions should remain separate from the API gateway connection. A custom gateway credential can replace Claude's subscription credential for a session, so a setup guide for routing Claude Code should not be applied globally merely to connect the separate AgentRouter participant. [4]

Roundtable retains distinct provider adapters and separate session identifiers. Roles, names and models remain independent fields. New messages record their actual provider and configured model alongside the displayed agent name. This prevents a friendly name such as Gemini from being the only visible indication of what generated a reply. Historical messages without this metadata are not retroactively assigned a claimed provider.

The Codex sandbox correction is retained. Thread sandbox strings and turn sandbox policy objects use different protocol representations. Existing regression tests continue to exercise both. A later product release should build capability choices directly from the installed provider's model and permission metadata wherever available, rather than implying every provider supports identical controls.

## Conversation design

### Readable replies

Markdown provides simple structure for emphasis, headings, lists, links and code. These are exactly the structures visible as unrendered punctuation in the supplied Claude reply. The appropriate correction is a renderer, not a prompt that prohibits useful formatting. [7]

The implementation uses the bundled Marked lexer to identify Markdown structure, then constructs a restricted DOM tree. It does not insert the generated answer as raw HTML. HTML tokens remain inert text, links are restricted to ordinary web or email schemes, and image syntax does not cause automatic remote image downloads. This follows Marked's warning that its output is not itself sanitized and the browser documentation's distinction between text content and HTML insertion. [8][9]

Code blocks have an explicit language label and a copy button. Inline identifiers remain inline. Tables scroll within the message column, and lists have proper indentation and spacing. The overall response copy action copies the original Markdown, preserving source structure for an editor or another chat. Displayed mentions use participant names while retaining the underlying routing identifier.

### Turn taking and peer awareness

SillyTavern documents multiple reply ordering strategies, shared group history, muting and an optional automatic mode. That establishes that group awareness and unlimited automatic conversation are separate product choices. Roundtable adopts explicit ordered participation and shared history while keeping the requested hard stop after a user initiated round. [10]

The roster shows the configured reply order. Agents can be moved earlier or later in the settings form. The To selector and exact mentions still determine who participates. The active participant is identified while replying. An agent's mention of another agent never launches a new round.

Each participant receives the successful shared transcript, its own selected skill instructions and the common notes. The first speaker cannot react to a later reply that has not happened yet; it sees that reply on the next user turn. The interface should make this causal order understandable rather than implying simultaneous awareness of future messages.

### Context and attachments

Shared notes represent deliberately maintained context. Pins make completed decisions easy to find without automatically promoting model output into a permanent rule. The user can pin and unpin messages; failed and interrupted messages cannot be pinned as completed decisions. Pins do not cause new agent calls.

Text and code attachments are a useful common denominator across the implemented adapters. The Antigravity streaming documentation explicitly limits the accepted content blocks in this mode to text, which is a concrete reason not to claim universal image attachment support. [2]

The plus menu accepts up to three text or code files, including LSL, Markdown and JSON. Contents are stored with the user message and included as labeled reference data in later context. There is no automatic execution. Limits apply to each file and the combined contents before sending. The attachment's displayed name is not used as a filesystem destination. Attached material counts toward the room size limit.

Draft text and selected attachments are associated with the current room while the page remains open. They are not durable saved drafts across a reload. That distinction belongs in the documentation until persistent drafts are implemented.

## Skills and capabilities

The Agent Skills specification defines a skill package around a `SKILL.md` file with metadata and instructions, with optional scripts, references and assets. Native Claude skills can extend that model with agent specific invocation and tool behavior. Importing one Markdown file is therefore not equivalent to installing an entire executable package. [11][12]

This release intentionally implements reusable instruction skills: a name, a short description and an instruction body. There are starter skills for code review, product design, source checking, LSL review and concise collaboration. An agent can be assigned selected skills, and their instructions are included only in that agent's prompt.

Creation and editing take place in the Skills panel. Markdown import opens an editable preview before saving. Simple frontmatter can supply a name, but references, executable scripts, permissions and external dependencies are not installed. The UI states this limitation. Deleting a skill removes its assignment from all rooms, and the action names that consequence before deletion.

The distinction between instructions and tools matters for trust. A source checking skill cannot grant browsing to an API participant without a browsing tool. An LSL skill cannot prove simulator performance without running or measuring anything. The starter instructions explicitly ask agents to distinguish verified work from advice and to avoid invented tool results.

## Scope and future priorities

| Capability | Current release | Recommended next step |
|---|---|---|
| Human controlled group rounds | Implemented and regression tested | Preserve the contract when adding more tools |
| Semantic chat formatting | Implemented with a restricted DOM renderer | Verify with real long responses on the Mac |
| Instruction skills | Create, import, edit, delete and assign | Add native package installation as a separate reviewed workflow |
| Text/code attachments | Implemented with size limits | Add explicit provider aware image and PDF handling |
| Shared notes and pins | Implemented | Add user approved summaries for very long rooms |
| Provider diagnostics | Structured errors and explicit API test | Store last successful test with model and timestamp |
| AgentRouter access | Still blocked in the reported request | Obtain provider confirmation for custom clients |
| Antigravity model effort | Conflict fixed and discovery added | Check against the installed live account |
| Remote computer control | Not provided | Treat as a separate permissioned capability |
| Scheduled routines | Not provided | Keep any future routine separate from ordinary chat turns |

Recommended sequencing is reliability first, context second, automation third. The next high value improvements are a durable draft store, a provider capability registry, and a user reviewed room summary workflow. Image attachments and native skill packages should follow only when the UI can accurately describe which participant can consume or execute them.

Features such as fake emoji reactions, autonomous banter, fabricated live activity and decorative screen previews are not recommended. They increase apparent activity without establishing useful work. The strongest visual personality here comes from readable messages, recognizable participants, a compact toolkit and clear outcomes.

## Verification and limits

The automated suite exercises the real local HTTP server with labeled provider fixtures and mocked API responses. It covers the original sandbox failure, bounded rounds, peer context, interruptions, room isolation, legacy migration, skill assignment and removal, attachment context, pins, Markdown structure and unsafe links, AgentRouter error classification, and Antigravity effort selection.

These tests establish application behavior under the tested protocols. They do not establish that a subscription is valid, that an external model is available, or that AgentRouter has authorized the application. The build environment does not control the target Mac and no live paid model request was performed. The interface has source and syntax checks; a live visual browser review on the Mac remains outstanding.

## Sources

1. Supplied screenshots, `01-image.png`, `02-image.png`, `03-image.png`, received in this conversation. Private visual evidence of the existing interface, runtime rejection and requested reference. No public URL.
2. Google Antigravity, [Headless mode](https://antigravity.google/docs/cli/headless/), accessed September 10, 2026. Model listing, stream protocol, input restrictions and lifecycle.
3. Md Al Mamun, Skill Trek, [How to Use Claude Code for Free with Agent Router API in VS Code](https://skilltrek.dev/how-to-use-claude-code-for-free-with-agent-router-api-in-vs-code/), September 3, 2026. Secondary setup lead supplied in the conversation.
4. Anthropic, [Connect Claude Code to an LLM gateway](https://code.claude.com/docs/en/llm-gateway-connect), accessed September 10, 2026. Credential header mapping and native login precedence.
5. Anthropic, [Other LLM gateways](https://code.claude.com/docs/en/llm-gateway), accessed September 10, 2026. Scope of third party gateway support and endorsement limitations.
6. AgentRouter, [Documentation entry point](https://agentrouter.org/docs/index.html), attempted September 10, 2026. Access returned a security check; no current custom client authorization procedure could be verified.
7. CommonMark, [Markdown Reference](https://commonmark.org/help/), accessed September 10, 2026. Formatting structures.
8. Marked, [Documentation](https://marked.js.org/), accessed September 10, 2026. Parser behavior and sanitization warning. The bundled library retains its license in `public/vendor/marked-LICENSE.md`.
9. MDN contributors, [Node: textContent property](https://developer.mozilla.org/en-US/docs/Web/API/Node/textContent), last modified October 28, 2025, accessed September 10, 2026. Text versus HTML insertion behavior.
10. SillyTavern, [Group Chats](https://docs.sillytavern.app/usage/core-concepts/groupchats/), accessed September 10, 2026. Group history, reply ordering, muting and automatic mode.
11. Agent Skills, [Specification](https://agentskills.io/specification), accessed September 10, 2026. Package structure, metadata, instructions and optional resources.
12. Anthropic, [Extend Claude with skills](https://code.claude.com/docs/en/skills), accessed September 10, 2026. Native skill behavior and configuration.


## 0.4.0 implementation and verification addendum

The earlier release notes above describe 0.3.0. Version 0.4.0 adds incremental native prompts, room-scoped generation, throttled SSE deltas, launch-secret authentication, gateway environment sanitation, a shared transcript budget, guarded project paths, persistent drafts, single-agent retry context and reported usage. It adds locally rendered PDF pages and normalized images; provider adapters send actual image payloads.

Claude's review was treated as findings to verify. The environment variables, full-room delta broadcasts and full transcript resends were confirmed. The assertion that `--tools` and `--allowedTools` are redundant was not adopted: availability and preapproval are different controls in the [official CLI reference](https://code.claude.com/docs/en/cli-reference). Launch-link authentication cannot protect against a process running under the same OS user. Retry preserves the original conversation context, but cannot undo edits or reproduce a model response exactly.

Image input follows [Claude’s streaming input example](https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode), [Google’s inline-image documentation](https://ai.google.dev/gemini-api/docs/image-understanding), and the locally generated Codex 0.154 app-server schema. PDF conversion uses [Mozilla PDF.js](https://github.com/mozilla/pdf.js). AgentRouter vision and client authorization remain unverified live. Antigravity media is explicitly unsupported.

The new client regression tests exercise the actual shared client helpers and safe Markdown DOM renderer, using a small DOM stub without runtime dependencies. These tests were added after the implementation changes; no pre-fix test run is claimed. They cover drafts, in-flight send edits, file selection crossing room switches, safe rendered elements, and isolated delta updates. Protocol fixtures cover late Codex item completion, usage, native image input, resumed incremental context and retry-in-place. A real PDF was also text-extracted and rasterized in the local runtime; that check caught a modern-build compatibility issue and led to bundling PDF.js’s legacy compatibility build. Full cloud-browser interaction was blocked at localhost, and Mac UI behavior and real account completions remain unverified.
