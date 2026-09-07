# Barkie Frontend

React + Vite subscriber dashboard. Talks to `platform/api/`'s existing REST API.

## Local dev

    cp env.sample .env
    npm install
    npm run dev

Runs on http://localhost:5174 (matches `platform/api/env.sample`'s `FRONTEND_ORIGIN`). Requires `platform/api/` running on port 4200 (its default).

## Build

    npm run build

Outputs `dist/`, with all asset paths prefixed `/app/` for production path-based hosting on `barkie.co.za/app/`.
