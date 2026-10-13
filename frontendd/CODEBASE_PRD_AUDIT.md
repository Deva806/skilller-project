# Skiller Codebase & PRD Audit

**Audit date:** 23 July 2026  
**Scope:** `D:\skiller-frontend` React/Vite frontend, its configured production API, and `memory/Skiller_PRD.docx` (v1.0, 1 June 2026).  
**Method:** static source/configuration review, production build, production API availability/authentication/read-contract checks. No financial, wallet, payment, deletion, role-change, or content-creation action was performed.

## Executive summary

The frontend compiles successfully, has a substantial feature surface, and authenticates the supplied student, creator, and admin accounts correctly. However, it is not ready to deliver the PRD's monetization and reliability goals.

The most urgent problem is a broken production discovery path: authenticated creator requests to `GET /api/posts/feed`, `GET /api/posts/reels?limit=30`, and `GET /api/search?q=design&limit=5` returned **HTTP 500**. Separately, `Feed.jsx` always requests `GET /api/users?limit=8`, which returned **HTTP 404** and is absent from the deployed OpenAPI document. Because the page uses `Promise.all` with no error handler, either failed dependency leaves the feed in a misleading empty state.

Course browsing is present, but the main **Enroll** button has no click handler and the frontend never calls either deployed enrollment endpoint. This prevents the PRD's course-sale/enrollment financial flow from being completed in the client. The repository also lacks the backend and infrastructure artifacts required to substantiate the migration, financial integrity, withdrawals, commission calculation, Docker, Alembic, WhatsApp, and API-documentation commitments in the PRD.

### Prioritized remediation backlog

| Severity | Finding | Business impact | Owner |
|---|---|---|---|
| Critical | Production feed, reels, and search APIs return 500 | Core discovery, creator reach, and acquisition paths are unavailable | Backend/API |
| Critical | Course enrollment/purchase flow is not implemented in the client | Users cannot complete a core revenue and enrollment journey | Frontend + backend |
| High | Feed depends on nonexistent `GET /users?limit=8` and masks failures | Feed cannot render reliably even after the feed endpoint is repaired | Frontend + backend |
| High | Financial flows have UI/API hooks but no auditable backend implementation in this repository | PRD payment, ledger, commission, withdrawal, and reporting claims cannot be verified | Backend/platform |
| High | No automated tests or test script | Regressions in payments, role access, and API contracts are likely | Frontend + backend |
| Medium | Many pages have no error/empty/retry state and silently collapse failures into blank content | Users cannot distinguish outage, authorization, and empty-data conditions | Frontend |
| Medium | Visible mojibake (`â€¦`, `â‚¹`, `â†’`, etc.) occurs across user-facing source | Poor perceived quality and damaged localized currency/copy rendering | Frontend |
| Medium | Some media is rendered from raw relative paths instead of `fileSrc` | Uploaded images/videos can break when the API and SPA have different origins | Frontend |
| Medium | README documents Create React App commands while the project is Vite | Incorrect setup, test, and deployment instructions | Frontend/platform |
| Low | Production bundle is a single 553 kB minified JavaScript chunk | Slower first load, especially on mobile | Frontend |

## Verified checks

### Build

`npm.cmd run build` completed successfully with Vite 7.3.6:

- 1,856 modules transformed; build time: 6.64 seconds.
- Generated JavaScript bundle: 553.24 kB (164.19 kB gzip).
- Vite emitted its large-chunk warning (>500 kB). No lint or test command exists in `package.json`.

### Production API and role checks

The configured base URL is `https://skiller-backend-production.up.railway.app/api`.

| Check | Result | Evidence |
|---|---|---|
| API availability | Pass | `/docs`, `/api/courses`, and `/api/gigs` returned 200. |
| Creator authentication | Pass | Supplied creator account returned a token and `role: creator`. |
| Student authentication | Pass | Supplied student account returned a token and `role: student`. |
| Admin authentication | Pass | Supplied admin account returned a token and `role: admin`. |
| Courses contract | Pass (read-only) | Creator `GET /api/courses` returned 200. |
| Gigs contract | Pass (read-only) | Creator `GET /api/gigs` returned 200. |
| Feed contract | Fail | Creator `GET /api/posts/feed` returned 500. |
| Reels contract | Fail | Creator `GET /api/posts/reels?limit=30` returned 500. |
| Search contract | Fail | Creator `GET /api/search?q=design&limit=5` returned 500. |
| Feed creator-list contract | Fail | Creator `GET /api/users?limit=8` returned 404; it is not declared in production OpenAPI. |
| Remaining role/page checks | Blocked | The 66-request read-only sweep exceeded its 120-second execution limit after the above results. They must be re-run against a staging environment with request timeouts/observability. |

