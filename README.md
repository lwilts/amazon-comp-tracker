# Amazon Comp Tracker

A self-hosted web app for tracking Amazon compensation: base salary, bonuses, and RSU vests — with live AMZN/USD-GBP price data and a projected pay schedule.

**Features**
- Full pay schedule grouped by UK tax year, with salary, bonus and RSU line items
- RSU vest tracking — automatic historical price lock-in for past vests; inline value editing; Projected / Estimated / Confirmed / Speculative statuses
- Live AMZN price and USD/GBP FX rate via yfinance, auto-refreshed on load
- Flexible bonus configuration: monthly, quarterly, annual, or custom pay schedules
- GBP / USD currency toggle
- Password-protected single-user auth with first-run setup

---

## Quick start — Docker Compose

The easiest way to run the app. Pulls the pre-built image from GitHub Container Registry — no clone or build required.

Requires Docker with Compose v2.

```bash
mkdir amazon-comp-tracker && cd amazon-comp-tracker
mkdir -p data

curl -O https://raw.githubusercontent.com/lwilts/amazon-comp-tracker/main/docker-compose.yml

SECRET_KEY=$(openssl rand -hex 32) docker compose up -d
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

On first start the app seeds example salary, bonus, and RSU data so every page has something to show. Replace it all via the UI:

1. **Salary** — add your salary periods with effective dates
2. **Bonuses** — configure sign-on, performance, or any other bonuses; choose monthly, quarterly, annual, or custom schedule
3. **RSU Awards** — add your grant(s) and vest schedule; past vests are automatically priced at the historical closing price

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
