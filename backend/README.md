# Deniz fast food — menu & survey API

Backend for Deniz's online menu: the menu (tabs, categories, products), the banner swiper at the top of the menu
page and the customer survey, plus an admin API to manage all of it. **API only:** the menu page and the admin
panel are separate frontends.

**Stack:** Express 4 + Prisma 5 + PostgreSQL, strict TypeScript. Persian error messages.

Separated from the Roof café project. Not here (removed): reservations, the floor map, payments, SMS / OTP, customer
accounts, working hours, closures, reports, visitor counting, the «نمی‌تونی انتخاب کنی؟» recommender and product add-ons. There is no online
ordering.

---

## Quick start

Requirements: **Node.js 20.19+** and **PostgreSQL 14+**.

```bash
npm install
cp .env.example .env            # Windows: copy .env.example .env
# edit .env: DATABASE_URL, ADMIN_JWT_SECRET, SEED_ADMIN_USERNAME / SEED_ADMIN_PASSWORD (and CORS_ORIGINS, see below)

npx prisma migrate deploy       # creates all tables
npm run db:seed                 # settings, the first admin, the starter survey (and a menu, if prisma/seed-data/menu.json exists)
npm run dev                     # http://localhost:3000
```

### Production

```bash
npm ci
npx prisma migrate deploy
npm run build                   # prisma generate + tsc → dist/
npm start                       # node dist/server.js
```

Uploaded images are stored in `uploads/products/` and `uploads/banners/` next to the code. Keep that folder (and back
it up) across deploys.

**Server setup, updates, backups and recovery: [`deploy/DEPLOY.md`](deploy/DEPLOY.md)** (nginx, systemd, HTTPS,
`deploy/scripts/deploy.sh`, `deploy/scripts/backup.sh`).

### Frontend on another address (CORS)

| Setup | `.env` |
| --- | --- |
| Frontend and API on the same address (`deniz.ir` + `deniz.ir/api` through nginx) | nothing |
| Frontend on another subdomain (`deniz.ir` + `api.deniz.ir`) | `CORS_ORIGINS="https://deniz.ir"` |
| Admin panel on another site (`something.vercel.app` + `api.deniz.ir`) | `CORS_ORIGINS="https://something.vercel.app"` and `ADMIN_COOKIE_CROSS_SITE=true` (https only) |

Frontend code calling the admin API from another address must send the cookie: `fetch(url, { credentials: 'include' })`.

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Development server, restarts on save |
| `npm run build` | Prisma client + server build to `dist/` |
| `npm start` | Start the production build |
| `npm run typecheck` | Type-check server and tests |
| `npm test` | All tests (the integration tests need `TEST_DATABASE_URL`, see below) |
| `npm run test:unit` | Unit tests only, no database needed |
| `npm run db:seed` | Settings, the first admin, the starter survey questions, and the menu from `prisma/seed-data/` if present (safe to re-run; never overwrites) |
| `npm run db:export-menu` | Export this database's menu (tabs, categories, products, images) to `menu-export/` |
| `npm run prisma:deploy` | Apply migrations (production) |
| `npm run prisma:migrate` | Create a new migration after editing `schema.prisma` (development) |

## Admin roles

| Role | Can do |
| --- | --- |
| `DEVELOPER` | Everything, including developer accounts. The seeded admin is a developer. At least one active developer always remains. |
| `MAIN` (manager) | Dashboard, settings, menu tabs, banners, categories, products, survey questions, survey statistics and export, responses, managing `MAIN` / `SECONDARY` admins. |
| `SECONDARY` (staff) | Categories and products (including order, hidden and sold out), survey responses (read, publish, reply, delete). |

The rules live in one place: `src/lib/roles.ts`.

## How the menu works

- **Tabs** (menu types, e.g. پیتزا / برگر / نوشیدنی): manager only. Added last; reordered by the manager; a hidden tab
  takes its categories and products off the menu; deleted only when empty.
- **Categories** belong to one tab and have their own order inside it. A new category goes last; one moved to another
  tab goes last there. Deleting a category with products needs `?withProducts=1`.
- **Products** belong to one category and have their own order inside it (same rules). Two switches:
  - `isActive: false` (**hidden**): not on the public menu at all, kept for later (e.g. a seasonal item).
  - `isAvailable: false` (**sold out**): still listed, the frontend shows it marked «ناموجود».