The runtime checks deliberately did **not** invoke checkout verification, Razorpay, token redemption, withdrawal creation/approval, content upload/posting, deletion, role upgrade, group creation, following, or read-state mutations.

## Detailed findings

### Critical — production discovery APIs fail

**Affected areas:** `src/pages/Feed.jsx`, `src/pages/Reels.jsx`, `src/components/SearchBar.jsx`, `src/pages/Search.jsx`; deployed API `/api/posts/feed`, `/api/posts/reels`, `/api/search`.

**Observed behavior:** authenticated production requests returned HTTP 500 for feed, reels, and search. These are core browsing paths exposed in `App.jsx` and navigation.

**Impact:** users cannot reliably discover content, creators, or learning/gig opportunities; feed-ad exposure and creator discovery are also interrupted.

**Recommended fix:** capture server trace IDs/logs for these three requests, add database/query failure handling, and return a documented error schema. Add backend integration tests for empty and populated datasets. In the client, render an error state with retry rather than treating an exception as no data.

### Critical — course enrollment and purchase are missing from the UI

**Affected area:** `src/pages/Courses.jsx`.

**Evidence:** the page fetches only `GET /courses`. Its `Enroll` button has no `onClick`, no loading state, no login gate, and no success/error result. Production OpenAPI exposes both `POST /api/courses/{course_id}/enroll` and `POST /api/courses/{course_id}/purchase`, but neither is used anywhere in `src`.

**Impact:** the PRD financial sequence—student purchase, payment verification, commission calculation, wallet credit, and enrollment creation—has no usable frontend entry point.

**Recommended fix:** add a course detail/checkout flow that determines free versus paid enrollment, authenticates the user, invokes purchase/enroll, launches Razorpay only for an order supplied by the backend, verifies the payment server-side, refreshes enrollment/wallet state, and provides idempotent pending/success/failure states. Do not trust course price, commission, or payment status from the client.

### High — Feed has an undeclared, failing dependency and no failure state

**Affected area:** `src/pages/Feed.jsx`.

**Evidence:** `load()` uses `Promise.all([api.get("/posts/feed"), api.get("/users?limit=8")])` inside `try/finally` but has no `catch`. The second endpoint returned 404 in production and is absent from `/openapi.json` (which lists `/api/users/{username}`, but no users collection endpoint).

**Impact:** one failed side request rejects the entire `Promise.all`, so posts and suggestions are never populated. `finally` clears `loading`; the page can show “No posts yet” during a service/API failure.

**Recommended fix:** establish a documented creator-discovery endpoint (or replace the request with a supported endpoint), fetch feed and suggestions independently with `Promise.allSettled`, and show retryable errors per panel. Add a contract test that compares all frontend literal endpoints with OpenAPI.

### High — PRD backend and financial requirements are outside this repository

**Affected scope:** repository root and `memory/Skiller_PRD.docx`.

**Evidence:** the project contains React/Vite code and an API client only. It contains no FastAPI source, PostgreSQL/SQLAlchemy models, Alembic migrations, Docker files, backend test suite, payment webhook implementation, ledger/commission implementation, withdrawal approval implementation, WhatsApp integration, or API versioning/documentation source. The deployed OpenAPI advertises wallet and withdrawal endpoints, but their correctness cannot be established from this codebase.

**Impact:** there is no auditable proof in scope for zero-loss migration, payment signature verification, ledger immutability, commissions, reconciliation, withdrawal controls, or financial reporting—each a stated PRD goal.

**Recommended fix:** audit the backend in its own repository before release. Require migrations/backups and restore drills; append-only double-entry wallet ledger; idempotency keys for payment/webhooks; server-side Razorpay signature verification; authorization/audit logs for withdrawals; commission calculation tests; health/metrics; and a versioned OpenAPI contract.

### High — no automated quality gate

**Affected area:** `package.json` and repository test/configuration files.

**Evidence:** only `dev`, `build`, and `preview` scripts are declared. No test files, test runner script, ESLint configuration, CI workflow, or API contract test is present.

**Impact:** role gates, payment interactions, stateful UI behavior, and endpoint drift have no regression protection.

**Recommended fix:** add unit tests for API/error utilities and route guards; component tests for loading/error/empty paths; Playwright/Cypress role journeys against staging; OpenAPI contract tests; and CI gates for lint, tests, build, dependency/security audit, and bundle budget.

### Medium — API failures are commonly rendered as empty or stuck screens

**Affected areas:** `Courses.jsx`, `Explore.jsx`, `Gigs.jsx`, `Leaderboard.jsx`, `Insights.jsx`, `Learning.jsx`, `Feed.jsx`, and several shared components.

