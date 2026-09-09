# Sweep for Todoist — technical plan

Research completed 2026-09-09. This plan is limited to the phased MVP in the project brief; no application has been scaffolded.

## 1. Stack and pinned versions

- Node.js 24.x, npm 11+ (`@doist/todoist-sdk@15.2.0` now requires Node `>=24` and npm `>=11`)
- TypeScript 5.9.3, ESM, strict mode (the current SDK itself is built and typechecked against this baseline)
- Express 5.2.1 with `@types/express@5.0.6`
- `@doist/ui-extensions-core@6.0.0`
- `@doist/todoist-sdk@15.2.0`
- Vitest 5.0.0
- `tsx@4.23.13` for local development
- `dotenv@17.4.2` and `@types/node@24.13.3`

Use exact versions in `package.json` and commit the generated lockfile. The implementation remains a single Node service with no browser frontend or database.

## 2. HTTP and extension contract

Expose:

```text
GET  /health  -> 200 { "status": "ok" }
POST /sweep   -> TodoistCardResponse JSON
```

`POST /sweep` accepts `TodoistCardRequest` from `@doist/ui-extensions-core`. It requires `extensionType === "context-menu"` and routes:

- `action.actionType === "initial"` to the initial or empty card;
- `action.actionType === "submit"` by a small set of explicit `action.actionId` values (`sweep.start`, `sweep.today`, `sweep.next-week`, `sweep.remove-date`, `sweep.keep`).

Malformed, unsupported, or mismatched requests return a small safe error response. The service never logs request bodies, access tokens, or verification secrets.

## 3. Project context and API token

For a Project Context Menu invocation, obtain the project ID from `action.params.sourceId` after requiring `action.params.source === "project"`. This is the path used by Doist's complete official example. Cross-check it against `context.todoist?.project?.id` when both are present, and use `context.todoist.project.name` for display. Reject known temporary IDs beginning with `tmp-` rather than sending them to the API.

Enable only the `data:read_write` UI Extension scope. Todoist then includes a short-lived bearer token in every extension request's `x-todoist-apptoken` header after user consent. Read that header per request and construct `new TodoistApi(token)`; never persist or log it. OAuth is unnecessary because all API work occurs during the extension lifecycle.

## 4. Fetching project tasks

Fetch active tasks with:

```ts
api.getTasks({ projectId, limit: 200, cursor })
// Promise<{ results: Task[]; nextCursor: string | null }>
```

Start without a cursor, append `results`, and pass each opaque `nextCursor` unchanged until it is `null`, keeping `projectId` and `limit` identical across requests. De-duplicate by task ID because the API warns that concurrent changes during cursor pagination can otherwise cause duplicates. `getTasks` already returns active tasks, so Sweep will not query completed-task endpoints.

The installed SDK types expose the fields Sweep needs as `task.addedAt: Date | null`, `task.due`, `task.due.isRecurring`, `task.content`, and a generated `task.url`.

## 5. Due dates and overdue semantics

Use `api.updateTask(taskId, args)`, which returns the updated `Task`:

- Today: `{ dueString: "today", dueLang: "en" }`
- Next week: `{ dueString: "next week", dueLang: "en" }`
- Remove date: `{ dueString: null }`

The generated phrases are English, so `dueLang` is deliberately `en`; passing the user's language alongside an English phrase would be incorrect. Todoist parses these relative strings for the authenticated user's account and timezone. The request's `context.user.timezone` remains the authority for Sweep's own comparisons and reason text, and `context.user.lang` is retained for future localization. Phase 4 live verification must confirm that Todoist's parser schedules both actions on the same calendar dates its native UI offers; if it does not, switch to explicit `dueDate` values calculated in the request timezone before proceeding.

Overdue rules will be explicit and host-timezone independent:

- a date-only due value is overdue when its `YYYY-MM-DD` is earlier than today's calendar date in `context.user.timezone`;
- a fixed due datetime (UTC/offset form) is overdue when its parsed instant is before `now`;
- a floating datetime is compared as local calendar and wall-clock components in `context.user.timezone`;
- due today is not overdue until its time passes, and an all-day task due today is not overdue;
- recurring due tasks are excluded;
- an undated task qualifies once `now - addedAt >= 30 * 24 hours`; a missing `addedAt` does not qualify.

Sort overdue candidates by due instant/calendar value, then old undated candidates by `addedAt`, using task ID as the final stable tie-breaker.

## 6. Session state

Keep the service stateless. Every `SubmitAction` carries a versioned payload in its `data`, returned by Todoist as `request.action.data`:

```ts
type SweepStateV1 = {
  v: 1
  projectId: string
  total: number
  remainingTaskIds: string[]
  scheduled: number
  datesRemoved: number
  kept: number
}
```

