# ITS Scorecard

ITS Scorecard is a React and Flask application for collecting, storing, reviewing, and scoring Intelligent Transportation Systems (ITS) information for New Jersey and Texas. It supports uploaded datasets, structured survey updates, deployment pre-surveys, five scorecard domains, historical dashboard summaries, and expert review.

This document describes the current application behavior, including the latest deployment coverage method, AM/FM/TM pre-surveys, Supabase persistence, Render deployment, Mapbox login map, and automatic Supabase keep-alive workflow.

## Contents

- [Current Functionality](#current-functionality)
- [Architecture](#architecture)
- [Repository Layout](#repository-layout)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Supabase Setup](#supabase-setup)
- [Local Environment Configuration](#local-environment-configuration)
- [Running Locally](#running-locally)
- [Login and State Access](#login-and-state-access)
- [Application Workflows](#application-workflows)
- [Scoring Behavior](#scoring-behavior)
- [Expected Upload Formats](#expected-upload-formats)
- [Supabase Data Model](#supabase-data-model)
- [Render Deployment](#render-deployment)
- [Custom Domain or LAN Hosting](#custom-domain-or-lan-hosting)
- [Supabase Keep-Alive](#supabase-keep-alive)
- [API Reference](#api-reference)
- [Security and Production Limitations](#security-and-production-limitations)
- [Troubleshooting](#troubleshooting)
- [Development and Git Workflow](#development-and-git-workflow)

## Current Functionality

### Login and navigation

- Mapbox-based U.S. login map with state-name hover behavior.
- New Jersey and Texas are the currently supported login states.
- The selected state is locked into the authenticated browser session.
- Scrollable and collapsible left navigation with separate Upload & Update and Scorecards sections.
- Role-aware navigation, including an admin-only Users page.

### Dashboard

- State-locked dashboard with a year selector.
- Overall score calculated from the scorecard domains that have available values.
- Domain summary for:
  - B/C Analysis.
  - Deployment Analysis.
  - Legislative Analysis.
  - Planning Analysis.
  - Facility Analysis.
- Historical trend chart.
- Source and calculation summary for every domain.
- `N/A` is shown during loading or when a domain has no available input, instead of displaying a misleading zero.

### Upload & Update

- Five upload categories:
  1. ITS Benefit and Cost Data.
  2. ITS Deployment Coverage Data.
  3. ITS Policy and Legislation Data.
  4. ITS Project Planning Documents.
  5. ITS Facility Documents.
- Upload preview displays one row per uploaded file with table name, category, and status.
- Tabular CSV/XLSX rows are stored in Supabase and can be queried by the analysis pages.
- Uploaded records can be deleted from the application.

### Survey-Based Updates

- Structured input forms for all five scorecard domains.
- Questions are aligned with the scoring engines.
- Answers are persisted to Supabase by state, year, and topic.
- B/C, Planning, and Facility analysis pages use saved survey answers when no matching uploaded default row is available.

### ITS Deployment Pre-Survey

- 2024 and 2025 pre-surveys.
- Three survey modes:
  - AM: Arterial Management.
  - FM: Freeway Management.
  - TM: Transit Management.
- Questions and answer structures are derived from the corresponding 2023 survey workbooks.
- State is inherited from the login session.
- User supplies the agency name.
- A one-row CSV representation and the structured answers are saved to Supabase.

### Scorecard analysis

- Benefit/cost score calculation from uploaded defaults or saved survey answers.
- Deployment category strengths, agency weights, contribution percentages, AM/FM/TM mode scores, and overall deployment coverage score.
- Mode-selectable agency contribution pie chart on Deployment Analysis.
- Cumulative legislation analysis by selected year.
- Planning score using planning evidence and verified award-year evidence.
- Facility capacity score with a maximum score of `0.98`.

### Expert Panel Review

- Review by year, state, and scorecard domain.
- Displays current values and unified scores.
- Captures expert judgment, suggested value, confidence, comments, and method-change recommendations.
- Supports draft and submitted review sessions.
- Opens the technical report reference in a floating window.
- Saves review sessions and row-level review items to Supabase.

## Architecture

```text
Browser
  |
  | React application
  v
scorecard_frontend
  |
  | HTTP /api requests
  v
scorecard_backend (Flask)
  |
  | Supabase Python client
  v
Supabase Postgres
```

The frontend does not directly query Supabase. Supabase credentials belong in the Flask backend environment. The frontend calls Flask through `REACT_APP_API_BASE_URL`.

### Technology stack

- Frontend: React 19, React Router, Recharts, Nivo, Chart.js, Mapbox GL, Axios.
- Backend: Python, Flask, Flask-CORS, pandas, openpyxl, Supabase Python client.
- Database: Supabase-hosted Postgres.
- Deployment: Render Blueprint configuration in `render.yaml`.
- Automation: GitHub Actions Supabase keep-alive workflow.

## Repository Layout

```text
ITS-Scorecard/
  .github/
    workflows/
      supabase-keepalive.yml
  readme.md
  render.yaml
  keep_supabase_awake.cmd
  benefit_cost_defaults_2000_2023_mock.csv
  planning_defaults_2000_2023_mock.csv
  planning_files_2000_2023_mock.csv
  planning_awards_2000_2023_official.csv
  facility_defaults_2000_2023_mock.csv
  nj_s1677_2023_mock_legislation.csv
  scorecard_backend/
    app.py
    requirements.txt
    .env.example
    supabase_config.py
    supabase_schema.sql
    supabase_cleanup.sql
    keep_supabase_awake.py
    benefit_cost_analysis.py
    legislation_analysis.py
    planning_analysis.py
    facility_capacity_analysis.py
    survey_scoring.py
    data/
      pre_survey_2023_am_state_schema.json
      pre_survey_2023_fm_schema.json
      pre_survey_2023_tm_schema.json
      survey/
        domain_question_matches_long.csv
  scorecard_frontend/
    package.json
    public/
      ITS Scorecard Technical Report Reference.pdf
      logo-ncit.png
    src/
      components/
      config/
      pages/
      services/
      styles/
      utils/
```

Do not treat `scorecard_backend/venv`, the root `venv`, build output, log files, or `.codex-run` files as application source.

## Prerequisites

- Git.
- Node.js 18 or newer.
- npm.
- Python 3.10 or newer.
- Anaconda, Miniconda, or Python `venv`.
- A Supabase project.
- A public Mapbox token beginning with `pk.`.

The development environment used for this project is an Anaconda environment named `itsscorecard`.

## Quick Start

### 1. Clone the repository

```powershell
git clone https://github.com/CAJCAJ/ITS-Scorecard.git
cd ITS-Scorecard
```

### 2. Create the Python environment

```powershell
conda create -n itsscorecard python=3.10
conda activate itsscorecard
```

### 3. Install backend dependencies

```powershell
pip install -r scorecard_backend/requirements.txt
```

The backend dependency versions are maintained in `scorecard_backend/requirements.txt`. Do not install an arbitrary newer Supabase package without testing compatibility.

### 4. Install frontend dependencies

```powershell
cd scorecard_frontend
npm install --legacy-peer-deps
cd ..
```

### 5. Create the Supabase schema

Run the complete contents of `scorecard_backend/supabase_schema.sql` in the Supabase SQL Editor.

### 6. Configure local environment files

Create:

- `scorecard_backend/.env.local`
- `scorecard_frontend/.env.development.local`

Examples are provided below.

### 7. Start both services

Backend terminal:

```powershell
conda activate itsscorecard
cd scorecard_backend
python app.py
```

Frontend terminal:

```powershell
cd scorecard_frontend
npm start
```

Open `http://localhost:2999`.

## Supabase Setup

Each deployment should use its own Supabase project. Forking or cloning this repository does not create a new Supabase database and does not associate Supabase with the GitHub account automatically.

### 1. Create a Supabase project

In Supabase:

1. Create a project.
2. Open the project API settings.
3. Copy the Project URL.
4. Copy the anon key for local development.
5. For a controlled backend deployment, copy the service-role key and store it only on the backend host.

Never put a service-role key in React environment variables, committed files, screenshots, or client-side JavaScript.

### 2. Configure backend credentials

Copy the example:

```powershell
Copy-Item scorecard_backend/.env.example scorecard_backend/.env.local
```

Edit `scorecard_backend/.env.local`:

```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-anon-key
CORS_ORIGINS=http://localhost:2999
```

The backend accepts one of these key variables, in this priority order:

1. `SUPABASE_KEY`
2. `SUPABASE_SECRET_KEY`
3. `SUPABASE_SERVICE_ROLE_KEY`
4. `SUPABASE_ANON_KEY`

For Render or another backend-only production environment, prefer:

```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
CORS_ORIGINS=https://your-frontend-domain.example
```

### 3. Create or upgrade the schema

Open Supabase SQL Editor and run the entire contents of:

```text
scorecard_backend/supabase_schema.sql
```

The script uses `create table if not exists` and `add column if not exists`, so rerunning it is the normal migration approach for this prototype.

Rerun it when errors mention missing columns such as:

- `agency_type`
- `survey_type`
- `dataset_key`
- `sheet_role`

### 4. RLS behavior

The current `supabase_schema.sql` disables Row Level Security on the application tables. This supports the existing prototype backend and anon-key workflow but is not a secure public-production design.

For production:

- Keep Supabase access behind the Flask API.
- Use a backend-only service-role key.
- Implement server-side authentication and authorization.
- Review and enable RLS before exposing direct Supabase access.
- Do not rerun the prototype schema after hardening RLS without reviewing its final `disable row level security` statements.

### 5. Cleanup script warning

`scorecard_backend/supabase_cleanup.sql` is destructive. It drops current application tables as well as older prototype tables.

Do not run it as a routine migration. Use it only for an intentional database reset after exporting any required data, then rerun `supabase_schema.sql`.

## Local Environment Configuration

### Backend

File: `scorecard_backend/.env.local`

```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-anon-key
CORS_ORIGINS=http://localhost:2999
```

### Frontend

File: `scorecard_frontend/.env.development.local`

```env
HOST=0.0.0.0
PORT=2999
WDS_SOCKET_HOST=localhost
WDS_SOCKET_PORT=2999
REACT_APP_API_BASE_URL=http://localhost:5000/api
REACT_APP_MAPBOX_TOKEN=your-public-mapbox-token
```

Restart `npm start` after changing any React environment variable.

### LAN/IP access

To open the frontend from another device, replace `localhost` with the development computer's reachable IP:

```env
HOST=0.0.0.0
PORT=2999
WDS_SOCKET_HOST=172.17.106.115
WDS_SOCKET_PORT=2999
REACT_APP_API_BASE_URL=http://172.17.106.115:5000/api
REACT_APP_MAPBOX_TOKEN=your-public-mapbox-token
```

Also set the backend CORS origin:

```env
CORS_ORIGINS=http://172.17.106.115:2999
```

Allow ports `2999` and `5000` through the host firewall if other devices must connect.

## Running Locally

### Backend

```powershell
conda activate itsscorecard
cd scorecard_backend
python app.py
```

Default endpoints:

```text
http://127.0.0.1:5000
http://127.0.0.1:5000/api/health
```

The backend listens on `0.0.0.0` and uses `PORT` if the environment provides one.

### Frontend

```powershell
cd scorecard_frontend
npm start
```

With the provided local settings:

```text
http://localhost:2999
```

### Production build verification

```powershell
cd scorecard_frontend
npm run build
```

Backend syntax verification:

```powershell
conda run -n itsscorecard python -m py_compile scorecard_backend/app.py scorecard_backend/survey_scoring.py
```

## Login and State Access

The login map uses `REACT_APP_MAPBOX_TOKEN`. Hovering over a state displays its name; clicking a supported state opens the login form.

Current supported states:

- New Jersey.
- Texas.

Important: the current login implementation is client-side demo authentication in `scorecard_frontend/src/utils/auth.js`. Session state is stored in browser `localStorage`. It is not Supabase Auth and is not secure enough for unrestricted public production.

Before production use, replace this with authenticated backend sessions or a managed identity provider and enforce state authorization on the API.

## Application Workflows

### Dashboard

The dashboard requests all five domain results for the selected state and year.

Overall score:

```text
average of the currently available domain scores
```

Unavailable domains are excluded instead of being treated as zero. Loading and unavailable values display `N/A`.

### Upload Files

Accepted formats depend on the selected category:

| Category | Formats |
| --- | --- |
| ITS Benefit and Cost Data | CSV, XLSX |
| ITS Deployment Coverage Data | CSV, XLSX |
| ITS Policy and Legislation Data | CSV, XLSX, PDF, DOCX |
| ITS Project Planning Documents | CSV, XLSX, PDF, DOCX |
| ITS Facility Documents | CSV, XLSX, PDF, DOCX |

Tabular upload behavior:

1. One metadata row is inserted into `documents`.
2. Parsed table rows are inserted into `uploaded_dataset_rows` as JSONB.
3. The Upload Files preview displays one row for the uploaded document.
4. Analysis endpoints query those stored rows.

The original binary CSV/XLSX/PDF/DOCX file is not uploaded to a Supabase Storage bucket by the current implementation.

For CSV/XLSX, parsed rows are preserved, not the original file bytes. For non-tabular PDF/DOCX uploads, only document metadata is currently stored; the binary document is not persisted.

Delete behavior:

1. Metadata is copied to `deleted_docs`.
2. Parsed rows are deleted from `uploaded_dataset_rows`.
3. The active `documents` row is deleted.
4. Trash metadata older than 30 days is purged when the document list is loaded.

`deleted_docs` is an audit/trash metadata table, not a full restore mechanism. Deleted parsed rows and original file bytes cannot be restored from it.

### Survey-Based Updates

Topics:

- ITS Benefit and Cost.
- ITS Deployment Coverage.
- ITS Policy and Legislation.
- ITS Project and Planning.
- ITS Facility.

Submission headers are saved in `survey_update_submissions`; individual answers are saved in `survey_update_answers`.

Answers may be stored as:

- `answer_text`
- `answer_number`
- `answer_json`

### ITS Deployment Pre-Survey

The pre-survey page supports:

- Survey year `2024` or `2025`.
- Arterial Management (`AM`).
- Freeway Management (`FM`).
- Transit Management (`TM`).
- Agency name entered by the user.
- State locked from the login session.

Schemas are generated from:

- `pre_survey_2023_am_state_schema.json`
- `pre_survey_2023_fm_schema.json`
- `pre_survey_2023_tm_schema.json`

Saved filename pattern:

```text
YYYY_Agency_Name_AM_Pre_Survey.csv
YYYY_Agency_Name_FM_Pre_Survey.csv
YYYY_Agency_Name_TM_Pre_Survey.csv
```

The generated CSV is stored in the `csv_content` text column of `pre_survey_submissions`, together with `answers_json`. It is not saved as a Supabase Storage object and is intentionally not listed on the Upload Files page.

### Expert Panel Review

The page loads current input values and calculated unified scores for the selected state, year, and domain.

Experts can record:

- Judgment.
- Suggested value.
- Confidence.
- Item-level comments.
- Overall comments.
- Recommendation to change the method.
- Draft or submitted status.

The technical report displayed by the page must exist at:

```text
scorecard_frontend/public/ITS Scorecard Technical Report Reference.pdf
```

## Scoring Behavior

All final domain scores use a nominal `0` to `1` scale unless no value is available.

### B/C Analysis

The engine sums six benefit components:

- Existing ITS mobility benefit.
- Existing ITS safety benefit.
- Existing ITS environmental benefit.
- New ITS mobility benefit.
- New ITS safety benefit.
- New ITS environmental benefit.

It divides total benefit by:

- Existing annual O&M/repair cost.
- New annual design/planning/testing/deployment cost.

```text
B/C ratio = total benefits / total costs
Unified score = ratio^2 / (1 + ratio^2)
```

Data priority:

1. Matching uploaded B/C default row.
2. Latest saved B/C Survey-Based Update.
3. No value available.

### Deployment Analysis

The current deployment method scores only positive deployment evidence. Missing, skipped, not-applicable, and negative deployment answers do not create positive category strength.

Eleven deployment categories are evaluated:

1. Active Traffic and Demand Management.
2. Connected, Automated, and Emerging Vehicle Technology.
3. ITS Program Planning and Operational Support.
4. Road Weather Information and Response.
5. Safety Enforcement and Incident Response.
6. Signal Management and Intersection Control.
7. Traffic Monitoring and Data Collection.
8. Transit and Fleet ITS Technology.
9. Traveler Information and User Services.
10. Vulnerable Road User Safety Applications.
11. Work Zone ITS and Queue Warning.

Positive category strength:

```text
strength = 1 - exp(-0.7 * positive item count)
```

Agency Weight is the mean positive category strength for the categories in which that agency reports deployment.

Agency contribution:

```text
contribution score = Agency Weight * scale proxy
```

- AM uses reported signalized intersection count when available.
- AM otherwise uses positive deployment/activity count.
- FM and TM currently use positive deployment/activity count as their scale proxy.

Contribution percentages:

- Calculated independently within AM, FM, and TM.
- Sum to `100%` within each survey mode.
- Apply a `4%` minimum per participating agency when mathematically possible.
- Larger shares are reduced proportionally after the floor is applied.
- If a mode has more than 25 agencies, the maximum feasible equal minimum of `100 / agency count` is used.

Mode score:

```text
sum(Agency Weight * contribution percentage)
```

Overall deployment coverage score:

```text
average of the available AM, FM, and TM mode scores
```

The Deployment Analysis page shows:

- Category-strength table.
- Mode-filtered Agency Weights and contribution table.
- AM/FM/TM selector.
- Contribution pie chart with a separate agency legend.

### Legislative Analysis

Legislation is evaluated cumulatively through the selected year.

Bill categories:

- Traffic Safety.
- Autonomous Vehicle.
- Infrastructure.
- Pedestrian/VRU.
- Data Collection.

Raw support levels:

| Score | Meaning |
| --- | --- |
| `-1` | Restrictive |
| `0` | No relevant ITS support |
| `1` | Supportive |
| `2` | Better supportive |
| `3` | Strongly supportive |

The engine derives categories and support levels from title, bill information, vehicle type, and synopsis text. These are deterministic keyword/rule classifications, not an external AI service.

Current unified method:

```text
positive support points = sum(max(raw bill score, 0))
effective support points = max(0, positive support points - 2 * restrictive bill count)
accumulation = effective support points / (effective support points + 35)
base score = min(0.85, 0.60 + 0.25 * accumulation)
```

A qualifying strongly supportive S1677 record in the selected year adds a `0.08` flagship bonus. The final legislation score is capped at `0.95`.

The page also displays:

- Total bills.
- Average raw bill score.
- Bills by year.
- Enacted versus not enacted.
- Topic distribution.
- Raw score distribution.
- Individual bill classifications.

### Planning Analysis

Current planning inputs include:

- Award count.
- Award program list.
- Award funding.
- Planned ITS project count.
- Planned corridor miles.
- Planning source list.

Current calibration:

- Planning baseline: `0.60`.
- Non-award years can increase through planning-file evidence up to `0.78`.
- A verified award year starts at `0.85`.
- Award-year score is capped at `0.95`.
- Recognized award evidence includes SMART, ATCMTD, ATTAIN, and SS4A program information.

Multiple matching planning uploads for the same state and year are merged. This allows the official awards table and planning-file table to be uploaded separately.

Data priority:

1. Matching uploaded planning rows.
2. Latest saved Planning Survey-Based Update.
3. Baseline/no-evidence response.

### Facility Analysis

Current facility inputs include:

- Traffic/transportation operations centers.
- ITS O&M facilities or fleets.
- ITS labs and R&D units.
- ITS resource centers or consortia.
- Testbed availability.
- Testbed extent.
- Staff and operational support.

```text
aggregate capacity = sum(weighted facility inputs)
Unified score = 1 - exp(-((aggregate capacity / 7.5)^1.5))
```

The production score is capped at `0.98`.

Data priority:

1. Latest matching uploaded facility row.
2. Latest saved Facility Survey-Based Update.
3. No value available.

## Expected Upload Formats

### Deployment survey workbooks

Supported naming patterns:

```text
YYYY_AM_data.xlsx
YYYY_FM_data.xlsx
YYYY_TM_data.xlsx
YYYY_AM_Local_data.xlsx
YYYY_AM_State_data.xlsx
```

Examples:

```text
2004_AM_data.xlsx
2023_AM_Local_data.xlsx
2023_AM_State_data.xlsx
2023_FM_data.xlsx
2023_TM_data.xlsx
```

Filename metadata:

- `YYYY` becomes `survey_year`.
- `AM`, `FM`, or `TM` becomes `agency_type`.
- Optional `Local` or `State` becomes `survey_scope`.

Workbook processing:

- First worksheet: question/variable dictionary.
- Second worksheet: agency answers.
- Third and later worksheets: ignored.
- Blank top rows are handled by the survey parser.
- Both retained worksheets are stored under one `documents` record using `sheet_role` values `dictionary` and `answers`.

Deployment analysis filters agency answer rows to the selected state.

### Legacy state datasets

CSV/XLSX state datasets identifiable as `tx_state_data` or `nj_state_data` are still accepted as deployment-category state datasets. These are stored in the same generic document/row model rather than fixed Supabase tables.

### Legislation tables

Recommended columns:

```text
state
title
bill_info
date
version
vehicle_type
author
category
synopsis
```

The most important fields for analysis are:

- `state`
- `date`
- `version`
- `synopsis`
- `title` or `bill_info`

Multiple uploaded legislation files are combined for the selected state. The selected dashboard year filters records cumulatively through that year.

The repository includes `nj_s1677_2023_mock_legislation.csv` for the S1677 demonstration.

### B/C default table

Reference file:

```text
benefit_cost_defaults_2000_2023_mock.csv
```

Primary fields:

```text
state
survey_year
dataset_version
bc_existing_mobility_benefit
bc_existing_safety_benefit
bc_existing_environment_benefit
bc_new_mobility_benefit
bc_new_safety_benefit
bc_new_environment_benefit
bc_existing_om_cost_total
bc_new_cost_total
evidence_level
benefit_source_urls
cost_source_urls
conversion_basis
source_notes
```

### Planning default tables

Reference files:

```text
planning_defaults_2000_2023_mock.csv
planning_files_2000_2023_mock.csv
planning_awards_2000_2023_official.csv
```

The combined defaults file includes both planning-file and award fields. The separate files can also be uploaded because matching planning records are merged by state/year.

### Facility default table

Reference file:

```text
facility_defaults_2000_2023_mock.csv
```

Primary fields:

```text
state
survey_year
dataset_version
fac_toc_count
fac_om_sites
fac_labs
fac_resource_centers
fac_testbed_presence
fac_testbed_extent
fac_staff_support
evidence_level
source_notes
```

Mock tables are demonstration and starter data. Domain experts should validate or replace them before production use.

## Supabase Data Model

| Table | Purpose |
| --- | --- |
| `documents` | Active upload metadata |
| `deleted_docs` | Deleted upload metadata retained for 30 days |
| `uploaded_dataset_rows` | Parsed CSV/XLSX rows stored as JSONB |
| `survey_update_submissions` | Survey-Based Update headers |
| `survey_update_answers` | Survey-Based Update answers |
| `pre_survey_submissions` | Generated pre-survey CSV text and structured answers |
| `expert_review_sessions` | Expert review headers and status |
| `expert_review_items` | Row-level expert judgments and comments |

The current design does not create separate physical tables such as `nj_state_data`, `tx_state_data`, `nj_bills`, or `tx_bills`. Dataset rows share `uploaded_dataset_rows` and are related to `documents` by `document_id`.

The current design does not require a Supabase Storage bucket.

## Render Deployment

`render.yaml` defines two services:

- `its-scorecard-api`: Flask/Gunicorn backend.
- `its-scorecard`: static React frontend.

### Blueprint deployment

1. Push the desired commit to GitHub.
2. In Render, create a Blueprint from the repository.
3. Confirm the two services from `render.yaml`.
4. Configure the environment variables below.
5. Deploy the backend.
6. Deploy or rebuild the frontend after its environment variables are set.

### Backend Render variables

```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-backend-only-service-role-key
CORS_ORIGINS=https://your-frontend.onrender.com
```

Backend health check:

```text
https://your-backend.onrender.com/api/health
```

Expected response:

```json
{"status":"ok"}
```

### Frontend Render variables

```env
REACT_APP_API_BASE_URL=https://your-backend.onrender.com/api
REACT_APP_MAPBOX_TOKEN=your-public-mapbox-token
```

React variables are embedded at build time. Trigger a new frontend deploy whenever either value changes.

### Render build commands

Backend:

```text
pip install -r requirements.txt
gunicorn app:app
```

Frontend:

```text
npm ci --legacy-peer-deps && npm run build
```

The frontend service rewrites all routes to `/index.html` so React Router URLs work after refresh.

## Custom Domain or LAN Hosting

Recommended production layout:

```text
https://scorecard.example.org
https://scorecard-api.example.org
```

Frontend:

```env
REACT_APP_API_BASE_URL=https://scorecard-api.example.org/api
REACT_APP_MAPBOX_TOKEN=your-public-mapbox-token
```

Backend:

```env
CORS_ORIGINS=https://scorecard.example.org
```

For multiple frontend origins, use a comma-separated list without trailing slashes:

```env
CORS_ORIGINS=https://scorecard.example.org,https://its-scorecard.onrender.com
```

Also update Mapbox token URL restrictions to allow the deployed frontend domain.

Use HTTPS for both services. Do not serve an HTTPS frontend that calls an HTTP backend, because browsers will block mixed content.

## Supabase Keep-Alive

Supabase Free projects may pause after low activity. The repository includes both cloud and local keep-alive options.

### GitHub Actions automation

Workflow:

```text
.github/workflows/supabase-keepalive.yml
```

Schedule:

```text
03:17 UTC
11:17 UTC
19:17 UTC
```

The workflow performs a read-only query:

```text
GET /rest/v1/documents?select=id&limit=1
```

Required GitHub repository secrets:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Configure them at:

```text
GitHub repository
  -> Settings
  -> Secrets and variables
  -> Actions
  -> Repository secrets
```

Test manually:

1. Open the repository Actions tab.
2. Select `Supabase Keepalive`.
3. Select `Run workflow`.
4. Run on `main`.
5. Confirm the `query-database` job is green.

The workflow fails visibly if either secret is missing or the Supabase query is rejected.

This activity usually prevents free-tier inactivity pausing, but Supabase Pro is the only guaranteed no-pause option. GitHub may disable scheduled workflows on public repositories after extended repository inactivity, so periodically confirm that the workflow remains enabled.

### Local Windows fallback

Files:

```text
keep_supabase_awake.cmd
scorecard_backend/keep_supabase_awake.py
```

Run:

```powershell
.\keep_supabase_awake.cmd
```

This local option only runs while the computer is available. The GitHub workflow is preferred for unattended operation.

## API Reference

Default local API base:

```text
http://localhost:5000/api
```

### Health and state data

- `GET /api/health`
- `GET /api/states`
- `GET /api/data?state=New%20Jersey`
- `GET /api/state-scorecards`
- `GET /api/state-summary`
- `GET /api/yearly-trends`

### Uploads

- `GET /api/documents`
- `POST /api/documents/upload`
- `DELETE /api/documents/<document_id>`

Upload request:

```text
multipart/form-data
file=<uploaded file>
doc_type=benefit_cost|survey|legislation|planning|facility
```

### Deployment

- `GET /api/deployment/default-values?state=New%20Jersey&year=2023`

Response includes:

- `items`
- `agency_weights`
- `mode_scores`
- `coverage_score`

### Benefit/cost

- `GET /api/benefit-cost/score?state=New%20Jersey&year=2023`
- `POST /api/benefit-cost/score`

### Legislation

- `GET /api/legislation/states`
- `GET /api/legislation/analysis?state=New%20Jersey&year=2023`
- `GET /api/bills`
- `GET /api/bills/meta`
- `GET /api/top-authors`
- `GET /api/longest-pending-bills`
- `GET /api/state-vehicle-types`

### Planning and facility

- `GET /api/planning/score?state=New%20Jersey&year=2023`
- `POST /api/planning/score`
- `GET /api/facility/score?state=New%20Jersey&year=2023`
- `POST /api/facility/score`

### Generic survey scoring and persistence

- `POST /api/survey-scores/<topic_key>`
- `GET /api/survey-updates/submissions/latest`
- `POST /api/survey-updates/submissions`

Topic keys:

- `benefit_cost`
- `deployment_coverage`
- `policy_legislation`
- `project_planning`
- `facility`

### Deployment pre-survey

- `GET /api/pre-survey/schema?survey_type=AM`
- `GET /api/pre-survey/schema?survey_type=FM`
- `GET /api/pre-survey/schema?survey_type=TM`
- `POST /api/pre-survey/submissions`

### Expert review

- `GET /api/expert-review/subaspects`
- `GET /api/expert-review/current-values`
- `GET /api/expert-review/sessions/latest`
- `POST /api/expert-review/sessions`

## Security and Production Limitations

The current project is suitable for research demonstrations and controlled outreach. Before unrestricted public deployment, address these items:

1. Replace client-side demo authentication with server-validated authentication.
2. Enforce authorization and state access in Flask, not only in React.
3. Enable and design Supabase RLS policies.
4. Keep service-role credentials only in the backend host.
5. Restrict CORS to known frontend origins.
6. Add request size limits, file validation, rate limiting, and malware scanning.
7. Add audit logging for uploads, deletions, survey submissions, and expert reviews.
8. Implement a real file-storage path if original PDF/DOCX/XLSX files must be retained.
9. Back up Supabase data regularly.
10. Review mock/default datasets with domain experts before presenting scores as official.

## Troubleshooting

### Backend reports missing Supabase configuration

Confirm:

- `scorecard_backend/.env.local` exists for local development.
- `SUPABASE_URL` is set.
- One supported Supabase key variable is set.
- The key belongs to the same project as the URL.

### `PGRST204` missing-column error

Example:

```text
Could not find the 'agency_type' column of 'documents' in the schema cache
```

Run the latest `scorecard_backend/supabase_schema.sql` in Supabase SQL Editor. Wait briefly for PostgREST schema cache refresh, then retry.

### `PGRST205` missing-table error

Example:

```text
Could not find the table 'public.expert_review_sessions'
```

Run the latest schema SQL. Confirm the table exists under the `public` schema.

### Row-level security error `42501`

Example:

```text
new row violates row-level security policy
```

The active Supabase key does not have permission for the table. For the current prototype, rerun the schema that disables RLS. For production, use a backend-only service-role key or create deliberate RLS policies.

### Upload returns `Network Error`

Check:

- Flask is running.
- `REACT_APP_API_BASE_URL` ends in `/api`.
- The browser can open `/api/health`.
- Backend `CORS_ORIGINS` includes the exact frontend origin.
- HTTP/HTTPS protocols match.
- The frontend was rebuilt after changing Render environment variables.

### Local request returns `404`

Verify that `REACT_APP_API_BASE_URL` points to the Flask service, not the React service. Test:

```text
http://localhost:5000/api/health
```

or:

```text
https://your-backend.onrender.com/api/health
```

### Deployment Analysis shows no data

Confirm:

- The survey workbook filename follows the supported pattern.
- The selected year matches the filename year.
- Both dictionary and answer sheets were parsed.
- Answer rows contain agencies from the selected login state.
- `documents.data_kind` is `survey_workbook`.
- `documents.status` is `uploaded`.

### Uploaded data disappears after changing Supabase projects

GitHub forks and application branches do not copy Supabase data. Switching `SUPABASE_URL` connects the app to a different database. Run the schema and re-upload required datasets into that project.

### Mapbox map does not load

Check:

- `REACT_APP_MAPBOX_TOKEN` is present during the frontend build.
- It is a public token beginning with `pk.`.
- The token's URL restrictions allow localhost or the deployed frontend domain.
- The frontend was rebuilt after changing the token.

### React dev-server websocket errors

Set:

```env
WDS_SOCKET_HOST=your-host-or-ip
WDS_SOCKET_PORT=2999
```

Restart the frontend.

### GitHub keep-alive fails

Open the failed Actions run and confirm:

- `SUPABASE_URL` exists as a repository secret.
- `SUPABASE_ANON_KEY` exists as a repository secret.
- The Supabase project is not paused.
- The `documents` table exists.
- The anon key can select from `documents` under the current RLS configuration.

### Supabase project is already paused

Resume it from the Supabase dashboard, then manually run the GitHub `Supabase Keepalive` workflow and confirm success.

## Development and Git Workflow

### Update a fork from upstream

```powershell
git remote add upstream https://github.com/gado-j/ITS-Scorecard.git
git fetch upstream
git checkout main
git merge upstream/main
git push origin main
```

Resolve conflicts carefully and preserve local environment files. Credentials should not be committed, so normal merges should not overwrite ignored `.env.local` files.

### Feature branch workflow

```powershell
git checkout -b feature/your-feature
git add <specific-files>
git commit -m "Describe the change"
git push origin feature/your-feature
```

Open a pull request into the intended repository branch. Do not push experimental work directly to another organization's `main` branch.

### Before committing

```powershell
git status
git diff --check
conda run -n itsscorecard python -m py_compile scorecard_backend/app.py scorecard_backend/survey_scoring.py
cd scorecard_frontend
npm run build
```

Do not commit:

- `.env.local`
- `.env.development.local`
- Supabase service-role keys
- private Mapbox keys
- local logs
- `.codex-run`
- generated build output unless the deployment process explicitly requires it

## License

Copyright NCIT. All rights reserved.