**Evidence:** multiple data loads use `.finally(() => setLoading(false))` without a `catch`; e.g., Courses/Explore/Leaderboard. Learning explicitly converts failed enrollments and applications to empty arrays (`.catch(() => ({ data: [] }))`). Feed has no catch at all. In contrast, Billing, Community, Profile, and Group Chat do report errors, so behavior is inconsistent.

**Impact:** unavailable services, expired access, and network errors look like legitimate empty state; support and observability suffer.

**Recommended fix:** centralize request state into a reusable query/error boundary pattern. Preserve HTTP status, render a contextual message/retry affordance, do not convert failures to empty data, and provide explicit offline/unauthorized handling.

### Medium — character encoding is corrupted in user-facing copy

**Affected areas:** numerous pages/components, including `App.jsx`, `Billing.jsx`, `Courses.jsx`, `Feed.jsx`, `Insights.jsx`, `Learning.jsx`, `CreatorStorefront.jsx`, and `Leaderboard.jsx`.

**Evidence:** source literals contain mojibake such as `Loadingâ€¦`, `â‚¹`, `â†’`, `Â·`, and `ðŸŽ‰` instead of ellipsis, rupee, arrow, middle dot, and emoji characters.

**Impact:** customer-facing labels, money values, metadata, and notifications display incorrectly; this is particularly damaging in payment and INR contexts.

**Recommended fix:** normalize all source files to UTF-8, replace corrupted literals with correct Unicode or tested HTML entities, enforce UTF-8 editor/repository settings, and add a text-rendering smoke test for core localized copy.

### Medium — inconsistent media URL normalization can break uploaded content

**Affected areas:** `src/lib/upload.js`, `Courses.jsx`, `Explore.jsx`, `Profile.jsx`, and other media components.

**Evidence:** `fileSrc()` correctly prepends `VITE_API_URL` for relative uploaded paths. However Courses uses `src={c.thumbnail}`, Explore uses `src={p.media}`, and Profile uses `src={p.media}` directly. The SPA and API are different origins, so a backend response such as `/api/files/...` resolves to the frontend origin in those components.

**Impact:** course thumbnails, explore tiles, and profile media can fail while the same uploaded content works elsewhere.

**Recommended fix:** use `fileSrc` consistently for all backend media URL fields and define a single typed/normalized media response shape at the API boundary. Add tests for absolute, relative, data, missing, and failed image/video URLs.

### Medium — sensitive client/session and realtime hardening needs review

**Affected areas:** `src/context/AuthContext.jsx`, `src/lib/api.js`, `src/components/NotificationsBell.jsx`, `src/pages/GroupChat.jsx`, `src/lib/push.js`.

**Evidence:** the JWT is persisted in `localStorage` and attached as an Authorization header. Realtime WebSocket URLs include the token as a query parameter. Push subscription errors are intentionally silent. WebSocket reconnection/backoff and token-expiry recovery are not implemented.

**Impact:** an XSS issue could expose the persisted bearer token; URL logging/proxies can expose query-string tokens; realtime/push failures are difficult to diagnose and may never recover.

**Recommended fix:** make an explicit authentication security decision (short-lived access token plus refresh rotation, or hardened same-site HttpOnly cookies), avoid tokens in WebSocket query strings where the backend supports subprotocol/cookie authentication, redact credentials from logs, add reconnect/backoff/refresh behavior, and surface opt-in notification status to users.

### Medium — documentation is materially stale

**Affected area:** `README.md`.

**Evidence:** the README states the project is Create React App and instructs `npm start`, `npm test`, and `npm run eject`; `package.json` instead defines Vite `dev`, `build`, and `preview` scripts and has no test script.

**Impact:** developers cannot reliably install, run, test, or deploy the actual application.

**Recommended fix:** replace the README with prerequisites, exact Vite commands, required environment variables, backend/staging contract, test/CI instructions, deployment/cache rules, and a clear link to the backend repository/operational runbook.

### Low — large initial bundle

**Affected area:** Vite build output and `src/App.jsx` route imports.

**Evidence:** all page modules are statically imported by `App.jsx`; production build emits one 553.24 kB JavaScript asset (164.19 kB gzip) and Vite's large-chunk warning.

**Impact:** slower initial route load and increased mobile data usage.

**Recommended fix:** lazy-load route pages with `React.lazy`/`Suspense`, split heavy visual/dashboard/chat dependencies, and enforce a gzipped bundle budget in CI.

## PRD traceability matrix