Each button adds only its command/current task ID around that state. Validate all incoming state, require its project ID to match the signed context, and ignore unknown fields. After a successful mutation or Keep action, remove the current ID and update exactly one counter. On mutation failure, leave state and progress unchanged and render a retryable error. Fetch the next task by ID before rendering it; skip tasks that disappeared or no longer qualify and decrement `total` so the final reviewed count still equals the three outcome counters. This keeps ordering stable without cookies, server sessions, or persistence.

## 7. Cards and actions

Construct Doist Cards with `TodoistCard`, `TextBlock`, `ActionSet`, `SubmitAction`, and `OpenUrlAction` from `@doist/ui-extensions-core`. Use Doist Card 0.6 / Adaptive Card 1.4 and ensure the request's maximum supported card version is at least 0.6.

- Initial: title, candidate count, one-line explanation, positive `Start sweep` submit action.
- Empty: title and precise explanation of the two checked conditions, with no action.
- Review: subtle progress, wrapped task content, subtle reason, submit actions for Today/Next week, conditional Remove date, Keep as-is, and `OpenUrlAction` using `task.url`.
- Completion: title, reviewed total, and only the three summary counts; optionally return `finished` plus a small success notification after a separate close action if live rendering makes that useful.
- Errors: concise cards for missing project context, missing token, verification failure, and API/mutation failure.

Keep actions in at most two `ActionSet` rows so four choices remain readable. Confirm the layout in Todoist during Phase 3 before polishing it.

## 8. Request verification

Include HMAC verification in Phase 1, before the endpoint handles any Todoist token. Cost is small: capture the exact raw JSON bytes in Express's JSON-parser `verify` hook, compute base64 HMAC-SHA256 with Node's built-in `node:crypto` and the App Console verification token, then compare against `x-todoist-hmac-sha256` with a length check and `timingSafeEqual`. Reject missing or invalid signatures with HTTP 401 before parsing/routing business actions.

This adds roughly 25 lines and one environment variable (`TODOIST_VERIFICATION_TOKEN`), with no crypto dependency. The official getting-started sample omits verification, while the fuller official example and platform security guide include it. A public mutation-capable endpoint should not defer it until after the MVP.

## 9. Small implementation sequence

1. Phase 1: create the TypeScript/Express shell, health route, signed `/sweep` initial response, and live Project Context Menu setup. Stop for live confirmation.
2. Phase 2: add token extraction, complete pagination, pure eligibility/sort logic, focused tests, and initial/empty cards. No writes. Stop for live confirmation.
3. Phase 3: add versioned submit state, Start/Keep/Open task, review progression, and completion card. Stop after a full read-only walkthrough.
4. Phase 4: add the three mutations and live-test them only in a dedicated `Sweep Test` project. Stop after each action has been observed.
5. Phase 5: refine card spacing/copy/error states, document setup and product choices, and run final typecheck/tests/live verification.

## 10. Current-platform discrepancies and open checks

- The current SDK is 15.2.0 and requires Node 24/npm 11; the brief's Node 20.18.1+ statement is stale.
- UI Extensions Core 6.0.0 exports `TodoistCard`; current public docs and examples still show the older `DoistCard` name and pin Core 4.x.
- Core 6 types prefer `maximumTodoistCardVersion` and `todoistCardVersion`, while retaining `maximumDoistCardVersion`, `doistCardVersion`, and `adaptiveCardistVersion` compatibility aliases. The service should read the newest request field first and let the SDK serialize the response aliases.
- The current API v1 task payload no longer publishes a raw `url` property, but SDK 15.2.0 synthesizes `Task.url` using the documented `https://app.todoist.com/app/task/<id>` format.
- The official examples are useful for flow, token extraction, and raw-body HMAC handling, but their dependency/runtime versions are stale and their HMAC comparison is not timing-safe.
- Todoist still labels the UI Extension documentation preliminary, and UI Extensions remain web/desktop only. Live phase gates are therefore required.
- The App Console's actual Data Exchange Format choices, consent behavior, serialized submit-data round trip, card button wrapping, and native interpretation of `"next week"` can only be confirmed in Phase 1–4 live checks.

## Sources inspected

- [Todoist UI Extensions documentation](https://developer.todoist.com/ui-extensions)
- [Build Your First Todoist UI Extension](https://www.todoist.com/help/todoist/integrations/build-your-first-todoist-ui-extension-Tu1aQhceS)
- [Doist Cards Reference](https://www.todoist.com/help/todoist/integrations/doist-cards-reference-Tu1bJ28AR)
- [Official integration examples](https://github.com/Doist/todoist-integration-examples), including both requested examples at commit `422ae7a8e7b59bfaa6b9db4bacf0185b5ac200ba`
- [Official Todoist TypeScript SDK](https://github.com/Doist/todoist-sdk-typescript)
- [Todoist API v1](https://developer.todoist.com/api/v1/)
- Published declarations and runtime exports from `@doist/ui-extensions-core@6.0.0` and `@doist/todoist-sdk@15.2.0`, inspected in a temporary install
