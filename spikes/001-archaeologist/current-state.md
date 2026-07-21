# Current State — target/ (Express 5.2.1)

Evidence discipline: **[E]** = evidence, cited (`file:line`, test name, or executed probe). **[I]** = inference, unverified.
Probes live in `archaeology-probes/`; all six executed successfully on Node v22.22.2 [E: probe run log].
Test suite executed: `npm test` → **1260 passing (3s)**, exit 0 [E].

## 1. What this is

- [I] A minimalist HTTP web framework for Node.js ("Fast, unopinionated, minimalist web framework") — inferred from `package.json:3` description and `Readme.md`. Users are Node application developers; the deliverable is a library, not a service.
- [E] It is **Express v5.2.1** (`package.json:4`), requiring Node >= 18 (`package.json:83`).
- [I] In v5 this repo is a thin shell: routing, body parsing, and static serving are delegated to external packages (`router`, `body-parser`, `serve-static`) — inferred from `lib/express.js:70-81` and the dependency list. The repo itself owns only app lifecycle, settings, and the req/res prototype extensions (6 files in `lib/`).

## 2. Public surface (one-way by default)

- [E] `require('express')` exports `createApplication` with attached: `.application`, `.request`, `.response`, `.Route`, `.Router`, `.json`, `.raw`, `.static`, `.text`, `.urlencoded` (`lib/express.js:27-81`; pinned by `test/exports.js`). **`Router` and `Route` are re-exports of the external `router@2.2.0` package** (`lib/express.js:70-71`; installed version verified by probe shell check).
- [E] npm publishes only `LICENSE`, `Readme.md`, `index.js`, `lib/` (`package.json:85-90`) — anything added under `lib/` ships to every consumer; anything outside it does not.
- [E] App surface: `use`, `route`, `engine`, `param`, `set/get/enable/disable/enabled/disabled`, `path`, `render`, `listen`, `all`, plus one method per HTTP verb generated from `node:http` METHODS (`lib/application.js:471-482`, `lib/utils.js:29`).
- [E] **`app.get(x)` with one argument reads a setting; it does not register a route** (`lib/application.js:473-476`; probe-05). An extension adding new settings shares a namespace with routes' method — collision-prone by design.
- [E] Default response contract outsiders depend on: `X-Powered-By: Express` header on every response (`lib/application.js:160-162`; probe-06), 404 HTML body `Cannot GET /path` for unmatched routes, and 500 bodies that include the stack trace in development but only `Internal Server Error` in production (probe-06; env captured from `NODE_ENV` at app creation, `lib/application.js:91`).
- [E] Error format: errors reaching the end of the stack are rendered by `finalhandler` (`lib/application.js:154-157`); user error middleware is any 4-arity function (pinned by `test/app.routes.error.js:25`).
- [E] Recognized settings and defaults: `x-powered-by`=on, `etag`='weak', `env`, `query parser`='simple', `subdomain offset`=2, `trust proxy`=false, `views`, `view cache` (prod only), `jsonp callback name` (`lib/application.js:90-141`; pinned by `test/config.js`). Setting `etag`/`query parser`/`trust proxy` triggers compiled `* fn` companion settings (`lib/application.js:363-380`) — a new setting wanting validation must copy this switch pattern.

## 3. De-facto behavioral spec (what the tests pin + probe results)

Load-bearing behaviors a per-route rate limiter will sit on:

- [E] **Route-level middleware chains run in declaration order; a middleware that responds without calling `next()` stops the chain, and other routes are unaffected** — probe-01 (429 + `Retry-After` short-circuit verified); ordering also pinned by `test/app.routes.error.js:25` ("should only call an error handling routing callback when an error is propagated").
- [E] **`req.ip`/`req.ips` obey `trust proxy`**: by default `X-Forwarded-For` is ignored (`req.ip` = socket address, `req.ips` = `[]`); with `trust proxy=true`, `req.ip` is the leftmost XFF entry — probe-02; `lib/request.js:340-366`; pinned by `test/req.ip.js`, `test/req.ips.js`. **A rate limiter keying on `req.ip` inherits this switch and is trivially spoofable if the app trusts proxies it shouldn't** [I: consequence, from the [E] mechanics].
- [E] **All three error paths converge on 4-arity error middleware**: `next(err)`, synchronous `throw`, and rejected promises from async handlers — probe-03; rejections also pinned by `test/app.route.js:66,88` ("should pass rejected promise value"). Plain middleware is skipped while an error is in flight (`test/app.routes.error.js:25`).
- [E] **Route identity is only knowable after matching**: `req.route` is `undefined` inside `app.use()` middleware and populated (`req.route.path` = the pattern, e.g. `/items/:id`) inside route handlers; `req.baseUrl` carries the mount prefix — probe-04. A "per-route" limiter therefore keys naturally as route-level middleware, not as a global `app.use` [I: design consequence].
- [E] **Mounted sub-apps inherit parent settings live via prototype chain**, and child overrides shadow without mutating the parent — probe-05; mechanism at `lib/application.js:117-121` (`Object.setPrototypeOf(this.settings, parent.settings)` on `'mount'`); pinned by `test/config.js` ("should inherit from parent app").
- [E] Path matching semantics (v5 syntax): `:name` single segment, `:name?`/`*name`/braces, no regex-in-string; case-insensitive and trailing-slash-optional by default, switchable via `case sensitive routing`/`strict routing` (`lib/application.js:74-77`; pinned extensively by `test/app.router.js:243,423,592+`).
- [E] `res.status()` rejects non-integer/invalid codes with `RangeError` (pinned by `test/res.status.js`); `res.set`, `res.append`, `res.send` behaviors pinned by their respective `test/res.*.js` files (73 test files map ~1:1 onto public methods).
- **Where the suite does NOT cover (danger zone for extension work):** [E: absence verified by grep of `test/` for `429`/`Retry-After`/`rate` — zero hits] there is no existing rate-limiting behavior, no 429 usage, and no timing/concurrency tests at all. [I] The suite is single-process, in-memory, and fast (3s); it pins request/response semantics but nothing about state shared across requests — exactly what a rate limiter introduces (counter storage, clock, eviction). New tests must create that category, and mocha's `--check-leaks` (`package.json:94`) will fail the suite if the limiter leaks globals.

