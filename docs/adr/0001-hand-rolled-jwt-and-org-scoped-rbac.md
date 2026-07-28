# ADR-0001: Hand-rolled JWT auth, org-scoped RBAC enforced at the query layer, and signup-creates-tenant

**Status:** Accepted and built. Amended 2026-07-26 by [ADR-0005](./0005-deploy-topology-and-the-production-ollama-boundary.md) §Decision-1 — §1b/§1c's `SameSite=Lax`/`Strict` reasoning assumed web and API share a site, which stopped being true on a split-host deploy; both cookies now flip to `SameSite=None; Secure` under `COGENT_CROSS_SITE_COOKIES`. Verified live (real signup, login persistence across a hard reload, `httpOnly` unreadable from JS) on the public deploy, 2026-07-28.
**Date:** 2026-07-20
**Scope:** MVP, interview-critical. Full rigor.
**Resolves:** `portfolio-plan.md` §Project 2 Core-MVP item 1 ("Hand-rolled JWT auth (access token + httpOnly refresh) + org-scoped RBAC enforced at the query layer") and resume bullet 2 ("Designed org-scoped RBAC enforced at the data-access layer and hand-rolled JWT auth, with defense-in-depth tenant isolation"); `cogent-ui-implementation-spec.md` §2.1 and §4-Locked's auth line ("signup creates the org/tenant; no remember me; token handling server-side, invisible to UI"); §1.6's "`orgId` is read server-side from the JWT claim and injected into every query. It is never a client-controllable parameter."
**Related:** Atlas `ADR-0007` (`atlas/docs/adr/0007-dev-idp-stub-and-role-gated-remote-loading.md`) — the deliberately opposite call, argued in §Decision 2 below. Cogent's NL-query guardrail ADR (`adr-nl-query-guardrails.md`) §Decision-3 asserts "`orgId` is read from the authenticated JWT and injected into every query on the server… the model structurally cannot request another org's data because it has no parameter to do so" — **this ADR is what makes that assertion true.** That ADR states the property; this one builds the mechanism it depends on.

---

## Context

Cogent-AI is a multi-tenant LLM cost and observability platform. The data under management is other people's **billing and usage data**, segmented by organization. The product's entire value proposition rests on a claim that is a security claim: *your spend data is yours, and no other tenant — and no LLM acting on another tenant's behalf — can reach it.*

That claim has to survive three attackers, not one:

1. **The curious user.** Logged in, valid session, edits a URL or a request body to name another org.
2. **The determined user.** Forges or replays a token, guesses resource IDs from another tenant, probes for an enumeration oracle.
3. **The model.** The NL-query assistant is a code path where an LLM chooses which data-access function to call and supplies its arguments. This caller does not originate from an HTTP route the way a user request does, and it is the feature the whole product exists to demonstrate.

The third one is why this ADR cannot be a generic "we use JWTs" writeup. Cogent is about to introduce a non-human caller into its data layer. Any control that lives above the data layer does not cover it.

**What exists today.** `apps/api` is a bare NestJS 11 scaffold — a controller, a service, a module, no database, no auth. `apps/web` has the Foundation from the previous session (tokens, shell, routing, theme, fonts, `QueryClient`) and nothing behind it. There is no user, no org, and no schema. Everything below is greenfield, which means the enforcement seam gets to be structural rather than retrofitted — and that is worth spending the session on, because retrofitting tenant isolation onto an existing data layer is exactly the migration nobody ever finishes.

---

## Decision 1 — Hand-rolled JWT: stateless access token, stateful revocable refresh, org scope bound at the query layer

Four sub-decisions. Each is stated with the alternative it beats, because "hand-rolled" without specifics is a phrase, not a design.

### 1a. Password hashing: argon2id, via `@node-rs/argon2`

argon2id at the OWASP baseline (`m=19456` KiB, `t=2`, `p=1`), 16-byte random salt per hash, encoded PHC string stored in `users.password_hash`.

**Over bcrypt:** argon2id is memory-hard, so a GPU/ASIC attacker cannot buy the same parallelism advantage bcrypt concedes; and bcrypt silently truncates input at 72 bytes, which is a footgun for passphrase users. bcrypt is not *wrong* — it is a known-good pattern and I would accept it in a code review — but argon2id is the current OWASP first choice and there is no cost to taking it.

