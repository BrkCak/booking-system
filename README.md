# Next.js Framework Starter

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/next-starter-template)

<!-- dash-content-start -->

This is a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app). It's deployed on Cloudflare Workers as a [static website](https://developers.cloudflare.com/workers/static-assets/).

This template uses [OpenNext](https://opennext.js.org/) via the [OpenNext Cloudflare adapter](https://opennext.js.org/cloudflare), which works by taking the Next.js build output and transforming it, so that it can run in Cloudflare Workers.

<!-- dash-content-end -->

Outside of this repo, you can start a new project with this template using [C3](https://developers.cloudflare.com/pages/get-started/c3/) (the `create-cloudflare` CLI):

```bash
npm create cloudflare@latest -- --template=cloudflare/templates/next-starter-template
```

A live public deployment of this template is available at [https://next-starter-template.templates.workers.dev](https://next-starter-template.templates.workers.dev)

## Getting Started

First, run:

```bash
npm install
# or
yarn install
# or
pnpm install
# or
bun install
```

Then run the development server (using the package manager of your choice):

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/basic-features/font-optimization) to automatically optimize and load Inter, a custom Google Font.

## Deploying To Production

| Command                           | Action                                       |
| :-------------------------------- | :------------------------------------------- |
| `npm run build`                   | Build your production site                   |
| `npm run preview`                 | Preview your build locally, before deploying |
| `npm run build && npm run deploy` | Deploy your production site to Cloudflare    |
| `npm wrangler tail`               | View real-time logs for all Workers          |

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js/) - your feedback and contributions are welcome!

## Local Booking Infra (Kafka + Postgres)

This project now includes a local infrastructure setup for learning event-driven booking flows:

- PostgreSQL on `localhost:5432`
- Apache Kafka on `localhost:9092`
- Kafbat (Kafka UI) on `http://localhost:8081`

### Start local infra

```bash
npm run infra:up
```

### Kafka health check

```bash
docker compose -f infra/docker-compose.yml exec -T kafka \
  /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --list
```

### Create Kafka topics

```bash
npm run infra:topics
```

Created topics:

- `booking.requested`
- `booking.confirmed`
- `booking.rejected`
- `booking.deadletter`

### Run Kafka smoke test

```bash
npm run kafka:smoke
```

The smoke test publishes one event to `booking.requested` and consumes it with a test consumer group.

## Booking API (Step 2)

Run the local API that accepts bookings and writes booking + outbox event in one DB transaction:

```bash
npm run booking-api:dev
```

Defaults:

- API base URL: `http://localhost:4001`
- Kafka broker: `localhost:9092`
- Outbox event type: `booking.requested`
- Database URL: `postgres://booking:booking@localhost:5432/booking`

Create a booking:

```bash
curl -X POST http://localhost:4001/bookings \
  -H "content-type: application/json" \
  -d '{"userId":"user-1","slotId":"slot-2026-02-17T10:00:00Z"}'
```

Get a booking:

```bash
curl http://localhost:4001/bookings/<bookingId>
```

`GET /bookings/:id` reads from PostgreSQL, including updated status from the worker.

## Outbox Publisher (Step 3)

Run the outbox publisher that reads `outbox_events` and publishes to Kafka:

```bash
npm run outbox-publisher:dev
```

Default behavior:

- Polls unpublished outbox rows every 1000ms
- Uses `event_type` as Kafka topic (e.g. `booking.requested`)
- Marks row as `published_at` after successful publish
- Uses exponential retry backoff via `next_attempt_at` on publish failures
- Moves events to `booking.deadletter` after max retries (`OUTBOX_MAX_RETRY_COUNT`, default `20`)

## Booking Worker (Step 4)

Run the worker that consumes `booking.requested` and produces result events:

```bash
npm run booking-worker:dev
```

Default behavior:

- If `slotId` contains `full` -> publish `booking.rejected`
- Otherwise -> publish `booking.confirmed`

Result topics:

- `booking.confirmed`
- `booking.rejected`

The worker also updates the `bookings` row in PostgreSQL (`status`, `reason`, `updated_at`).

## Booking Web (Frontend)

Start the web UI:

```bash
npm run dev
```

Frontend routes:

- `/` create booking form
- `/bookings/<bookingId>` booking status page (polling every 1.5s)

Required local services for full flow:

1. `npm run booking-api:dev`
2. `npm run outbox-publisher:dev`
3. `npm run booking-worker:dev`
4. `npm run dev`

Optional:

- Set `BOOKING_API_BASE_URL` if your API is not on `http://localhost:4001`

## MCP Server

An [MCP](https://modelcontextprotocol.io/) (Model Context Protocol) server exposes booking tools to Cursor (or other MCP clients). The server writes/reads bookings directly in PostgreSQL (including outbox events), so it does not require the Booking API to run.

**Prerequisite:** PostgreSQL must be running (for local setup: `npm run infra:up`).

**Tools:**

- `create_booking` — create a booking for a user and slot (`userId`, `slotId`) in PostgreSQL and enqueue `booking.requested` in `outbox_events`.
- `get_booking` — get status and details of a booking by `bookingId`.

**Run standalone (for testing):**

```bash
npm run mcp-server
```

**Use in Cursor:** Add the server to your MCP configuration. Project-level: `.cursor/mcp.json` in this repo (see below). Global: `~/.cursor/mcp.json`.

Example config (project or global). For project-level `.cursor/mcp.json` in this repo, `cwd` is usually not needed (Cursor runs from the project root):

```json
{
  "mcpServers": {
    "booking-system": {
      "command": "npx",
      "args": ["tsx", "services/mcp-booking-server/index.ts"],
      "env": {}
    }
  }
}
```

- Optional env vars:
  - `DATABASE_URL` (default: `postgres://booking:booking@localhost:5432/booking`)
  - `BOOKING_REQUESTED_EVENT_TYPE` (default: `booking.requested`)

Cursor starts the process and uses stdio for MCP; you do not need to run `npm run mcp-server` yourself when using it from Cursor.

### Stop local infra

```bash
npm run infra:down
```
