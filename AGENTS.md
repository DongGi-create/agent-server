# Codex Automation development

This is a local, personal Codex App Server client. Keep it private to the user's authenticated devices.

- Preserve task/thread mapping and durable state. Never automatically replay an uncertain external operation after a crash.
- Approval responses must bind to the current live request, task, and turn. Expire them on disconnect. Never treat a business decision as general execution authorization.
- Default to the workspace sandbox and supported automatic review. The user requested full access for automation task sessions on 2026-10-09; honor the explicit local `accessMode: "full"` preference on thread start/resume. This does not grant authorization for unrelated publishing, payments, or destructive work.
- Never commit data/, workspaces/, tokens, push subscriptions, or config.local.json. Do not log access tokens.
- Prefer the installed Codex version's generated protocol schemas over remembered API shapes.
- Run manage.ps1 -Action test for state-machine changes. Browser testing uses a separate headless Edge process and a running server.
- Live smoke tests consume model usage and create clearly labeled verification tasks. Avoid rerunning them when unrelated changes do not justify it.
- Tailscale Serve is private. Do not enable Funnel as part of ordinary development.