## 4. Conventions (for the factory's guards and builders)

- [E] Implementation lives in `lib/` + `index.js` only; `test/` is mocha specs; `examples/` are runnable demos also exercised as acceptance tests via `test/acceptance/` (`package.json:94`). Guard path patterns: source = `index.js`, `lib/**`; tests = `test/**`.
- [E] Test framework: **mocha + supertest**, command `npm test` = `mocha --require test/support/env --reporter spec --check-leaks test/ test/acceptance/` (`package.json:94`). Coverage: `npm run test-cov` (nyc). `test/support/env.js` sets `NODE_ENV=test` and suppresses deprecation warnings.
- [E] Lint: eslint 8 flat-less config at `.eslintrc.yml` — 2-space indent, `eqeqeq` (null-allowed), no trailing spaces, global `Buffer` banned in favor of `node:buffer` import. Command: `npm run lint`.
- [E] Module system: **CommonJS throughout** (`'use strict'` + `require`/`module.exports`, e.g. `lib/express.js:9-27`); `var` (not const/let) is the prevailing style in `lib/`; prototypes are extended via `Object.create`/`defineGetter`, not classes.
- [E] Dependency posture: small single-purpose deps, caret-pinned (`package.json:34-63`); dev-deps for tests only. [I] Adding a new runtime dependency is a big deal in this project (its identity is "minimalist"; v5 moved code *out*); a rate limiter would be expected to be dependency-free or delegated to a separate package.

## 5. Landmines

- [E] **The router is not in this repo.** `app.use`/`app.route`/`app.param`/verb methods all proxy to `router@2.2.0` (`lib/application.js:26,177,217,257,331`). Changing matching, dispatch, or `next()` semantics means patching a different package. An in-repo per-route limiter must work *within* router's middleware contract, not modify it.
- [E] The app router is **lazily created on first access** with settings frozen at that moment (`lib/application.js:69-82`): `case sensitive routing`/`strict routing` set *after* the first route registration are silently ignored. Any new setting a limiter reads at router-construction time inherits this trap.
- [E] `app.handle` swaps req/res **prototypes per-request** (`lib/application.js:169-170`), and mounted apps restore them on exit (`lib/application.js:230-237`). Anything caching bound methods across apps, or attaching state to prototypes rather than instances, will misbehave under mounting.
- [E] Settings inheritance is **live** (probe-05): a parent `app.set()` after mount changes the child. A limiter reading its config from settings must decide read-time vs registration-time semantics explicitly, or behavior differs across mount setups.
- [E] `trust proxy` has inheritance back-compat magic via a symbol-keyed flag (`lib/application.js:47,101-115`): a child that never set it silently adopts the parent's. Key derivation from `req.ip` changes meaning depending on where the app is mounted.
- [E] Errors that reach `finalhandler` are `console.error`'d unless `env === 'test'` (`lib/application.js:615-618`; observed as stderr stack traces during probe-06). Noisy-but-harmless output in dev; do not "fix" it.
- [E] `--check-leaks` in the test command (`package.json:94`) fails the suite on new global variables — module-level state in a limiter must not touch globals. Also, tests assert exact response bodies/headers (e.g. `test/app.routes.error.js:22` matches `/Error: boom!/`), so header additions on existing paths can break unrelated tests [I: risk assessment].

## 6. Unknowns

- [I→unknown] **Performance envelope.** `benchmarks/` is referenced in nyc excludes (`package.json:95`) but absent from this shallow clone; no perf baseline exists here. Determining the overhead budget for an always-on middleware would require the upstream benchmark harness or a new one.
- [I→unknown] **Upstream intent for rate limiting.** The community solution is the separate `express-rate-limit` package; whether maintainers would accept a built-in is a governance question not answerable from this snapshot (shallow clone, single commit — no history to mine; `History.md` records releases, not roadmap).
- [I→unknown] **Windows/CI matrix behavior.** `.github/` workflows exist but were not analyzed against this environment; all evidence here is Linux/Node 22.
- [I→unknown] **Exact router@2.2.0 internals** (param processing order, layer matching cost). Treated as a black box behind its observed contract (probes 01, 03, 04); claims about its internals would need its own test suite (present in `node_modules/router` but not audited).
