# ITS Scorecard

ITS Scorecard is a web application for collecting, storing, reviewing, and scoring Intelligent Transportation Systems (ITS) maturity information for U.S. states. The current application includes upload-managed Supabase storage, survey-based update forms, scorecard analysis pages, and an expert review workflow.

The application is split into:

- `scorecard_frontend`: React frontend.
- `scorecard_backend`: Flask API backend.
- Supabase: hosted Postgres tables used for uploads, survey answers, and expert review records.

## Current Capabilities

- Upload ITS datasets and supporting documents through the Upload & Update page.
- Store uploaded table rows in Supabase rather than fixed local JSON files.
- Score five ITS domains:
  - ITS Benefit and Cost.
  - ITS Deployment Coverage.
  - ITS Policy and Legislation.
  - ITS Project and Planning.
  - ITS Facility.
- Save Survey-Based Updates to Supabase.
- Use uploaded default tables as score inputs for B/C, Planning, and Facility analysis.
- Analyze uploaded legislation data by state.
- Review current values and unified scores in the Expert Panel Review page.
- Open the technical report reference PDF from the Expert Panel Review page.
- Run a local daily Supabase keep-alive ping on Windows.

## Repository Layout

```text
ITS-Scorecard/
  readme.md
  keep_supabase_awake.cmd
  benefit_cost_defaults_2000_2023_mock.csv
  facility_defaults_2000_2023_mock.csv
  planning_defaults_2000_2023_mock.csv
  scorecard_backend/
    app.py
    supabase_config.py
    supabase_schema.sql
    supabase_cleanup.sql
    keep_supabase_awake.py
    *_analysis.py
    survey_*.py
    .env.example
  scorecard_frontend/
    package.json
    public/
    src/
      components/
      config/
      pages/
      services/api.js
      styles/
      utils/
```

## Required Software

- Git.
- Node.js 18+ and npm.
- Python 3.10+.
- A Python environment manager such as Anaconda or `venv`.
- A Supabase project.
- A public Mapbox token for the login-page map.

The development machine used for this setup used an Anaconda environment named `itsscorecard`. The name is not required, but the commands below use it as the example.

## Python Backend Setup

Create and activate a Python environment:

```powershell
conda create -n itsscorecard python=3.10
conda activate itsscorecard
```

Install backend dependencies:

```powershell
cd scorecard_backend
pip install flask flask-cors pandas openpyxl "supabase==2.7.0" websockets
```

Use `supabase==2.7.0` unless the project has been tested with a newer version. Some newer Supabase Python releases may pull dependencies that require local C++ build tooling.

## Frontend Setup

Install frontend dependencies:

```powershell
cd scorecard_frontend
npm install --legacy-peer-deps
```

## Supabase Setup

Each deployment should use its own Supabase project. Do not reuse another team's Supabase credentials unless the team explicitly intends to share the same database.

### 1. Create a Supabase Project

In the Supabase dashboard:

1. Create a new project.
2. Open Project Settings.
3. Open API.
4. Copy the Project URL.
5. Copy a key for backend access.

For local development, the existing app can use the anon key. For a controlled server deployment where only the backend talks to Supabase, a service-role key can be used on the backend, but never expose a service-role key to the browser.

### 2. Configure Backend Credentials

Copy the backend example env file:

```powershell
cd scorecard_backend
copy .env.example .env.local
```

Edit `scorecard_backend/.env.local`:

```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
```

Supported backend key names are:

- `SUPABASE_KEY`
- `SUPABASE_SECRET_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`

The backend reads the first available key in that order.

Do not commit `.env.local`. It is intentionally ignored by git.

### 3. Create Supabase Tables

Open Supabase SQL Editor and run:

```sql
-- Paste the full contents of:
-- scorecard_backend/supabase_schema.sql
```

The schema creates these primary tables:

- `documents`: upload metadata shown in Upload & Update.
- `deleted_docs`: deleted upload metadata retained for temporary recovery/tracking.
- `uploaded_dataset_rows`: parsed row-level data from uploaded CSV/XLSX tables.
- `survey_update_submissions`: saved Survey-Based Update submission headers.
- `survey_update_answers`: saved Survey-Based Update answers.
- `expert_review_sessions`: expert review session headers.
- `expert_review_items`: expert review row-level judgments.

The schema also creates lookup indexes used by the analysis endpoints.

If an older prototype schema created fixed tables such as `tx_state_data`, `nj_state_data`, `tx_bills`, or `nj_bills`, run:

```sql
-- Paste the full contents of:
-- scorecard_backend/supabase_cleanup.sql
```

Only do this if you are intentionally removing the older fixed-table prototype.

### 4. Row Level Security

The provided `supabase_schema.sql` disables RLS for the app tables because the current local-development flow expects simple backend reads and writes.

For production, review Supabase security before exposing the app publicly:

- Prefer keeping Supabase keys only on the backend.
- Avoid putting service-role keys in frontend code.
- Consider enabling RLS and adding policies if browser-side Supabase access is introduced later.
- If the backend is private and trusted, the backend can enforce application-level permissions.

