# Amazon Comp Tracker

A self-hosted web app for tracking Amazon compensation: base salary, bonuses, and RSU vests (using current and historic AMZN price data). 

Add salary sacrifice arrangements (such as pension contributions) to get a yearly breakdown of past and predicted taxable compensation.

**Features**
- Projected pay schedule grouped by UK tax year, showing total gross and taxable gross across salary, bonus, and RSU income
- RSU vest tracking with live and historical AMZN pricing, showing unvested value and upcoming vest dates at a glance
- Salary sacrifice support (pension contributions or any other pre-tax deduction), correctly deducted from taxable gross throughout
- Flexible bonus configuration: monthly, quarterly, annual, or custom pay month schedules
- Password-protected single-user auth with first-run setup

---

## Quick start — Docker Compose

The easiest way to run the app. Pulls the pre-built image from GitHub Container Registry — no clone or build required.

Requires Docker with Compose v2.

```bash
mkdir amazon-comp-tracker && cd amazon-comp-tracker
mkdir -p data

curl -O https://raw.githubusercontent.com/lwilts/amazon-comp-tracker/main/docker-compose.yml

echo "SECRET_KEY=$(openssl rand -hex 32)" > .env
docker compose up -d
```

Open **http://localhost:8000** — you'll be prompted to set a password on first run.

The `data/` directory holds the SQLite database. It is bind-mounted into the container and persists across restarts and image updates.

```bash
# Stop
docker compose down

# Update to the latest image
docker compose pull && docker compose up -d
```

---

## Development — build and run locally

Use this if you want to modify the code.

Requires Docker with Compose v2, **or** Python 3.12+ and Node 20+.

### Option A — Docker (build from source)

```bash
git clone https://github.com/lwilts/amazon-comp-tracker.git
cd amazon-comp-tracker
mkdir -p data

docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build -d
```

This builds the image locally instead of pulling from GHCR. The `docker-compose.dev.yml` override sets a permissive dev `SECRET_KEY` and points to the local build.

### Option B — Python + Node directly (fastest iteration)

```bash
git clone https://github.com/lwilts/amazon-comp-tracker.git
cd amazon-comp-tracker

# Build the frontend once (or run with hot-reload — see below)
cd frontend && npm install && npm run build && cd ..

# Run the backend (also serves the built frontend)
pip install -r backend/requirements.txt
mkdir -p data
DATA_DIR=./data SECRET_KEY=dev uvicorn backend.main:app --reload
```

Open **http://localhost:8000**.

> **Frontend hot-reload:** run `npm run dev` in the `frontend/` directory separately. The Vite dev server proxies `/api` to `localhost:8000`.

---

## First run

On first start you'll be prompted to set a password. After that, populate your data via the UI:

1. **Salary** — add your salary periods with effective dates
2. **Salary sacrifice** — optionally add pension or other pre-tax deductions as a percentage of salary or fixed monthly amount
3. **Bonuses** — configure sign-on, performance, or any other bonuses; choose monthly, quarterly, annual, or custom schedule
4. **RSU Awards** — add your grant(s) and vest schedule; past vests are automatically priced at the historical closing price

---

## API

The app exposes a REST API under `/api`. All endpoints except `/api/auth/*` require an authenticated session cookie.

**Interactive docs** (when running locally): http://localhost:8000/docs

### Authentication

```bash
# Check status
curl http://localhost:8000/api/auth/status

# Set password (first run)
curl -X POST http://localhost:8000/api/auth/set-password \
  -H "Content-Type: application/json" \
  -d '{"password":"yourpassword","confirm_password":"yourpassword"}'

# Log in — save the session cookie for subsequent requests
curl -c cookies.txt -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password":"yourpassword"}'

# All authenticated requests pass the cookie jar
alias acurl='curl -b cookies.txt'
```

### Salary

```bash
# List
acurl http://localhost:8000/api/salary

# Add a salary period
acurl -X POST http://localhost:8000/api/salary \
  -H "Content-Type: application/json" \
  -d '{"annual_amount":75000,"effective_from":"2025-01-28","effective_to":null,"notes":"Level 5"}'

# Update
acurl -X PUT http://localhost:8000/api/salary/1 \
  -H "Content-Type: application/json" \
  -d '{"annual_amount":80000,"effective_from":"2025-01-28","effective_to":null,"notes":"Level 5"}'

# Delete
acurl -X DELETE http://localhost:8000/api/salary/1
```

### Salary sacrifice

