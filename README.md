# Allo Inventory — Take-Home Exercise

A Next.js 14 App Router application implementing race-condition-safe inventory reservations for a multi-warehouse retail platform.

---

## Local setup

### 1. Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project (free tier is fine)
- An [Upstash](https://upstash.com) Redis database (free tier)

### 2. Clone and install

```bash
git clone <repo>
cd allo-inventory
npm install
```

### 3. Environment variables

Copy `.env.example` to `.env.local` and fill in all values:

```bash
cp .env.example .env.local
```

| Variable | Where to find it |
|---|---|
| `DATABASE_URL` | Supabase → Project Settings → Database → Connection string (Transaction pooler, port 6543) |
| `DIRECT_URL` | Same page, Session pooler or direct connection (port 5432) |
| `UPSTASH_REDIS_REST_URL` | Upstash console → REST API |
| `UPSTASH_REDIS_REST_TOKEN` | Same |
| `RESERVATION_TTL_MINUTES` | Default `10`, adjust as needed |
| `CRON_SECRET` | Any random string — used to authenticate the expiry cron |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` locally; your Vercel URL in production |

### 4. Run database migrations

Apply the migration SQL directly to your Supabase database using the SQL editor or `psql`:

```bash
# Using psql (replace with your connection string)
psql "$DIRECT_URL" -f prisma/migrations/0001_init/migration.sql
```

Or paste `prisma/migrations/0001_init/migration.sql` into the Supabase SQL editor and run it.

Then generate the Prisma client:

```bash
npx prisma generate
```

### 5. Seed the database

```bash
npm run db:seed
```

This creates 3 warehouses and 6 products with realistic stock levels.

### 6. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Deployment (Vercel + Supabase + Upstash)

1. Push to GitHub.
2. Import the repo in [Vercel](https://vercel.com).
3. Add all environment variables in Vercel → Project → Settings → Environment Variables.
4. Set `NEXT_PUBLIC_APP_URL` to your Vercel production URL.
5. Deploy — Vercel picks up `vercel.json` and schedules the cron automatically.

---

## How the expiry mechanism works

### Primary: Vercel Cron (every minute)

`vercel.json` schedules `GET /api/cron/expire` to run every minute. The endpoint:

1. Finds all `Reservation` rows where `status = PENDING` and `expiresAt < NOW()`.
2. Releases them in a single Prisma `$transaction` — each expired reservation decrements `Inventory.reserved` and flips `Reservation.status` to `RELEASED`.
3. Is protected by a `CRON_SECRET` bearer token so it can't be called externally.

**Worst case:** an expired reservation holds stock for up to 60 seconds after `expiresAt`. For a 10-minute window this is a ~1% overhang — acceptable for this use case.

### Secondary: Lazy cleanup on read

The `POST /api/reservations/:id/confirm` route checks `expiresAt < now` before processing. If the reservation has expired but the cron hasn't run yet, it returns `410` immediately **and** triggers the release inline. This prevents a user from confirming a technically-expired reservation in the cron gap.

---

## Concurrency correctness

The core race condition (two requests for the last unit) is prevented by two independent layers:

### Layer 1 — Redis distributed lock (`SET NX EX`)

Before touching inventory, `POST /api/reservations` acquires a lock keyed to `lock:inventory:{productId}:{warehouseId}`. The key is set with `NX` (only if not exists) and `EX 15` (auto-expire in 15 s). A second concurrent request for the same product+warehouse will fail to acquire the lock and receive a `429`, preventing DB contention entirely.

### Layer 2 — Atomic SQL `UPDATE ... WHERE available >= qty`

Even if the Redis lock fails open (network hiccup, Upstash unavailability), the database update is atomic:

```sql
UPDATE "Inventory"
SET    "reserved" = "reserved" + $quantity
WHERE  "productId"   = $productId
  AND  "warehouseId" = $warehouseId
  AND  ("total" - "reserved") >= $quantity
RETURNING id
```

If two requests race to this statement, Postgres serialises them at the row level. The second update sees `reserved` already incremented by the first and the `WHERE` condition fails → it returns 0 rows → API returns `409`. No double-sell is possible.

The Redis lock is defence-in-depth; the SQL `UPDATE` is the correctness guarantee.

---

## Idempotency

`POST /api/reservations` and `POST /api/reservations/:id/confirm` support the `Idempotency-Key` header.

**Implementation:**

1. If no header is present the request is processed normally.
2. If the key has been seen before (and the record hasn't expired after 24 h), the stored `statusCode` + `responseBody` are returned immediately with an `X-Idempotent-Replayed: true` header — no side effects.
3. If the key is new, the handler runs, the response is stored in the `IdempotencyRecord` table (Postgres, TTL 24 h), and then returned to the client.

**Storage choice:** Postgres rather than Redis for idempotency storage. Rationale: Redis is used for distributed locking where sub-millisecond response and TTL auto-expiry matter. Idempotency records need to survive Redis restarts, are write-once, and benefit from the same transactional guarantees as the rest of the data. A single table is simpler to operate.

---

## Trade-offs and things I'd do differently with more time

### What's here
- Full end-to-end flow: reserve → countdown → confirm / cancel
- Race-condition-safe via Redis lock + atomic SQL (two independent layers)
- Idempotency via `Idempotency-Key` header stored in Postgres
- Automatic expiry via Vercel Cron + lazy cleanup on read
- Shared Zod schemas between API and frontend
- Live countdown with polling on the checkout page

### What's missing / simplified

**Auth:** There's no user session — anyone with a reservation ID can confirm or cancel it. In production you'd associate reservations with a user session or JWT.

**Optimistic UI:** The product listing page is a Server Component that re-fetches on navigation. In a real app you'd invalidate the cache with `router.refresh()` or use SWR/React Query with websocket/SSE updates for real-time stock levels.

**Partial-quantity reservations:** The reserve endpoint requires the full requested quantity to be available. A real system might want to allow partial fulfillment from multiple warehouses.

**Idempotency key collision:** The current implementation stores idempotency records globally by key. Scoping them to a user identity would prevent one user from accidentally (or maliciously) replaying another user's key.

**Redis lock durability:** If the application crashes between acquiring the lock and writing to Postgres, the lock auto-expires in 15 s (safe). If the DB write succeeds but the lock release fails, the lock still auto-expires. This is safe but adds up to 15 s latency for the next attempt on that SKU.

**Cron granularity:** Vercel Cron minimum is 1 minute. For a very short reservation window (< 5 min) you'd want a persistent background worker (BullMQ on Redis) to release stock within seconds of expiry.