## Frontend Environment Variables

Create `scorecard_frontend/.env.development.local` for local development:

```env
HOST=0.0.0.0
PORT=2999
WDS_SOCKET_HOST=your-host-or-ip
WDS_SOCKET_PORT=2999
REACT_APP_API_BASE_URL=http://your-host-or-ip:5000/api
REACT_APP_MAPBOX_TOKEN=your-public-mapbox-token
```

Notes:

- `REACT_APP_API_BASE_URL` must point to the Flask backend `/api` base URL.
- `REACT_APP_MAPBOX_TOKEN` is a public Mapbox token used by the login-page map.
- Mapbox public tokens normally start with `pk.`.
- Do not place private Mapbox secret tokens in the frontend.
- Do not commit `.env.development.local`.

If the frontend and backend are both opened from the same machine, `localhost` can be used:

```env
REACT_APP_API_BASE_URL=http://localhost:5000/api
```

If other devices on the same network must open the page, use the host machine's LAN IP:

```env
HOST=0.0.0.0
PORT=2999
WDS_SOCKET_HOST=192.168.1.25
WDS_SOCKET_PORT=2999
REACT_APP_API_BASE_URL=http://192.168.1.25:5000/api
```

Replace `192.168.1.25` with the actual host IP.

## Running Locally

Start the backend:

```powershell
conda activate itsscorecard
cd scorecard_backend
python app.py
```

By default the backend listens on:

```text
http://127.0.0.1:5000
http://<host-ip>:5000
```

Start the frontend in another terminal:

```powershell
conda activate itsscorecard
cd scorecard_frontend
npm start
```

If `PORT=2999` is set, open:

```text
http://localhost:2999
```

or from another device:

```text
http://<host-ip>:2999
```

## Hosting on a Domain

For a real domain, use production URLs instead of LAN IP addresses.

Typical deployment options:

- Frontend on a static host such as Vercel, Netlify, Nginx, or Apache.
- Backend on a Python-capable host such as a VM, Render, Railway, Fly.io, Azure App Service, AWS, or an institutional server.
- Supabase as the hosted database.

Recommended domain layout:

```text
https://scorecard.example.org        -> React frontend
https://scorecard-api.example.org    -> Flask backend
```

Production frontend environment:

```env
REACT_APP_API_BASE_URL=https://scorecard-api.example.org/api
REACT_APP_MAPBOX_TOKEN=your-public-mapbox-token
```

Backend production environment:

```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-if-backend-only
```

Important production notes:

- Use HTTPS for both frontend and backend.
- Configure CORS carefully. The current backend uses permissive CORS for development.
- Do not expose service-role keys to the browser.
- If using a reverse proxy, forward requests to Flask on port `5000`.
- For production Flask hosting, use a WSGI server such as Gunicorn on Linux or Waitress on Windows instead of `python app.py`.

Example Nginx API reverse proxy:

```nginx
server {
    server_name scorecard-api.example.org;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Upload Workflow

Open Upload & Update and upload files under the correct category.

Upload categories:

- ITS Benefit and Cost Data.
- ITS Deployment Coverage Data.
- ITS Policy and Legislation Data.
- ITS Project Planning Documents.
- ITS Facility Documents.

Uploaded CSV/XLSX tables are stored as:

- One row in `documents`.
- Parsed row JSON in `uploaded_dataset_rows`.

The preview table on Upload & Update shows one row per uploaded table, not one row per column.

Deleting an uploaded table from the UI removes the document metadata and its stored row data through Supabase cascade behavior.

## Expected Uploaded Data

### Deployment Coverage Survey Workbooks

Survey workbooks should use names similar to:

```text
2023_AM_data.xlsx
2023_TM_data.xlsx
2023_FM_data.xlsx
2023_AM_Local_data.xlsx
```

The backend reads the year and agency type from the filename. It stores the first two workbook sheets:

- Sheet 1: question/category/answer metadata.
- Sheet 2: agency answers.

Any third sheet is ignored.

### State Legislation Tables

Legislation tables should include fields that can be mapped to:

- `title`
- `bill_info`
- `author`
- `version`
- `date`
- `vehicle_type`
- `state`
- `synopsis`
- `category`

The legislation analysis uses `state`, `date`, `version`, and `synopsis` heavily.

### Default Score Tables

The repo includes sample default tables:

- `benefit_cost_defaults_2000_2023_mock.csv`
- `planning_defaults_2000_2023_mock.csv`
- `facility_defaults_2000_2023_mock.csv`

These are uploadable through the matching Upload & Update category. They provide state/year rows for Texas and New Jersey from 2000 through 2023.

These mock tables are intended as starter defaults only. Replace them with agency-verified data when available.

## Analysis Page Data Priority

For score pages with state/year selectors, the backend resolves data in this order:

1. Matching uploaded default table row in Supabase.
2. Saved Survey-Based Updates in Supabase.
3. Local browser answers from the current session.
4. No value available.

This priority applies to:

- B/C Analysis.
- Planning Analysis.
- Facility Analysis.

Deployment Analysis reads uploaded survey workbooks and computes default values by year/state. Policy/Legislation Analysis reads uploaded legislation tables.

## Survey-Based Updates

Survey-Based Updates allows users to enter structured scoring inputs for:

- ITS Benefit and Cost.
- ITS Deployment Coverage.
- ITS Policy and Legislation.
- ITS Project and Planning.
- ITS Facility.

Saved answers are written to:

- `survey_update_submissions`
- `survey_update_answers`

The analysis pages can use these saved answers when uploaded default rows are not available.

## Expert Panel Review

Expert Panel Review allows experts to:

- Select year, state, and score domain.
- Load current values.
- Compare raw current values with normalized unified scores.
- Record judgment, confidence, comments, and method-change recommendations.
- Save drafts or submit reviews.
- Open the technical report reference PDF.

Saved expert review data is written to:

- `expert_review_sessions`
- `expert_review_items`

The technical report PDF should be placed at:

```text
scorecard_frontend/public/ITS Scorecard Technical Report Reference.pdf
```

## Supabase Keep-Alive

Supabase free projects may pause after inactivity. This repo includes a local Windows keep-alive helper:

- `scorecard_backend/keep_supabase_awake.py`
- `keep_supabase_awake.cmd`

The script performs a harmless read:

```text
select id from documents limit 1
```

It logs to:

```text
scorecard_backend/supabase_keepalive.log
scorecard_backend/supabase_keepalive_task.log
```

Run manually:

```powershell
.\keep_supabase_awake.cmd
```

Create a daily Windows Scheduled Task:

```powershell
$taskName = "ITS Scorecard Supabase Keepalive"
$root = "C:\path\to\ITS-Scorecard"
$script = Join-Path $root "keep_supabase_awake.cmd"
$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$script`"" -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -Daily -At 9:00AM
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "Daily harmless Supabase read request for ITS Scorecard keep-alive." -Force
```