```bash
# List
acurl http://localhost:8000/api/pension

# Add — percentage of base salary
acurl -X POST http://localhost:8000/api/pension \
  -H "Content-Type: application/json" \
  -d '{"amount_type":"percentage","amount":5,"effective_from":"2025-01-28","effective_to":null,"notes":"Employee contribution"}'

# Add — fixed monthly amount
acurl -X POST http://localhost:8000/api/pension \
  -H "Content-Type: application/json" \
  -d '{"amount_type":"fixed","amount":200,"effective_from":"2025-01-28","effective_to":null,"notes":null}'

# Update / Delete follow the same pattern as salary
```

### Bonuses

`frequency` is one of `monthly`, `quarterly`, `annual`, `custom`. `pay_months` is an array of month numbers (1–12); required for `quarterly`, `annual`, and `custom`, ignored for `monthly`.

```bash
# List
acurl http://localhost:8000/api/bonuses

# Monthly bonus
acurl -X POST http://localhost:8000/api/bonuses \
  -H "Content-Type: application/json" \
  -d '{"name":"Sign-on","annual_amount":10000,"frequency":"monthly","pay_months":[],"effective_from":"2025-01-28","effective_to":"2025-12-28","notes":null}'

# Quarterly bonus (paid in Jan, Apr, Jul, Oct)
acurl -X POST http://localhost:8000/api/bonuses \
  -H "Content-Type: application/json" \
  -d '{"name":"Performance","annual_amount":8000,"frequency":"quarterly","pay_months":[1,4,7,10],"effective_from":"2026-01-28","effective_to":null,"notes":null}'

# Update / Delete follow the same pattern as salary
```

### RSU Awards & Vests

RSU awards are the top-level grant. Each award has one or more vest events. Create the award first, then add vests using the returned `id`.

```bash
# List awards
acurl http://localhost:8000/api/rsu/awards

# Create an award
acurl -X POST http://localhost:8000/api/rsu/awards \
  -H "Content-Type: application/json" \
  -d '{"award_ref":"GRANT-2025-A","grant_date":"2025-01-06","notes":null}'

# Add a vest to award id 1
acurl -X POST http://localhost:8000/api/rsu/vests \
  -H "Content-Type: application/json" \
  -d '{"award_id":1,"vest_date":"2026-01-06","shares":25,"notes":null}'

# List all vests
acurl http://localhost:8000/api/rsu/vests

# Lock a past vest at a specific price (manually override)
acurl -X POST http://localhost:8000/api/rsu/vests/1/lock \
  -H "Content-Type: application/json" \
  -d '{"locked_price_usd":195.50,"locked_fx_rate":0.7850}'

# Re-lock all past vests using historical EOD prices
acurl -X POST http://localhost:8000/api/rsu/vests/lock-historical
```

### Pay schedule

```bash
acurl http://localhost:8000/api/schedule
# Optional filters: ?from_date=2025-04-06&to_date=2026-04-05
```

### Prices

```bash
acurl http://localhost:8000/api/prices/current
acurl -X POST http://localhost:8000/api/prices/refresh
```

---

## Configuration

All configuration is via environment variables.

| Variable | Default | Description |
|---|---|---|
| `SECRET_KEY` | *(required)* | Session signing key — set to a random value. The app logs a warning at startup if the insecure default is in use. |
| `DATA_DIR` | `/data` | Directory where the SQLite database is stored. |

Generate a secure key: `openssl rand -hex 32`

---

## Kubernetes deployment

Pre-built images are published to `ghcr.io/lwilts/amazon-comp-tracker:latest` on every merge to `main`.

```bash
# 1. Create the secret
kubectl create secret generic amazon-comp-tracker-secrets \
  --from-literal=secret-key=$(openssl rand -hex 32)

# 2. Apply manifests
kubectl apply -f k8s/pvc.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
```

The service is a `ClusterIP` on port 80 — expose it via an ingress or `kubectl port-forward` as needed.

```bash
# Update to a new image
kubectl rollout restart deployment/amazon-comp-tracker
```

---

## CI / CD

The GitHub Actions workflow (`.github/workflows/ci.yml`) runs on every push:

- **All branches** — builds the image and runs a smoke test (auth endpoint + SPA shell)
- **`main` only** — additionally pushes `ghcr.io/lwilts/amazon-comp-tracker:latest` and a SHA-tagged image

No secrets need to be configured — the workflow uses the built-in `GITHUB_TOKEN` to push to GHCR.

After the first push to `main`, set the `amazon-comp-tracker` package visibility to **Public** in your GitHub package settings so the image can be pulled without credentials.

---

## Security

- Set a strong `SECRET_KEY` — the app logs a clear warning if the insecure default is in use
- The SQLite database contains all your compensation data — back it up and keep `DATA_DIR` private
- All API routes except `/api/auth/*` require an authenticated session
- If you expose the app over HTTPS, set `https_only=True` in `backend/main.py`
