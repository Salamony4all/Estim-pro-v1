# Python Backend for Estimation Pro

This is a minimal FastAPI backend that provides an `/extract` endpoint to accept a base64 data URI and return a structured `ExtractedData` JSON payload that mirrors the Genkit/AI flow output expected by the Next.js frontend.

## Quick start

1. Create a Python virtual environment and install dependencies:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

2. Run the app with uvicorn (default mock mode):

```powershell
uvicorn app.main:app --reload --port 8000
```

3. The endpoints:

- POST /extract — accepts JSON { fileDataUri: string } and returns `ExtractedData`.
- GET /health — health check (returns { status: 'ok' }).

## Modes and environment variables
- The current Python implementation returns a mocked `ExtractedData` response so you can test the full UI flow without an actual AI integration.
- To integrate a real model, update `app/main.py` where noted and implement the call to Google Generative AI or your OCR/table extraction pipeline.

Environment variables you may use while developing:

- `NEXT_PUBLIC_PY_API_URL` — If you run Next.js and the Python backend on different hosts/ports, set the Next.js env var so the app proxies to the correct URL. Example: `http://localhost:8000`.
- `PY_GENAI_KEY` — (optional) Placeholder for your Google/other API key if you implement a direct call in Python.

## Notes

- The Pydantic models in `app/schemas.py` closely mirror the TypeScript `zod` schemas in the Next.js app.
- `ExtractDataInput.fileDataUri` is validated and rejected if the estimated size exceeds 10 MB.

## Quick test

1. Start the backend:

```powershell
uvicorn app.main:app --reload --port 8000
```

2. From the `python-backend` folder run the test client (requires the virtualenv):

```powershell
python -m pip install httpx
python tests/test_extract.py
```

3. To test with the external GenAI mode (after configuring `PY_GENAI_ENDPOINT` and `PY_GENAI_KEY`):

```powershell
python tests/test_extract.py # change mode to 'genai' in the script or call URL /extract?mode=genai
```

## Local Llama integration (optional)

This project supports a local Llama model via `llama-cpp-python`. To enable it:

1. Install `llama-cpp-python` (already in `requirements.txt`) and ensure you have a compatible GGML model file (.bin) on disk.

2. Set the environment variable `PY_LLAMA_MODEL_PATH` to the model file path, for example:

```powershell
$env:PY_LLAMA_MODEL_PATH = 'C:\models\ggml-model.bin'
```

3. Call the extraction endpoint with `mode=llama` or select "Python (Llama)" in the UI. The backend will run a short prompt against the local model and attempt to parse JSON output.

Notes:
- Local Llama models can be large; ensure you have sufficient disk space and the correct GGML format supported by `llama-cpp-python`.
- The simple Llama wrapper here sends OCRed text as the prompt; it's a lightweight approach and may need prompt engineering for reliable JSON outputs.

## Text-Generation-Inference (TGI) quick start

If you prefer running an HTTP inference server, Text-Generation-Inference (TGI) is a good option.

```powershell
# Run TGI (CPU example). Replace model id with a model you want to use.
docker run --rm -it -p 8080:8080 -e DISABLE_TELEMETRY=1 ghcr.io/huggingface/text-generation-inference:latest \
	--model-id gpt2 --no-stream
```

Set `PY_TGI_ENDPOINT` to the TGI generate endpoint if different from the default (the code uses `http://127.0.0.1:8080/v1/models/default/generate`).

## Notes about Windows

- Installing `llama-cpp-python` on Windows may require Visual Studio Build Tools. Use WSL/Ubuntu or Docker to avoid native build steps.
- TGI via Docker avoids local native builds and is the recommended approach for Windows users.
