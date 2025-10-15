This folder contains GitHub Actions workflows added by the local agent.

- `build-publish-backend.yml`: builds and publishes the Python backend Docker image to GitHub Container Registry (ghcr) on pushes to `main`.
- `deploy-vercel.yml`: deploys the frontend to Vercel on pushes to `main` if `VERCEL_TOKEN` is set in repository secrets.

If you want to trigger these workflows manually, push any change to `main` or run them from the Actions tab in the GitHub UI.

Triggered workflows at 2025-10-15T12:24:47.1906198+04:00
