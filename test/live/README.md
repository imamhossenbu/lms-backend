# Live API suites

End-to-end checks that run against a **real server and database**. Each suite creates its own isolated
workspace (institution, users, data) and deletes everything in `finally`, so it's safe to run against the
dev database. These are not Jest tests and are not part of `npm test`.

| Suite | What it covers |
| --- | --- |
| `crud-all-domains.live.ts` | Create → read → list → update → delete across every admin domain, plus student flows, coupons and auth |
| `tenancy.live.ts` | Workspace isolation for catalogue, students, orders and nested course routes |
| `security.live.ts` | Validation, CORS allowlist, helmet headers, auth edge cases |
| `plan-limits.live.ts` | Plan features, usage limits and inactive workspaces (403 codes) |
| `endpoint-sweep.live.ts` | Calls every Swagger route as anonymous / admin / student and flags any 5xx |
| `panel-auth.e2e.live.ts` | Browser test of the admin panel: 2FA login, permission-aware sidebar, accept-invite, required 2FA |
| `panel-students.e2e.live.ts` | Browser test of the panel Students pages: list search / filters / URL state, create with enrollment, inline edit, notes, enroll / unenroll, workspace isolation, delete |
| `panel-instructors.e2e.live.ts` | Browser test of the panel Instructors pages: list filters / URL state, create with course, tabs, notes, message, edit (locked courses), delete (409 while teaching), isolation |
| `panel-team.e2e.live.ts` | Browser test of the panel Team & Roles pages: members from the API, invite, revoke, change role, suspend / reactivate, create role, self-guard |
| `panel-billing.e2e.live.ts` | Browser test of the panel Billing & Plan + custom domain + public signup: payment method, domain add/remove, pay invoice (paid + declined), downgrade, cancel/reactivate, signup → PENDING admin |
| `panel-orders.e2e.live.ts` | Browser test of the panel Orders + Payments: manual order, mark as paid (enrollment), note, refund (access revoked), paid order, server filters + stats, isolation |
| `panel-analytics.e2e.live.ts` | Browser test of the panel Dashboard + Analytics: KPIs / recent orders from the API (৳), overview + revenue tabs, period in the URL, Starter plan gate (no gated request) |
| `panel-assignments.e2e.live.ts` | Browser test of the panel Assignments: list from the API, create wizard on a real course (modules from the API, rubric template), grading with rubric levels, duplicate, isolation |
| `panel-quizzes.e2e.live.ts` | Browser test of the panel Quizzes: list from the API, create wizard on a real course / module (True-or-False question), publish, attempt counts, details, duplicate, isolation |
| `panel-certificates.e2e.live.ts` | Browser test of the panel Certificates: list from the API, template designer on a real course, eligible queue + Issue to all, manual issue (learner picker from the API), revoke / restore, verify, isolation |
| `panel-community.e2e.live.ts` | Browser test of the panel Community: list + moderation queue from the API, New Discussion on a real course / module, view count, reply as the admin, accept answer, pin, resolve report, delete, isolation |
| `panel-live-classes.e2e.live.ts` | Browser test of the panel Live Classes: list from the API, schedule form on a real course + instructor, details / invited students, attendance override, Q&A answer, add resource, duplicate, cancel / restore, delete, isolation |
| `panel-e2e-helpers.ts` | Shared helpers for the four suites below (checks, waits, Radix-safe clicks, tagged workspace + admin, cleanup) |
| `panel-notifications.e2e.live.ts` | Browser test of the panel Notifications: inbox + bell count from the API, mark read / archive, compose with the API recipient estimate → Send Now (only this workspace's students), Broadcasts tab across reloads, detail, Save as Draft, template on/off, isolation |
| `panel-settings.e2e.live.ts` | Browser test of the panel Settings: General save (validation, reload, audit), `?section=` across reloads, Stripe secret write-only (encrypted at rest, masked hint), gateway Test connection, isolation |
| `panel-categories.e2e.live.ts` | Browser test of the panel Categories: list from the API, zod validation, create (slug follows name), edit drawer across reloads, delete refused while in use, delete, isolation |
| `panel-lesson-editor.e2e.live.ts` | Browser test of the panel Lesson editor: real lesson + curriculum, validation, title / duration, video URL (`?tab=` across reloads), free preview, resources (existing + new link), move to another module, isolation |
| `owner-console.e2e.live.ts` | Browser test of the Owner Console: owner sign-in, snapshot pages, create institution, coupons, settings, alerts read-state, "Open as owner" into the panel, expired session |

## Running

```bash
# 1. API on :4077 (Swagger must be on for the endpoint sweep)
PORT=4077 CORS_ORIGINS=http://localhost:3010 npm run dev

# 2. Any API suite
npx ts-node --transpile-only test/live/crud-all-domains.live.ts

# Browser suites: admin panel on :3010 and Owner Console on :3011 pointing at the API, plus puppeteer-core
# (start the API with CORS_ORIGINS=http://localhost:3010,http://localhost:3011)
(cd ../lms-admin-panel && NEXT_PUBLIC_API_URL=http://localhost:4077 npx next dev -p 3010)
(cd ../lms-owner-console && NEXT_PUBLIC_API_URL=http://localhost:4077 NEXT_PUBLIC_ADMIN_PANEL_URL=http://localhost:3010 npx next dev -p 3011)
npm i --no-save puppeteer-core
npx ts-node --transpile-only test/live/panel-auth.e2e.live.ts
```

Environment overrides: `LIVE_API_URL`, `LIVE_PANEL_URL`, `LIVE_CONSOLE_URL`, `LIVE_SHOTS_DIR` (screenshots), `CHROME_PATH`.
Neon sometimes drops a connection under load ("timeout exceeded when trying to connect"); rerun if so.
