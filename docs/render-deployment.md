# Render Deployment

This project is prepared for two Render services:

- `its-scorecard-api`: Flask backend web service.
- `its-scorecard`: React static site.

The backend talks to Supabase. The frontend talks only to the backend API.

## Required Render Environment Variables

Set these on the backend service:

```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
CORS_ORIGINS=https://your-frontend.onrender.com
```

Set these on the frontend static site:

```env
REACT_APP_API_BASE_URL=https://your-backend.onrender.com/api
REACT_APP_MAPBOX_TOKEN=your-public-mapbox-token
```

Use the Supabase service-role key only on the backend service. Do not add it
to the React frontend.

## Blueprint Deployment

The repository includes `render.yaml` at the root. In Render, create a new
Blueprint instance from this GitHub repository and branch. Render will create:

1. A Python web service from `scorecard_backend`.
2. A static React site from `scorecard_frontend`.

The repo pins Python and Node versions with `.python-version` and
`.node-version` so Render does not deploy with an untested default runtime.

After the first backend URL is known, set the frontend
`REACT_APP_API_BASE_URL` value to that backend URL plus `/api`.

After the frontend URL is known, set the backend `CORS_ORIGINS` value to the
frontend URL. For temporary local testing, add multiple comma-separated values,
for example:

```env
CORS_ORIGINS=http://localhost:2999,https://your-frontend.onrender.com
```

## Supabase

Before deploying, create the Supabase tables by running
`scorecard_backend/supabase_schema.sql` in the Supabase SQL Editor.

The deployed backend expects the same environment variable names described in
`scorecard_backend/.env.example`.