| PRD requirement | Frontend status | Evidence / gap | Next build work |
|---|---|---|---|
| React frontend | Partial | React/Vite app builds; README is stale; no test gate. | Correct docs, testing, CI, route chunking. |
| FastAPI/PostgreSQL migration | Not verifiable | No backend, migration, model, or database source in scope. | Audit backend repo, migrations, backups, dual-write/cutover plan. |
| JWT authentication | Partial / runtime pass | Login and `/auth/me` are wired; all supplied roles authenticated. Token storage/realtime transport need hardening. | Token lifecycle, session security, role-route tests. |
| Student/creator/admin permissions | Partial | Frontend has `Protected` and `CreatorOnly`; server authorization was only partly tested before timeout. | Test all direct-route and API permissions per role on staging. |
| Monthly/annual plans and one-month trial | Partial | Billing UI, `/billing/plans`, `/billing/me`, checkout and verification hooks exist. | Verify all plan states and server entitlement enforcement. |
| Razorpay payment verification | Partial / unverified | Checkout script and verification request exist; no sandbox transaction was performed; backend source absent. | Sandbox E2E, webhook idempotency/signature tests, failure recovery. |
| Course sales and enrollment | Incomplete | Browse UI exists; enroll button is inert despite documented endpoints. | Implement free/paid enrollment and course consumption journey. |
| Gig marketplace / transactions | Partial | Listing/application/creator CRM UI exists; no transaction/escrow/commission completion path is visible. | Define contract, acceptance/milestone/payment lifecycle, test status access. |
| Wallet ledger and earnings | Partial / unverified | Wallet and redemption UI call API; ledger/financial integrity not in scope. | Double-entry ledger, reconciliation, immutable audit and UI states. |
| Withdrawals | Backend endpoint only | OpenAPI exposes withdrawal/admin routes; no frontend withdrawal management page or backend source is present. | Build withdrawal request/history/admin approval UX and controls. |
| Commission-based earnings | Not verifiable | No client display/contract for commission breakdown; no backend logic in repo. | Define immutable commission/settlement model and reporting endpoints. |
| Financial reporting | Partial | Creator insights/dashboard show metrics; PRD-grade financial reporting is not evidenced. | Add revenue, payout, commission, reconciliation, export views. |
| WhatsApp Business notifications | Not evidenced | No WhatsApp client/configuration/integration source found. | Implement backend event integration, templates, consent and delivery logs. |
| Docker/containerization | Not evidenced | No Dockerfile or compose configuration found. | Add reproducible containers and deployment docs. |
| API documentation | Partial | Production FastAPI OpenAPI is publicly reachable; no versioned contract artifact/testing in repo. | Version OpenAPI, generate client/types, enforce contract CI. |
| Testing/production deployment | Incomplete | Build succeeds; no test suite/CI/monitoring configuration in scope. | Add quality gates, health checks, SLOs, traces, alerts and rollback plan. |

## Build-next roadmap

1. **Restore the core path.** Diagnose and fix the three production 500s; either implement `GET /users` or change Feed to a documented suggestion endpoint; add client error/retry states before re-enabling traffic.
2. **Make the monetization path complete.** Define course purchase/enrollment states and API contracts; implement the client flow; verify Razorpay in an isolated sandbox; keep all financial truth, entitlement, commission, and wallet writes server-side and idempotent.
3. **Establish the financial platform.** In the backend repository, implement/audit PostgreSQL migration, append-only ledger, commission settlement, withdrawals, payment webhook verification, reconciliation, authorization, and audit logging.
4. **Standardize frontend reliability.** Introduce a query layer/error boundary, normalize media URLs, repair encoding, harden auth/realtime handling, and document access assumptions.
5. **Add proof before release.** Create unit/component/E2E/contract coverage and CI. Use staging accounts and Razorpay sandbox to test student, creator, and admin role matrices plus all failure/retry/payment outcomes.
6. **Operationalize.** Update README, add Docker/deployment documentation, publish versioned OpenAPI, define metrics/alerts for 5xx, payment verification, wallet reconciliation, and withdrawal processing time.

## Limitations and audit boundaries

- This is a frontend repository. Claims about FastAPI internals, PostgreSQL migration, SQLAlchemy/Alembic, Docker, payment webhooks, commissions, ledger integrity, withdrawals, WhatsApp, and production monitoring cannot be proven or disproven without the backend/infrastructure repositories and observability access.
- The audit used production read/authentication requests only. It did not create or update records. The extended read-only sweep was bounded by a 120-second execution timeout; untested page/API combinations are therefore marked blocked rather than failed.
- No browser automation stack is installed in the repository. UI findings are derived from rendered source behavior and API contract checks; full browser rendering/accessibility/device testing remains a required next step.
- Existing worktree modifications and the pre-existing untracked `CODEBASE_ANALYSIS.md` were preserved and not changed by this audit. The only intentionally created source artifact is this report.
