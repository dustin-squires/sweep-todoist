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

## Test the local service itself

Before involving Todoist, confirm the process is listening:

```shell
curl http://localhost:3000/health
# {"status":"ok"}
```

The `/sweep` route intentionally rejects unsigned requests. Todoist supplies the signature, so a normal browser visit or unsigned `curl` should return `401`.

## Test the local service inside Todoist

Todoist cannot call `localhost` directly. Keep the Node process running locally and give Todoist a temporary HTTPS address with a tunnel. The official guide documents ngrok, localtunnel, and Cloudflare Tunnels.

1. Start the service and keep this terminal open:

   ```shell
   npm run dev
   ```

2. In a second terminal, start a tunnel to the same port:

   ```shell
   ngrok http 3000
   ```

   Copy the `https://...` forwarding URL. The tunnel URL is the public front door; the code and server still run on your laptop.

3. Open the [Todoist App Management Console](https://app.todoist.com/app_console), create or open the Sweep app, and add a UI Extension with:

   - Extension type: `Context menu`
   - Context type: `Project`
   - Data exchange endpoint URL: `https://<tunnel-host>/sweep`
   - Minimum Doist Card version: `0.6`

   Copy the app's verification token into `.env` as `TODOIST_VERIFICATION_TOKEN`, then restart `npm run dev`. Install the integration for yourself. The token is used to verify Todoist's HMAC header and is never sent to the browser.

4. In Todoist web or desktop, open any project and choose `•••` → `Integrations` → `Sweep`. Todoist will POST the signed initial request to the tunnel, which forwards it to the local Express server. The card should show the project name and `Sweep is connected.`

5. Leave both terminals open while iterating. Edit code, let `tsx watch` restart the service, then close and reopen the extension modal to send a fresh request. If ngrok gives you a new URL after restarting, update the App Console endpoint URL and reinstall if Todoist does not refresh it.

For request-level debugging, ngrok's local inspector is usually available at `http://127.0.0.1:4040`. Inspect headers and status there, but do not copy access tokens or verification secrets into logs or screenshots.

Common failures:

- `401 Request verification failed`: the `.env` token does not match this app, has whitespace, or the server was not restarted after changing it.
- Sweep does not appear: confirm the extension is installed for your account and is configured as a Project context-menu extension.
- Tunnel page works but Todoist fails: confirm the App Console endpoint includes `/sweep`, uses the current HTTPS tunnel URL, and the local process is still running.

The expected card says `Sweep`, shows the project name, and says `Sweep is connected.` The Start sweep button is intentionally only a shell action at this phase.

See [PLAN.md](./PLAN.md) for the product scope and the phase gates.
