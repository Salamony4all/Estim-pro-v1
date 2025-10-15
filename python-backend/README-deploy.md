# Deploying the Python backend

This document explains how to package and deploy the `python-backend` service created for this project. It includes a Dockerfile and quick steps for common hosts (Render, Google Cloud Run, Railway).

Prerequisites

- Docker (for building locally)

Build and run locally with Docker

```bash
# from repo root
docker build -t estim-pro-python-backend -f python-backend/Dockerfile .
docker run -p 8000:8000 --rm estim-pro-python-backend
```

Deploy to Google Cloud Run (quick)

1. Build and push an image to your container registry (gcr or artifact registry).
2. Deploy the image to Cloud Run, set concurrency and memory as needed, and set the environment variables used by the app (for example: `PY_TGI_ENDPOINT`, `PY_LLAMA_MODEL_PATH` if you run local Llama on the backend host).

Deploy to Render

1. Create a new Web Service on Render.
2. Connect the GitHub repo, select `python-backend` as the root (or use Dockerfile), and set the start command to `uvicorn app.main:app --host 0.0.0.0 --port 8000`.
3. Add environment variables in the Render dashboard.

## Notes

- Ensure the model files used by Llama/GPT4All are downloaded to the backend host and `PY_LLAMA_MODEL_PATH` points to the path on that host.

- For production, set `PY_TGI_ENDPOINT`/`PY_GENAI_*` env vars as needed. Do not expose private model paths to Vercel—only the Python backend needs them.