This only runs when the Windows machine is on. For a reliable cloud keep-alive, use GitHub Actions or a hosted cron job with Supabase credentials stored as secrets.

## Useful API Endpoints

Backend base URL:

```text
http://localhost:5000/api
```

Common endpoints:

- `GET /api/documents`
- `POST /api/documents/upload`
- `DELETE /api/documents/<document_id>`
- `GET /api/states`
- `GET /api/data?state=Texas`
- `GET /api/state-scorecards`
- `GET /api/deployment/default-values?state=Texas&year=2023`
- `GET /api/benefit-cost/score?state=Texas&year=2023`
- `GET /api/planning/score?state=Texas&year=2023`
- `GET /api/facility/score?state=Texas&year=2023`
- `GET /api/legislation/states`
- `GET /api/legislation/analysis?state=Texas`
- `POST /api/survey-updates/submissions`
- `GET /api/survey-updates/submissions/latest`
- `GET /api/expert-review/subaspects`
- `GET /api/expert-review/current-values`
- `GET /api/expert-review/sessions/latest`
- `POST /api/expert-review/sessions`

## Troubleshooting

### Backend says Supabase credentials are missing

Check:

- `scorecard_backend/.env.local` exists.
- `SUPABASE_URL` is correct.
- At least one supported Supabase key variable is set.
- The terminal is running from the project or backend folder.

### Upload fails with schema-cache errors

Run `scorecard_backend/supabase_schema.sql` again in Supabase SQL Editor. The schema is written with `create table if not exists` and `add column if not exists`, so rerunning it is expected during setup.

### Upload fails with row-level security errors

The current development schema disables RLS. If RLS is enabled manually, add policies that allow the backend key to read/write the app tables, or disable RLS for local testing.

### Frontend cannot reach backend

Check `scorecard_frontend/.env.development.local`:

```env
REACT_APP_API_BASE_URL=http://your-host-or-ip:5000/api
```

If accessing from another device, do not use `localhost`; use the host machine IP or a domain name reachable by that device.

### Browser websocket errors in React dev server

Set:

```env
WDS_SOCKET_HOST=your-host-or-ip
WDS_SOCKET_PORT=2999
```

### Map does not load on the login page

Check:

- `REACT_APP_MAPBOX_TOKEN` is set.
- The token is a public Mapbox token.
- The token allows the domain or localhost you are using.

### Supabase project paused

Restore the project in the Supabase dashboard. Then run:

```powershell
.\keep_supabase_awake.cmd
```

If it succeeds, configure the scheduled task or a cloud cron job.

## Development Notes

- Keep `.env.local` and `.env.development.local` out of git.
- Do not commit generated `build/` output unless the deployment method requires it.
- Do not commit local run logs.
- Prefer uploading state/default datasets through the app instead of adding fixed tables to Supabase.
- The mock default CSVs are starter data and should be reviewed by domain experts before production use.

## Contributing

Recommended branch workflow:

```powershell
git checkout -b feature/your-feature-name
git add <changed-files>
git commit -m "Describe the change"
git push origin feature/your-feature-name
```

Then open a pull request into the target repository branch.

## License

Copyright NCIT. All rights reserved.