- **Banners**: the swiper at the top of the menu, one image each (no link), for all screen sizes. Manager only. Optional
  title (shown in the panel and used as the image's alt text). Up to **10 active** banners; inactive ones are kept but
  not shown. jpg / png / webp (no gif: too heavy on mobile data), up to 5 MB.
- **Images** (products and banners): upload first, then send the returned `filename` with the record. A fresh upload
  is temporary until a record uses it (unused ones are deleted after a day). Replacing or deleting a record deletes its
  old file.

## How the survey works

The manager builds the form in the panel. Each question has a text, an **answer type**, «required» or not, an order,
and active / inactive:

| Type | The customer answers | Sent as `value` |
| --- | --- | --- |
| `STARS` | 1–5 stars | integer 1–5 |
| `EMOJI` | 5 faces (1 = very unhappy … 5 = very happy) | integer 1–5 |
| `YES_NO` | yes / no | `true` / `false` |
| `SLIDER` | 0–100 | integer 0–100 |
| `CHOICE` | one of the question's options (2–10) | the option's `id` (number or numeric string) |
| `SHORT_TEXT` | a line (≤ 100 characters) | string |
| `LONG_TEXT` | a paragraph (≤ 1000 characters) | string |
| `PHONE` | an Iranian mobile number (any spelling, Persian digits too) | string, stored as `09xxxxxxxxx` |

- A question that already has answers **keeps its type** (its statistics would mean nothing otherwise): to ask
  something else, add a new question and deactivate the old one. Its text, «required» and options can still change.
  Deactivating hides it from the form and keeps its answers; deleting an answered question needs `?force=1` and
  deletes its answers too. The same goes for a CHOICE option that someone chose.
- **Slider:** the frontend must not send a default value. An untouched slider is «not answered» (rejected when
  required), otherwise a lazy 50 would be counted as an opinion.
- **Public «نظرات» list:** one text question can be the **comment** (`publicRole: COMMENT`) and one the **author's
  name** (`publicRole: NAME`). Staff can publish a response that has a comment, with an optional reply; it then shows
  on `GET /api/reviews`. Nothing is public until published.
- **Starter form** (`npm run db:seed`, only when there is no question yet): the restaurant's form, with three fixes —
  the yes/no «آیا از برخورد پرسنل رضایت داشتید؟» is dropped (the staff star rating says it), «نسبت کیفیت به قیمت» has
  clear options instead of percentages, and an optional phone number lets the restaurant call an unhappy customer back.
- **Spam:** 30 submissions per hour per IP (a whole restaurant shares one Wi-Fi IP) and a honeypot: the form has a
  field named `website`, hidden from people with CSS. Bots fill it; such a submission gets the normal answer and is
  not saved.
- **Statistics** per question for any date range: average and 1–5 distribution (stars, faces), average and
  distribution in 20-point steps (slider), yes / no counts, count per option, number of answers (texts). **Export:**
  all responses as a CSV file that Excel opens with Persian text (a cell a spreadsheet would run as a formula is
  prefixed with `'`).

## API

All responses are JSON. Errors are `{ "message": "..." }` with a 4xx/5xx status. Every message is a full Persian
sentence that ends with a full stop, with numbers in Persian digits (`faDigits` in `src/lib/text.ts`); `test/unit/messages.test.ts`
and every integration test check this, so a new message in another style fails the tests. Image fields hold a file name: the
URL is `/uploads/products/<image>` or `/uploads/banners/<image>` (`placeholder.png` = product without a photo).
Admin endpoints use an `httpOnly` cookie (`adminToken`, 12 hours) set by `POST /api/admin/login`.

Rate limits per IP: public menu reads 1200 / minute (a full restaurant shares one Wi-Fi IP); everything else
120 / minute; survey submissions 30 / hour; **failed** admin logins 10 / 15 minutes per IP and 20 / 15 minutes per
username (successful logins never count). A limit answers `429` with a `message`.

Ids in URLs and bodies are positive integers up to 2,147,483,647; anything else is a `400`.

### Public

| Method & path | Returns |
| --- | --- |
| `GET /api/menu-types` | Visible tabs in order: `[{ id, name }]` |
| `GET /api/categories` | Categories of visible tabs, tab by tab, each tab in its order: `[{ id, name, menuTypeId }]` |
| `GET /api/products[?categoryId=]` | Visible products, each category in its order: `[{ id, name, price, description, image, categoryId, isAvailable }]` |
| `GET /api/banners` | Active banners in slide order: `[{ id, title, image }]` (`title` may be `null`) |
| `GET /api/survey` | Active questions in order: `[{ id, title, type, isRequired, publicRole, options? }]` (`options: [{ id, label }]` on CHOICE only) |
| `POST /api/survey` | `{ answers: [{ questionId, value }], website: "" }` → `201 { message }`. Optional questions may be left out or sent empty. A 400's `message` names the question that is wrong. |
| `GET /api/reviews[?page=&limit=]` | Published comments, newest first: `[{ id, name, text, reply, createdAt }]` (`name` may be `null`); with paging `{ data, page, limit, total }` |

### Admin (`/api/admin/...`)

| Area | Endpoints |
| --- | --- |
| Session | `POST login` `{ username, password }`, `POST logout` (ends the session on **every** device: the token is revoked on the server), `GET me` |
| Dashboard | `GET dashboard` → `{ productsCount, hiddenCount, unavailableCount, categoriesCount, activeBanners, unreadResponses }` |
| Settings | `GET settings`, `PATCH settings` (`cafeName`, `currencyLabel`) |
| Admins | `GET/POST admins`, `PATCH/DELETE admins/:id`. Changing **your own** password needs `currentPassword` next to `password`. Passwords: 8+ characters, at most 72 bytes. |
| Tabs | `GET/POST menu-types`, `PUT menu-types/order` `{ ids }`, `PATCH/DELETE menu-types/:id` |
| Categories | `GET/POST categories`, `PUT categories/order` `{ menuTypeId, ids }`, `PATCH/DELETE categories/:id` |
| Products | `GET/POST products`, `PUT products/order` `{ categoryId, ids }`, `PATCH/DELETE products/:id` |
| Product images | `POST upload` (multipart field `image`) → `{ filename }` |
| Banners | `GET banners` → `{ banners, maxActive }`, `POST banners`, `PUT banners/order` `{ ids }`, `PATCH/DELETE banners/:id`, `POST banners/upload` (multipart field `image`) → `{ filename }` |
| Survey questions | `GET/POST survey/questions` (`{ title, type, isRequired?, publicRole?, isActive?, options? }`), `PUT survey/questions/order` `{ ids }`, `PATCH/DELETE survey/questions/:id`, `POST survey/questions/:id/options` `{ label }`, `PUT survey/questions/:id/options/order` `{ ids }`, `PATCH/DELETE survey/options/:id` |
| Survey responses | `GET survey/responses?filter=all\|unread\|published\|commented&from=&to=&page=&limit=` → `{ responses, total, unread, page, limit }`, `PATCH survey/responses/:id` (`isRead`, `isPublished`, `reply`), `DELETE survey/responses/:id`. Staff see phone answers masked (`0912***4567`); managers see the number. |
| Survey statistics | `GET survey/stats?from=&to=`, `GET survey/export.csv?from=&to=` (dates `YYYY-MM-DD`, Tehran time, both days included) |

Every `.../order` call takes the **complete** list of ids of that list (all tabs; all categories of one tab; all
products of one category; all banners; all survey questions; all options of one question) in the new order, each id once; otherwise it is a 400.

## Security notes (for whoever builds the frontend)

- **Never put API text into the page as HTML** (`innerHTML`, `dangerouslySetInnerHTML`): survey comments, names and
  replies are what customers typed. Render them as text (React does this by default).
- The admin cookie is `httpOnly`: frontend code cannot read it, and does not need to. From another address, send it
  with `fetch(url, { credentials: 'include' })`.
- **CSRF:** every write (`POST`/`PUT`/`PATCH`/`DELETE`) whose `Origin` header is neither the API's own address nor one
  of `CORS_ORIGINS` is refused with `403`, on top of the `SameSite` cookie.
- Admin answers carry `Cache-Control: no-store`; the admin API is `noindex`.
- Rules that span several rows (at most 10 active banners, one public comment / name question, at least one active
  developer, a question's type locked once answered, a survey answer checked against the form as it is) run under a
  PostgreSQL advisory lock, so two requests at the same moment cannot both break them. Image files are only deleted
  after the database change succeeded, and a new image is removed again if saving fails: no orphan files.

## Tests

```bash
npm run test:unit                      # no database needed

# Prisma reads DATABASE_URL, so the test database gets its tables like this:
DATABASE_URL="postgresql://user:pass@localhost:5432/deniz_test?schema=public" npx prisma migrate deploy
TEST_DATABASE_URL="postgresql://user:pass@localhost:5432/deniz_test?schema=public" npm test
```

`npm test` runs everything: the unit tests (`test/unit/`: helpers, uploads, survey rules, config guards, CORS / CSRF,
rate limits) and the integration tests (`test/integration.test.ts`: every endpoint against a real PostgreSQL,
including a security suite and a race suite that fires requests at the same moment and checks the invariants
afterwards). The test database is **wiped** on every run, so its name must contain `test`. Without
`TEST_DATABASE_URL` the integration tests are skipped (on CI that is an error instead).

## CI

The repository holds `backend/` and `frontend/`; GitHub only runs workflows from the repository's root, so they live
in `../.github/workflows/`:

| Workflow | Runs when | What it checks |
| --- | --- | --- |
| `backend.yml` | `backend/` changed (push to `main` / `master`, pull request), weekly on Monday, by hand | Node 20.19 and 22: `npm ci` from the lockfile → `prisma validate` → type check of `src`, `prisma` and `test` → migrations on an empty PostgreSQL 16 → **migrations match `schema.prisma`** (a schema change without its migration fails here) → production build → all unit and integration tests. Also ShellCheck on `deploy/scripts/*.sh` and `npm audit` of the production dependencies (fails on high or critical). |
| `frontend.yml` | `frontend/` changed, by hand | `npm ci` → lint → production build on Linux (catches an import whose letter case does not match the file, which Windows accepts) |

The weekly run catches a new security advisory even when nobody pushes. To block merging a red pull request, turn on
branch protection for `main` (Settings → Branches) and require the jobs.
