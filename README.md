# Sweep for Todoist

Sweep is a small Todoist Project Context Menu UI Extension prototype. Phase 1 only proves the signed extension shell: it exposes health, accepts a Todoist request, and renders a connected card with the current project name. Task reads, candidate rules, and mutations come in later approved phases.

## Local development

This project uses Node 24+ and npm 11+, matching the current Todoist SDK requirement.

```shell
npm install
cp .env.example .env
npm run dev
```

Set `TODOIST_VERIFICATION_TOKEN` in `.env` to the verification token from Todoist App Management Console. The `/sweep` endpoint rejects requests without a valid `x-todoist-hmac-sha256` signature.

```shell
curl http://localhost:3000/health
```

## Todoist setup for Phase 1

1. Open the [Todoist App Management Console](https://developer.todoist.com/appconsole.html) and create a new app.
2. In UI Extensions, add a Context menu extension with Project as its context type.
3. Choose the current Data Exchange Format version offered by the console and set the minimum Doist Card version to `0.6`.
4. Expose this service with a tunnel, for example `ngrok http 3000`.
5. Set the Data exchange endpoint URL to the tunnel URL followed by `/sweep`.
6. Copy the app's verification token into `.env`, restart the service, and install the integration for yourself.
7. Open a Todoist project, choose its `•••` menu → Integrations → Sweep.

The expected card says `Sweep`, shows the project name, and says `Sweep is connected.` The Start sweep button is intentionally only a shell action at this phase.

See [PLAN.md](./PLAN.md) for the product scope and the phase gates.
