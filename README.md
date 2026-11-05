# CommunityKit Server

> REST API backend for **GiveHand** — a social platform for discovering and joining community development events.

Built with **Express 5**, **TypeScript**, and **MongoDB**, secured via **BetterAuth** JWT (JWKS).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js (ESM) |
| Framework | Express 5 |
| Language | TypeScript 5 (strict mode) |
| Database | MongoDB 7 |
| Auth | BetterAuth · JOSE (JWKS JWT verification) |
| Dev server | `tsx --watch` |

---

## Project Structure

```
communitykit-server/
├── src/
│   └── index.ts       # Entry point — all routes, middleware, DB setup
├── dist/              # Compiled output (after build)
├── package.json
└── tsconfig.json
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- A running MongoDB instance
- A BetterAuth-powered client exposing `/api/auth/jwks`

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Create a `.env` file in the project root:

```env
MONGODB_URI=mongodb://localhost:27017
CLIENT_URL=http://localhost:3000   # Must match your BetterAuth client URL
PORT=3005                          # Optional, defaults to 3005
```

> **Important:** `CLIENT_URL` is used both for CORS and to fetch the JWKS endpoint at `CLIENT_URL/api/auth/jwks`.

### 3. Run in development

```bash
npm run dev
```

### 4. Build for production

```bash
npm run build   # Compiles TypeScript → dist/
npm start       # Runs dist/index.js
```

---

## API Reference

### Public Routes

No authentication required.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Health check |
| `GET` | `/events` | List upcoming events (supports filtering) |
| `GET` | `/events/:id` | Get a single event by ID |
| `GET` | `/event-types` | List distinct event types with counts |
| `GET` | `/stats` | Platform-wide stats (upcoming, completed, participants) |

#### `GET /events` Query Parameters

| Param | Type | Description |
|-------|------|-------------|
| `type` | string | Filter by event type (case-sensitive) |
| `search` | string | Case-insensitive title search |
| `limit` | number | Max results to return |
| `order` | `asc` \| `desc` | Sort by event date (default: `asc`) |

---

### Protected Routes

All protected routes require a `Bearer` token in the `Authorization` header:

```
Authorization: Bearer <jwt>
```

#### Events (creator-only write access)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/events` | Create a new event |
| `GET` | `/my-events` | List events created by the authenticated user |
| `PUT` | `/events/:id` | Update your own event |
| `DELETE` | `/events/:id` | Delete your own event (also removes all join records) |

#### Event Participation

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/join` | Join an event (`{ eventId }` in body) |
| `GET` | `/join/:eventId` | Check if the current user has joined an event |
| `DELETE` | `/join/:eventId` | Leave an event |
| `GET` | `/joined` | List all events the current user has joined (with live event data) |

---

### Event Body Schema

Used for `POST /events` and `PUT /events/:id`:

```json
{
  "title": "Beach Cleanup Drive",
  "description": "Join us to clean up the shoreline.",
  "eventType": "Environment",
  "thumbnail": "https://example.com/image.jpg",
  "location": "Cox's Bazar, Bangladesh",
  "eventDate": "2027-01-15T09:00:00.000Z"
}
```

All fields are required. `eventDate` must be a future date. `eventType` is normalized to Title Case and capped at 30 characters.

---

## Database

The server connects to a MongoDB database named **`givehand`** with two collections:

| Collection | Purpose |
|------------|---------|
| `events` | Stores all event documents |
| `joined` | Stores join records with a unique index on `(eventId, userEmail)` to prevent duplicate joins |

The unique index on `joined` is created automatically on startup.

---

## License

ISC

