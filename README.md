# Firebase Studio

This is a NextJS starter in Firebase Studio.

To get started, take a look at src/app/page.tsx.

## Run local inference services (TGI + GPT4All)

Start the Text-Generation-Inference (TGI) server using the provided Docker Compose file:

```powershell
# from repo root
docker compose -f docker-compose.tgi.yml up -d
```

This will run a small demo model (gpt2) on port 8080. You can change the model by editing `docker-compose.tgi.yml`.

To download a local GPT4All model for CPU inference, run one of the helper scripts in the `scripts/` folder.

PowerShell (Windows / PowerShell):

```powershell
# Download the officially recommended latest .bin asset from the nomic-ai/gpt4all GitHub releases
.\scripts\get_gpt4all.ps1 -ModelUrl 'github:latest'
# Or pass an explicit URL and filename:
#.\scripts\get_gpt4all.ps1 -ModelUrl 'https://example.com/my-model.bin' -OutName 'my-model.bin'
# Then set the environment variable for the backend (PowerShell):
$env:PY_LLAMA_MODEL_PATH = 'C:\path\to\repo\models\your-model.bin'
```

Bash (macOS / Linux / WSL):

```bash
# Download the latest .bin asset from the GitHub releases (nomic-ai/gpt4all)
./scripts/get_gpt4all.sh
# Or pass a direct download URL:
./scripts/get_gpt4all.sh "https://example.com/my-model.bin"
# Then export the env var for your shell:
export PY_LLAMA_MODEL_PATH="$(pwd)/models/your-model.bin"
```

Once TGI or a local GGML model is available, start the Python backend and the Next dev server and select the appropriate extraction method in the UI (TGI or Llama/GPT4All).

## Deploying to Vercel (production checklist)

1. If you want the Python backend features (TGI/Llama), deploy the `python-backend` service to a public host (see `python-backend/README-deploy.md` for a Docker-based guide).
2. In your Vercel project, set these Environment Variables under Settings → Environment Variables (Production):

- `NEXT_PUBLIC_PY_API_URL` = `https://<your-python-backend>` (optional — if unset the app falls back to the in-app Genkit flow)
- `PY_TGI_ENDPOINT` = `<tgi endpoint>` (optional; backend-only)
- `PY_GENAI_ENDPOINT` / `PY_GENAI_KEY` (if you use an external GenAI provider)

3. Ensure no server-only secrets are exposed as `NEXT_PUBLIC_` variables if you don't want them in the browser.

4. Deploy the project from the Vercel dashboard or using the Vercel CLI.

If you need a simple deployment target for the Python backend, the included `python-backend/Dockerfile` is compatible with Render, Cloud Run, Railway or any container-friendly host.