**Why `@node-rs/argon2` specifically:** it is a Rust N-API binding shipping prebuilt binaries for `win32-x64` (this dev machine) and `linux-x64-gnu` (Vercel/Lambda). The `argon2` npm package requires node-gyp compilation, which is the single most common way a "known-good pattern" turns into an afternoon. If prebuilts turn out to be a problem in deployment, the fallback is bcrypt, one file changed — the hash algorithm sits behind a two-function module (`hash`, `verify`) precisely so this stays a one-file decision.

**Memory note, since this deploys to Lambda:** 19 MiB per concurrent hash. Irrelevant at demo scale, worth knowing before someone asks why the login function's memory floor is what it is.

This is the least interesting decision in the ADR and it gets the least space, per the brief.

### 1b. Access token: JWT, HS256, 15 minutes, `httpOnly` cookie

Claims: `sub` (user id), `org` (the org this session is currently acting as), `role`, `iat`, `exp`, `jti`. Signed HS256 against a single server-side secret.

**HS256 not RS256:** RS256 exists to let *other* parties verify a token without holding the signing key. Cogent has exactly one verifier and one issuer — the same NestJS process. Asymmetric signing here buys key-distribution machinery for a distribution problem that does not exist. (This is the same reasoning Atlas's ADR-0007 §Decision-1 used, arriving at the same answer for the same reason — the difference between the projects is not the crypto.)

**15 minutes**, because the access token is deliberately not revocable and its TTL *is* the blast radius. See §1d.

**Cookie, not response body.** `httpOnly; Secure; SameSite=Lax; Path=/`. The spec (§2.1, §4-Locked) requires token issuance be "server-side and invisible to the UI"; `httpOnly` is what makes that structurally true rather than a convention the frontend agrees to follow. JS cannot read it, so XSS cannot exfiltrate it — which is the entire reason not to use `localStorage`. `Secure` is disabled on `localhost` in dev only, via config, not via a code branch that could ship.

### 1c. Refresh token: **opaque random string, stored hashed in Postgres, rotated on every use, with reuse detection**

This is the sub-decision that earns the word "hand-rolled," so it gets argued properly.

The refresh token is **not a JWT**. It is 32 bytes from `crypto.randomBytes`, base64url-encoded. The server stores only its **SHA-256 hash** in a `refresh_tokens` table alongside `user_id`, `org_id`, `family_id`, `expires_at`, `revoked_at`, `replaced_by`.

**Why not a JWT for refresh?** A JWT refresh token cannot be revoked without a server-side denylist — at which point you have built the database table anyway, but with worse ergonomics (you are storing tokens you wish were invalid, instead of storing sessions that are valid). Statelessness is a property worth paying for on the hot path; on a credential used once every 15 minutes, it buys nothing and costs the ability to log someone out.

**Why SHA-256 and not argon2id for this hash?** Because the threat models are different, and conflating them is a common mistake. A password is low-entropy and human-chosen — a stolen hash is attacked with a dictionary, so the hash must be *slow*. A refresh token is 256 bits of CSPRNG output — there is no dictionary, and no feasible brute force, so a slow KDF adds latency to every refresh and defends against nothing. Fast hash for high-entropy secrets, slow hash for low-entropy ones.

**Rotation with reuse detection** (the OAuth 2.0 Security BCP pattern, built by hand here):

- Every `POST /auth/refresh` **consumes** the presented token: sets `revoked_at`, sets `replaced_by` to the new row's id, and issues a fresh refresh token in the same `family_id`.
- If a token that is **already revoked** is presented, that is a replay. The only way a legitimate client presents a consumed token is if it never received the replacement; the more likely explanation is that the token leaked and both the attacker and the user are now using the chain. So: **revoke the entire family**, forcing a real re-login. A false positive costs one login. A false negative costs a persistent silent session for an attacker.
- `Path=/api/auth`, `SameSite=Strict` on this cookie — it is never needed on any other route, so it is never sent on any other route. (The access cookie stays `Lax` so a top-level navigation into the app from an email link still arrives authenticated; `Strict` on refresh is safe because refresh is only ever called by same-site XHR from an already-loaded page.)

**The second thing refresh buys, which is the one I actually care about:** refresh is a database round-trip, so it is the natural place to **re-verify authorization**, not just authenticity. On every refresh the server re-reads the membership row and re-issues the `org` and `role` claims from the database — it does not copy them forward from the old token. A user removed from an org, or demoted, loses access within one refresh interval without any denylist infrastructure. This is why revocation and RBAC freshness are the same mechanism here, and it is a direct consequence of choosing a stateful refresh over a stateless one.

### 1d. The honest residual: a ≤15-minute window — and it is two different threats, not one

Logout revokes the refresh row. It **does not** revoke the outstanding access token, because the access token is verified by signature alone with no database read. A stolen access token therefore remains valid until its `exp` — at most 15 minutes.

That single sentence covers two situations that deserve separate answers, because they are not the same threat and an interviewer will ask about the second one specifically.

**Path A — routine logout.** The user clicked "log out" on their own device. The credential is not in an adversary's hands; the user simply expressed an intent to end the session. A 15-minute tail on a credential nobody is holding is not a security event. **Accepted without reservation** — this is the ordinary case and it needs no mitigation at all.

**Path B — emergency revocation.** A laptop was stolen, a token leaked, an employee left under bad circumstances. Someone needs the session dead *now*, and "now" means now, not within fifteen minutes. This is a genuinely different threat: the credential is assumed to be in hostile hands and actively in use.

**The answer for Path B is the same 15-minute window, and here is why that is an acceptable trade for this product rather than an oversight.** Three reasons, stated as a conclusion so nobody has to infer it:

1. **The window is bounded and short by design** — 15 minutes is chosen *for* this case, not for convenience. Every minute of access-token TTL is a minute of un-revocable access, so the TTL is the emergency-revocation SLA. That is the real reason it is not an hour.
2. **The refresh chain dies immediately.** Revoking the refresh family means the attacker gets at most one access token's remaining life and then is locked out permanently, with no path back. They do not get a foothold; they get a countdown.
3. **What is reachable in that window is bounded by what Cogent stores** — aggregated spend and usage figures for one org. There is no funds movement, no destructive action, and no credential material to escalate with. If this product held payment instruments or could initiate transfers, the calculus would change and I would build the denylist.

**What I would build if any of those three stopped being true** — and this is the escalation path, named with its mechanism so the answer isn't a hand-wave: a short-TTL denylist of revoked `jti`s in Redis, checked by the auth guard. The key property that makes it cheap is that entries expire at the access token's own `exp`, so the denylist is never larger than 15 minutes of revocations regardless of user count — it does not grow with the system. Rejected for MVP because it adds infrastructure (Redis) and a read to every authenticated request to close a window that, for this data, points 1–3 already make acceptable.

The alternative I explicitly rejected is a `token_version` column checked per request: same protection, but it puts the read in Postgres on the hot path, which is precisely the cost statelessness was purchased to avoid, and it converts every data endpoint into a two-query endpoint.

**CSRF, since this is cookie auth and it will be the first thing an interviewer asks.** Three controls, no token: `SameSite=Lax` means cookies are not sent on cross-site POST at all, which kills form-based CSRF; the API accepts only `Content-Type: application/json`, which forces a CORS preflight that a simple cross-site form cannot produce; and CORS is an explicit origin allow-list, not a wildcard. A double-submit CSRF token adds a fourth layer over three that already close the vector. Decided and scoped, not omitted.

---

## Decision 2 — The Atlas contrast: one rule applied twice, not two moods

Atlas's ADR-0007 rejected building real auth and shipped a dev IdP stub. This ADR builds real auth. Same engineer, same month, same runway, opposite calls. If the only justification is "different projects," that is a shrug, not an answer. Here is the rule that generates both.

**The rule: build what your project's central claim is *about*. Stub what your central claim merely *consumes*.**

**Atlas's central claim** is that heterogeneous frontends compose at runtime, and that which bundle a browser is even permitted to *request* is a server-side decision. Trace what that claim consumes from the identity layer and you get exactly one thing: *a verified set of role claims for this request*. ADR-0007 §Decision-1 draws the seam explicitly and shows that everything below "the request carried validated role claims R" — registry filtering, route guards, the API backstop — is byte-for-byte identical whether R came from a dev stub or from Cognito with MFA and rotating JWKS. Identity is a **dependency** of Atlas's claim, and its provenance is invisible to the claim. Dependencies get stubbed at their narrowest interface. Wiring Cognito would have demonstrated the ability to follow an AWS integration guide and would have changed nothing about the federation gate that is the point.

**Cogent's central claim** is that multiple tenants' billing data coexist in one system and cannot cross, including through an LLM. Trace what *that* claim consumes from the identity layer and the trace does not terminate — because `orgId` is not an input the interesting code happens to take. The correctness of the entire system is a statement **about where `orgId` comes from and how tightly it is bound to the data access**. Identity is not a dependency of the claim; identity is the claim's **subject**. You cannot stub the thing you are asserting.

**The tell for which case you are in: ask what a reviewer attacks.** Nobody attacks Atlas by asking "is the login real?" — they attack it by force-mounting a remote past the gate, which is exactly the adversarial test ADR-0007 §Verification wrote for itself. Everybody attacks Cogent by asking "what stops org A from reading org B?" That is not a rhetorical difference; it decides where the effort goes.

**And now the argument that makes this more than a preference — the one to lead with in an interview:**

> **Buying Cognito for Cogent would not have removed any of the work Cogent's threat model actually requires.**

Cognito authenticates a *user*. It has no concept of what an org means in Cogent's schema, and no ability to participate in the join between a membership and a `usage_event` row. Multi-tenant modeling in Cognito means either a user pool per tenant — an operational and quota nightmare that scales with your customer count — or custom attributes and groups carrying an org identifier, which is hand-rolling the org model anyway, only inside a vendor's constraints and with identity living in a system your database cannot join against. Either way, **every line of §Decision 3 below still has to be written by hand.** Cognito would have replaced the password-hashing and token-minting code — roughly the least interesting 200 lines in the project, and precisely the part nobody attacks — while leaving 100% of the part under attack untouched.

So this is not "I built auth because it's a security product." It is: *for Atlas, the managed service would have covered the whole of what I needed and I still declined it because it wasn't the story; for Cogent, the managed service would have covered none of what I need, so declining it wasn't even the interesting decision — the interesting decision was where to put the enforcement.*

**The rule is falsifiable, and it holds in the other direction.** Cogent stubs plenty: no MFA, no email verification, no password reset, no SSO/SAML, no member-invite flow. Every one of those is real identity product surface, and not one of them is load-bearing for tenant isolation. If the rule were post-hoc rationalization for "I felt like building auth this time," Cogent would have built those too.

**Both ADRs are falsifiable in the same way, which is the closing symmetry.** ADR-0007 names the test that would prove it wrong: force-mount the admin bundle as a viewer and check whether real data appears — *"If this ever shows real data, Decision 3 is false and the ADR needs to be revised before merge."* This ADR names its own in §Verification: authenticate as org B, request org A's data by every route available, and check whether anything but zero rows comes back. Two decisions that went opposite ways, both stated as claims that a browser can refute.

### Alternatives rejected

- **Cognito here too, for consistency with Atlas.** Rejected. Consistency across two portfolio projects is not a goal — it is the absence of one. The two projects are two *arguments*, and the pair "here is when I bought identity and here is when I built it, and here is the rule that decides" is a strictly better interview answer than either decision twice. The substantive reason is above: Cognito would not have removed the work this threat model requires.
- **Session-based auth (server session id, no JWT).** Rejected, but with an admission that makes the rejection honest: **this design is already a hybrid.** The refresh token *is* a server-side session — opaque, database-backed, revocable. What is stateless is only the 15-minute access credential. Pure sessions put a database read on every single request; a pure JWT design has no revocation at all. Splitting them puts the database read on the 15-minute boundary and keeps the hot path signature-only. Claiming this is "stateless JWT auth" would be a nicer soundbite and less true; the hybrid is the actual design and the better answer. Secondary point: the ingestion endpoint is machine-to-machine from customers' own services, which fits a bearer-credential model far better than a browser session cookie.
- **A third-party auth library (Auth.js / Lucia).** Rejected for this project only, and narrowly: the resume bullet is *"hand-rolled JWT auth,"* and the interview value is being able to explain rotation, reuse detection, and hash-choice reasoning as decisions rather than as a library's defaults. On a real product with a team, I would take the library — that is the honest version of this rejection, and it is worth saying out loud rather than pretending hand-rolling is generally correct.

---

## Decision 3 — Org scope is enforced at the query layer, and made structurally unforgeable in three overlapping ways

This is the decision the ADR exists for.

**What "query layer" means precisely:** every data-access function takes a tenant scope as a **mandatory first parameter**, derived from the verified token, and composes its `WHERE` clause from that scope and never from anything reachable by request input. Not the controller. Not a route guard. The function that talks to the database.

The problem with stating it that way is that it describes a *discipline*, and disciplines decay. "Remember to pass `orgId`" holds until the third developer, or the second month, or the first refactor. So the enforcement is built from three overlapping structural properties, none of which is "remember":

**(i) The client has nowhere to put an `orgId`.** Every request DTO is a Zod schema declared `.strict()`, and **no DTO contains an `orgId` field**. A request that includes one is rejected with a 400 at the boundary — loudly, not silently stripped, because silent stripping is how you discover six months later that a client has been sending a field nobody reads.

**(ii) A tenant scope cannot be constructed from request data — the type system forbids it.** `OrgId` is a branded type (`string & { readonly __brand: 'OrgId' }`), and the *only* function that can produce one is the token verifier. `TenantScope` is `{ orgId: OrgId; userId: UserId; role: Role }`, constructed exclusively by the auth guard from verified claims and attached to the request. Passing `req.body.orgId` where a `TenantScope` is expected is not a bug that a reviewer might catch — it is a **compile error**. This is the load-bearing property: the safe path is the only path that type-checks.

**(iii) Every data-access function's signature demands it.** `(scope: TenantScope, args: T) => Promise<R>`, with the scope first and non-optional. You cannot forget it, because forgetting it does not compile. And all tenant-scoped SQL is composed through a single helper that appends the `org_id = $scope.orgId` predicate, so there is exactly **one** place in the codebase where that clause is written — not one place per table.

**Why the ORM choice is part of this decision and not a separate one.** Prisma's generated client is ambient: `prisma.budget.findMany({})` — unscoped, wide open across all tenants — compiles cleanly and reads like normal code. Enforcing (iii) against Prisma means Client Extensions, i.e. building a wrapper to prevent the use of the thing you installed. **Drizzle** is chosen instead: typed SQL, migrations included, no ambient client that routes around the seam, and repositories that are plain functions where the branded-scope signature drops in naturally. Prisma is the more mainstream pick and I would default to it on most projects; the reason to decline it here is specific to this ADR's enforcement claim, which is the only kind of reason that justifies going against a default.

### What a determined user actually hits

Not a claim that they are stopped — a walk down the ladder, with the specific mechanism at each rung:

1. **Adds `orgId` to the request body or query string.** Zod `.strict()` rejects the unknown key → **400**. Nothing reads it because no schema declares it.
2. **Forges a JWT with a different `org` claim.** HS256 signature verification fails → **401**. They do not hold the secret.
3. **Replays a captured refresh token after it has been used.** Reuse detection fires, the entire token family is revoked → **401**, and the legitimate user is forced to re-login (a visible, investigable event rather than a silent compromise).
4. **Uses a genuinely valid token for org B and asks for org A's aggregates.** The scope says B; the query is composed with B. They receive **their own data**. There is no request shape that expresses "give me A's" — this is the point of (i) and (ii) together: not "the request is rejected," but "the request is unrepresentable."
5. **Guesses a resource id belonging to org A** (e.g. `GET /budgets/:id` with a leaked uuid). The predicate is `id = $1 AND org_id = $scope.orgId` → zero rows → **404, deliberately not 403.** A 403 would confirm that the id exists in *some* org, turning the endpoint into an existence oracle for enumeration. The correct answer to "does org A's budget 7f3c… exist?" asked by org B is "no such thing," because from B's perspective that is true.
6. **Asks the NL-query assistant to fetch another org's spend.** The model's tool schema (the guardrail ADR's Zod allow-list) has **no `orgId` parameter** — the scope is applied by the query function the model's chosen tool resolves to, not by anything the model can populate. There is no argument for the model to get wrong and no prompt injection that supplies one, because the field the injection would need to target does not exist in the tool definition.

**The honest residual, stated because the alternative is a false claim.** A developer working *inside* the repository layer can still write a raw query that omits the predicate. Type systems constrain callers, not authors. Two mitigations, one built and one deferred:

- **Built:** a **tenant isolation contract test** that seeds two orgs with data, then calls every exported data-access function with org B's scope and asserts that not one of them returns a row belonging to org A. It is a single test file that grows by one case per new function, and it is the thing that actually catches the omitted predicate.
- **Designed, not built:** Postgres **Row-Level Security** — an `org_id` policy on every tenant table, with the scope pushed into a `SET LOCAL` per transaction. This closes the residual completely, at the database, below any application code that could be wrong. It is rejected for MVP because it requires transaction-scoped connection state (a real interaction with pooling that has to be got right), a non-superuser application role, and every future contributor understanding a second enforcement layer — cost that CLAUDE.md's simplicity-first ordering does not justify for a demo whose contract test covers the same failure. It is named here with its mechanism, so "how would you make this airtight?" has a concrete answer.

### Alternative rejected: enforce org scope at the API-route level only

A guard on each controller reads `orgId` from the token and checks it against the requested resource. Rejected — but **not** for the reason Atlas's ADR-0007 rejected client-side gating. That argument was *"a trust boundary on the side the adversary controls isn't a boundary,"* and it does not apply here: a route guard runs on the server, where the adversary is not standing. Reusing that analogy would be lazy. The real argument is different, and it is about **distance from the data**:

A route-level check is correct on the day it is written and silently wrong the day someone adds a code path that is not a route. And Cogent is not hypothetically going to do that — **Cogent's differentiating feature is a non-HTTP caller of the data layer.** The NL-query assistant has an LLM select a data-access function and supply its arguments. That call does not pass through a controller, so an HTTP-layer check does not cover it. The same hole opens for the scheduled budget-threshold evaluation, and for the ingestion path, and for anything that arrives on a queue later.

So the argument against route-level enforcement is not that it is bypassable — it is that **it does not cover the feature this product exists to demonstrate.** A check at the query layer covers every caller by construction, because every caller has to go through the query layer to get data. That is what "closest to the data" buys, and it is why the guardrail ADR's claim that the model "structurally cannot request another org's data" is only true if the enforcement lives here.

There is a version of this ADR that keeps route guards *as well* — defense in depth. I am not adding them, for the reason ADR-0007 §Decision-2 gave for preferring a single filtered source over "check in both places": **two independent checks are two things that can disagree, and the one that drifts is the one nobody notices.** One check, at the layer every caller must pass, with a contract test proving it.

---

## Decision 4 — Signup creates the tenant; the first user is `owner`; role lives on a membership

### The tenant-creation sequence

One transaction, four steps, no check-then-insert anywhere:

1. **Validate** (Zod, `.strict()`): email format; password ≥ 12 characters; org name 2–64 characters after trimming.
2. **Derive a slug** from the org name — lowercase, collapse whitespace, strip punctuation. **Uniqueness is enforced on the slug, not the display name**, so "Acme Robotics", "acme robotics", and "Acme  Robotics!" collide, which is what a human means by "that name is taken."
3. **Insert inside one transaction:** `orgs` → `users` → `memberships(role: 'owner')`. If any step fails, the transaction rolls back. A half-created tenant — an org with no owner, or a user with no org — is worse than a failed signup, because the failed signup is retryable and the orphan is not.
4. **Handle collisions by catching the constraint, not by pre-checking.** `UNIQUE` on `orgs.slug` and `users.email`; on Postgres error `23505`, map to the spec's exact copy — "That organization name is taken." for the org, and the email equivalent. A `SELECT … WHERE slug = ?` followed by an `INSERT` is a TOCTOU race: two concurrent signups with the same name both pass the check, and one of them gets a 500 instead of the correct message. The database constraint is the only check that is actually atomic, so it should be the *only* check.

Then issue the access + refresh cookie pair and return `{ authenticated: true, org: { name }, role }` — **no token in the response body**, per §2.1's "token issuance is server-side and invisible to the UI."

### The first user's role: `owner`, and there are exactly two roles

The spec does not say, so this decides it.

**Two roles: `owner` and `member`.** The signup user is `owner`.

**Why `owner` and not `admin`.** `admin` implies a level above it that can create and demote admins. In a self-serve signup product there is no super-admin — the creating user *is* the top of their org. Naming the role `owner` encodes an invariant that is real and enforceable: **an org always has at least one owner, and the last owner cannot be demoted or removed.** That is a constraint the code can hold and an interviewer can probe. `admin` carries no such invariant and quietly invites the question "administered by whom?"

**Why two and not three or four.** A `viewer` role that no screen ever enforces is speculative RBAC — schema that looks like judgment and is actually decoration. Cogent's MVP has exactly one privileged action set (budget alert CRUD, and later member invites) against a read surface (the Statement, the assistant). Two roles express that exactly. Atlas landed on two roles for the same reason and said so in ADR-0007's trade-offs; the convergence is not laziness, it is that a demo can only *demonstrate* a distinction it actually enforces somewhere. The third role gets added when a screen needs it, and that day the migration is one enum value.

**Worth stating plainly, because it is the part people get backwards:** roles are the *secondary* axis here. The resume bullet is "org-scoped RBAC," and the interesting half is org-scoping — tenant isolation, §Decision 3 — not role granularity. A rich role matrix over a weak isolation boundary would be the wrong project.

### Roles live on `memberships`, not on `users` — and this is a correction to the spec's implied model

`memberships(user_id, org_id, role)`, with `UNIQUE(user_id, org_id)`. Email is globally unique on `users`: one identity, many memberships.

**Why, and why now.** The spec's §1.6 locks an **OrgSwitcher** that is always present, and specifies switch behavior in detail — refetch scoped data, clear the transient query log, reset the Budgets form, move focus, announce via `aria-live`. A single `users.org_id` column makes every one of those behaviors unreachable, and the switcher becomes chrome that describes a capability the data model forbids. That is the failure mode CLAUDE.md's placeholder rule exists to prevent: structure the model for the slot, do not stub the slot.

It also fixes the semantics of the `org` claim. With memberships, `org` in the JWT means *"the org this session is currently acting as"* — which is what an org switcher switches, and what §1.6's "`orgId` is read server-side from the JWT claim" needs it to mean. With a column on the user it would mean "the org this user permanently is," and switching would be incoherent.

The cost now is one table and one join. The cost later — migrating a single-tenancy assumption out of a live schema — is the migration people write blog posts about not finishing.

**Deliberately not built:** the invite flow and the switch interaction. MVP signup produces exactly one membership per user, so the switcher renders the current org name as text (which §1.6 requires regardless) and does not offer a second option to switch to. The model supports multi-org; the UI does not yet exercise it. That is "designed the model, deferred the interaction," which is a legitimate answer — distinct from having designed a model that cannot support the locked UI.

**One security consequence, which closes the loop with §1c:** because role and org live on a membership row rather than in the user's identity, the access token's `org` and `role` claims are a **cache** of that row. That is exactly why `POST /auth/refresh` re-reads the membership from the database and re-derives both claims instead of copying them forward. Revocation, demotion, and removal from an org are one mechanism with one bounded staleness window — the 15 minutes from §1d — rather than three separate problems.

---

## Consequences (on approval)

- `apps/api` gains: Drizzle + `pg` + a migration for `orgs`, `users`, `memberships`, `refresh_tokens`; an `auth` module (`POST /auth/signup`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `GET /auth/session`); an auth guard producing `TenantScope`; and the `db/scope` primitives — branded `OrgId`, the scoped-query helper, the repository signature convention.
- **Schema sequencing departs from schedule-v2 §4, deliberately and narrowly.** Jul 23 owns "Postgres schema," but signup cannot exist without `orgs`/`users`. The four auth tables land today; the usage, projects, and budgets schema stays on Jul 23 as planned. Recorded here so the deviation is visible rather than discovered later.
- `apps/web` gains `/login` and `/signup` per §2.1, outside the shell, and a `credentials: 'include'` fetch convention.
- **`portfolio-plan.md` §Project 2 needs a one-line correction.** It states the Atlas contrast as "Cognito there vs. hand-rolled JWT here," which schedule-v2 §1 invalidated when it cut Cognito from Atlas. The live contrast is *reasoned stub (ADR-0007) vs. built (this ADR)* — a stronger pairing, since it is two decisions rather than one purchase, but the plan document currently asserts the dead version.
- **ADR numbering established.** This is `0001`. `adr-nl-query-guardrails.md` opens by deferring its own number ("slot into Cogent-AI's existing sequence — likely after the two-database and hand-rolled-auth ADRs"); on approval it becomes `0003`, with the two-database ADR due Jul 23 taking `0002`. Renames deferred to that session so this one does not churn files it is not otherwise touching.
- Resume bullet 2 ships as: *"Designed org-scoped RBAC enforced at the data-access layer — every query function takes a tenant scope derived from the verified token, with client-supplied org identifiers unrepresentable in the type system — and hand-rolled JWT auth with rotating, reuse-detecting refresh tokens."*

## One judgment call surfaced rather than decided

**Login rate limiting is not in the build list above, and I think it should be.** argon2id makes each attempt expensive but that is a cost, not a defense. A per-(IP, email) attempt counter with exponential backoff is roughly 20 lines and turns "what stops password brute-forcing?" from "hashing is slow, and throttling is designed-not-built" — a visibly thin answer — into a real one. It is genuinely adjacent scope on a day that is already ~2 days ahead of schedule-v2's calendar. Say if you want it in; the ADR ships either way, and if it is cut it becomes an explicit deferred line rather than an omission.

## Verification plan — reproduce, don't assert

Per this branch's method, and directly mirroring ADR-0007's adversarial standard. None of these is a unit test with a mocked scope; the point is that a mocked scope proves nothing about the seam.

1. **Signup creates a real tenant.** Sign up; query Postgres directly and confirm exactly one `orgs` row, one `users` row with an argon2id PHC-format hash (verify the plaintext is nowhere in the row), and one `memberships` row with `role = 'owner'`.
2. **Cookies are genuinely `httpOnly`.** DevTools → Application → Cookies: `HttpOnly` checked on both. Then, in the console, `document.cookie` — confirm neither token appears. Reading the flag in a table is not the test; failing to read the value from JS is.
3. **Cross-org read, the adversarial case — Cogent's equivalent of ADR-0007's force-mount.** Create orgs A and B with distinct seeded data. Authenticate as B. With B's valid session cookie, call every data endpoint directly via `curl`/devtools `fetch` — bypassing the UI entirely — including a direct-by-id request for a resource whose uuid belongs to A, read out of the database. Assert: zero rows of A's data, and **404 rather than 403** on the by-id probe. Then attempt it with `orgId` injected in the body and in the query string, and assert 400 from Zod `.strict()`. Reject at the query layer, not hidden in the UI.
4. **Refresh actually rotates.** Record the refresh cookie value and the `refresh_tokens` row. Call `/auth/refresh`. Assert the cookie value **changed**, the old row has `revoked_at` and `replaced_by` set, and a new row exists in the same family. A 200 response proves nothing.
5. **Reuse detection fires.** Replay the *old* refresh token after rotation. Assert 401 **and** that every row in the family is now revoked — not merely that the replayed token was rejected.
6. **Logout, including the residual.** Logout revokes the refresh row and a subsequent refresh 401s. Then demonstrate the negative honestly: the pre-logout access token still authenticates a data request until `exp`. This must be shown, not glossed — §1d claims a bounded window, and an unverified bound is the `strictVersion` failure again.
7. **Screen 2.1 against the spec:** split ≥900px, single column <900px, ledger motif hidden <640px; org-name field present on signup only with its helper text; error banner reads exactly "Email or password is incorrect."; `role="alert"` on the banner; focus moves to the first error on failed submit; password toggle carries `aria-pressed`.

**Any of 1–6 failing is a finding reported as a finding, not worked around.**
