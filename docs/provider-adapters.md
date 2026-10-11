# Agent provider adapters

The task engine accepts a provider object rather than a CLI or RPC client. `src/providers/contract.mjs` validates the required methods, and `src/providers/codex.mjs` is the working reference. Codex App Server method names, response shapes, model metadata, and rate-limit parsing stay inside `src/providers/codex*.mjs`. A provider can be backed by a CLI, SDK, or local service as long as it preserves the contract below.

## Current scope

Codex is the only registered provider. Existing tasks are migrated to `provider_id='codex'`; their `thread_id` and `turn_id` values remain untouched. A task's provider cannot yet be changed in the UI. Per the [roadmap](../ROADMAP.md), Claude and Gemini adapters are left to contributors who use those services, and switching within one task is deferred until at least one such adapter is merged and verified. Adding an adapter does not automatically enable multi-provider scheduling or migration of a live conversation. Those need a registry and per-provider run history in a later change. Do not reinterpret another provider's saved session ID as your own.

## Required interface

The provider extends `EventEmitter`, has a stable string `id`, a boolean `connected`, and implements:

| Method | Return or effect |
| --- | --- |
| `start()`, `stop()` | Connect and disconnect the backend. `start()` must be safe to call repeatedly. |
| `models()` | Array of `{id,label,isDefault,defaultEffort,efforts}`. Efforts are strings supported by that model. |
| `usage()` | `{known,blocked,retryAt,windows}`. `retryAt` is epoch milliseconds; `windows` has `{id,label,usedPercent,resetsAt}` with ISO reset times. Unknown capacity must not be reported as available. |
| `readSession(sessionId)` | `{active,model,effort}` without resuming or executing work. |
| `openSession({sessionId,cwd,model,effort,accessMode,approvalsReviewer,instructions})` | `{sessionId,model,effort}`. Resume only the supplied session or create one when absent. Honor the user's explicit `accessMode` preference. |
| `startTurn({sessionId,input,model,effort,outputSchema})` | `{turnId}`. Never silently replay an uncertain call. |
| `steer({sessionId,turnId,input})`, `interrupt({sessionId,turnId})` | Target the exact live turn. |
| `prepareInput(store,messages,directory,prefix)` | Provider-ready input. Materialize attachments under `directory` when needed. The store remains the durable original. |
| `classifyTask(tasks,text,attachmentNames)` | `{action,taskId,title,reason,confidence,text}`; `action` is `new`, `existing`, or `ask`. Treat task summaries as data. |
| `answerApproval(request,answer)`, `rejectApproval(request,reason)` | Reply only to the exact live request. Validate answer shape and reject unsupported types. |
| `isRateLimitError(error)` | True only for temporary usage-window exhaustion, never billing/authentication/quota errors. |

`capabilities` is descriptive metadata for upcoming provider-aware UI and scheduling. Report only features actually supported. The present engine requires the methods above even when a provider returns an explicit unsupported error for a feature. A future registry should use `capabilities` to disable unavailable controls.

## Events emitted by an adapter

All events carry provider-neutral `sessionId` and, when available, `turnId`. The engine checks both against its current live task before accepting an approval or completion.

| Event | Payload |
| --- | --- |
| `turnStarted` | `{sessionId,turnId}` |
| `message` | `{sessionId,turnId,phase,text}` where `phase` is `commentary` or `final_answer` |
| `itemStarted` | `{sessionId,turnId,item}`; `item.id` is used for approval previews |
| `toolCompleted` | `{sessionId,turnId,kind,item}` |
| `turnError` | `{sessionId,turnId,error}` |
| `turnCompleted` | `{sessionId,turnId,status,error}`; `status` is `completed`, `failed`, or `interrupted` |
| `approvalRequested` | `{requestId,sessionId,turnId,itemId,kind,questions,reason,details}`; `kind` is `execution`, `question`, or `unsupported` |
| `approvalResolved` | `{requestId}` |
| `disconnect`, `diagnostic`, `usageUpdated` | Connection reason, diagnostic text, or usage snapshot |

The final assistant message must conform to the task result schema passed to `startTurn`: `status` (`completed`, `continue`, or `waiting`), `summary`, `context`, `question`, and `options`. For `waiting`, `context` explains the situation and option trade-offs so the decision inbox is self-contained; for other statuses it may be empty. An adapter without native structured output must enforce this in its prompt and validate the result before emitting it. A disconnected or uncertain turn must enter recovery; it must not be replayed automatically. A usage-limited turn can be retried only when the provider confirms capacity and the input's delivery state is known.

## Contributor workflow

1. Add `src/providers/<name>.mjs` and keep the service's transport, parsing, and classification beside it. Do not add service-specific method names to `Engine` or the store.
2. Add tests with a fake transport for start/resume, stale approvals, interrupted turns, uncertain delivery, and usage-window recovery. `test/provider-contract.test.mjs` proves the core can run without Codex protocol objects.
3. Run `scripts/manage.ps1 -Action test`. Test real accounts only with explicit, clearly labeled smoke tasks because they consume usage.
4. In a separate integration change, register the provider and expose its capabilities. A later switching feature must keep each provider's session history and display a new run boundary; do not claim conversation continuity across services unless context was explicitly transferred.

Keep credentials in the service's own authenticated environment or ignored local configuration. Never commit tokens, `data/`, `workspaces/`, or user attachments. The private Tailscale Serve setup remains the default deployment.
