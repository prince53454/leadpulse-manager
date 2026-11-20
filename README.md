# LeadPulse Lead Manager

A responsive lead manager built to complete the Meru Technosoft Full Stack Developer screening assignment. The interface uses crisp slate surfaces, clear lead status colors, a slide-over editor, and responsive mobile lead cards.

## Tech choices

- React and Vite for the frontend.
- Express for the REST API.
- SQLite through Node.js built-in `node:sqlite` for durable local persistence, with indexes on name and status.

SQLite keeps the app simple to run while still providing a real database. The app is intended for one local sales workspace; multi-user authentication is not included.

## Run locally

Requires Node.js 22.5 or newer (uses the built-in `node:sqlite` module).

```sh
npm install
npm run dev
```

Open `http://localhost:5173`. The Vite dev server proxies `/api` requests to Express on port 3000. SQLite creates `server/leads.db` automatically on first launch.

For a production build:

```sh
npm run build
npm start
```

Then open `http://localhost:3000`.

## Features

- Create, edit, and delete leads with a confirmation dialog.
- Required field and email validation in the browser and API.
- Filter by lead status and search by name or status.
- Status totals, sortable lead list, and a pipeline board.
- Responsive table-to-card layout on narrow screens.

## API

- `GET /api/leads?search=&status=` returns leads and status counts.
- `POST /api/leads` creates a lead.
- `PUT /api/leads/:id` updates a lead.
- `DELETE /api/leads/:id` removes a lead.
- `GET /api/health` checks API availability.

A lead has `name`, `email`, `phone`, `company`, `source` (`Website`, `Referral`, `LinkedIn`, `Cold call`, `Event`, `Other`), and `status` (`New`, `Contacted`, `Qualified`, `Lost`).

## Assumptions and next steps

The brief asks for each lead to include phone and company, so those fields are required along with name and email. Leads belong to one local workspace. With more time, I would add authentication and per-user ownership, API tests, and deployment configuration.

## A note on the work

The trickiest part was making the same lead workflow work cleanly in both the dense desktop table and the mobile card view while keeping edits consistent with server-side validation. The SQLite API keeps the core CRUD behavior durable without adding operational setup.

## Vercel deployment

The project includes a Vercel configuration for the Vite frontend and Express API function. On Vercel, SQLite runs from the function's writable `/tmp` directory. This is suitable for a screening demo, but the database is temporary and instance-local, so records can reset after a cold start or when requests reach another instance. Use a hosted database such as PostgreSQL or Turso for durable production data.
