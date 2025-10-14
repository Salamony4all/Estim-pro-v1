from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import JSONResponse
from .schemas import ExtractDataInput, ExtractedData, BOQ, BOQItem
from typing import Any, Optional
import os
import httpx
import io
from PIL import Image
import pdfplumber
import pytesseract
import base64
try:
    from llama_cpp import Llama
except Exception:
    Llama = None

app = FastAPI(title="Estim Pro - Extraction API")


async def call_external_genai(file_data_uri: str) -> ExtractedData:
    """
    Skeleton to call an external Generative AI REST endpoint if configured.
    Configure `PY_GENAI_ENDPOINT` and `PY_GENAI_KEY` to enable this path.
    The exact contract depends on your chosen service. Replace this with
    the proper request/response shaping for the model you use.
    """
    endpoint = os.getenv('PY_GENAI_ENDPOINT')
    api_key = os.getenv('PY_GENAI_KEY')

    if not endpoint or not api_key:
        raise RuntimeError('PY_GENAI_ENDPOINT or PY_GENAI_KEY not configured')

    async with httpx.AsyncClient(timeout=60.0) as client:
        # Example: send a JSON payload to your GenAI service. Adjust as needed.
        payload = {"fileDataUri": file_data_uri}
        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        resp = await client.post(endpoint, json=payload, headers=headers)
        if resp.status_code != 200:
            raise RuntimeError(f'GenAI call failed: {resp.status_code} {resp.text}')
        data = resp.json()

    # NOTE: We assume the external service returns the same ExtractedData shape.
    return ExtractedData.model_validate(data)


def try_parse_json_from_text(text: str):
    """Attempt to extract JSON object from free text by searching for the first/last braces and parsing."""
    import json
    if not text or not isinstance(text, str):
        raise ValueError('No text to parse')
    # Direct parse first
    try:
        return json.loads(text)
    except Exception:
        pass

    # Find first JSON object boundaries
    first = text.find('{')
    last = text.rfind('}')
    if first != -1 and last != -1 and last > first:
        candidate = text[first:last+1]
        try:
            return json.loads(candidate)
        except Exception:
            pass

    # As a last resort, try to find a JSON array or object inside
    import re
    matches = re.findall(r'(\{.*?\})', text, flags=re.DOTALL)
    for m in matches:
        try:
            return json.loads(m)
        except Exception:
            continue
    raise ValueError('No JSON object found in text')


def llama_json_extract(llm: Any, prompt_text: str, max_retries: int = 3):
    import time
    from pydantic import ValidationError
    attempt = 0
    # Strong instruction for JSON-only output
    json_instruction = (
        "You are a JSON-only responder. Output EXACTLY one JSON object and nothing else. "
        "Schema: {\"tables\": [{\"headers\": [..], \"rows\": [[..]]}], \"boqs\": [{\"title\":..., \"items\": [{\"description\":..., \"quantity\":..., \"unit\":..., \"rate\":..., \"amount\":...}]}] }\n"
    )
    while attempt < max_retries:
        attempt += 1
        prompt = json_instruction + "\nText:\n" + prompt_text + "\n\nReturn only the JSON object."
        try:
            resp = llm(prompt)
            # extract text depending on response shape
            out_text = ''
            if isinstance(resp, dict):
                # llama-cpp-python may return {'id':..., 'object':..., 'usage':..., 'choices': [{'text': '...'}]}
                if 'choices' in resp and resp['choices']:
                    out_text = resp['choices'][0].get('text', '')
                else:
                    out_text = str(resp)
            else:
                out_text = str(resp)

            parsed = try_parse_json_from_text(out_text)
            # validate
            extracted = ExtractedData.model_validate(parsed)
            return extracted
        except (ValueError, ValidationError) as e:
            # try again
            time.sleep(0.7 * attempt)
            continue
        except Exception as e:
            # non-parse error
            raise
    raise RuntimeError('Failed to get valid JSON from LLM after retries')


def decode_data_uri(data_uri: str) -> bytes:
    # data:<mimetype>;base64,<data>
    if ',' not in data_uri:
        raise ValueError('Invalid data URI')
    _, b64 = data_uri.split(',', 1)
    return base64.b64decode(b64)


def extract_tables_from_pdf_bytes(pdf_bytes: bytes):
    tables = []
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for page in pdf.pages:
                # Extract tables on the page
                page_tables = page.extract_tables()
                for t in page_tables:
                    # Normalize rows to strings
                    headers = [str(cell).strip() if cell is not None else '' for cell in t[0]] if t and len(t) > 0 else []
                    rows = []
                    for r in t[1:]:
                        rows.append([str(cell).strip() if cell is not None else '' for cell in r])
                    tables.append({
                        'headers': headers,
                        'rows': rows,
                        'description': None,
                    })
                # If no explicit tables found, try to parse comma-separated or spaced text blocks as simple tables
                if not page_tables:
                    try:
                        page_text = page.extract_text()
                        # If pdfplumber couldn't extract text, try to reconstruct from character objects
                        if not page_text:
                            try:
                                chars = page.chars
                                if chars:
                                    # group by approximate top coordinate
                                    from collections import defaultdict
                                    lines_map = defaultdict(list)
                                    for ch in chars:
                                        top = int(round(ch.get('top', 0)))
                                        lines_map[top].append(ch)
                                    lines = []
                                    for top in sorted(lines_map.keys(), reverse=True):
                                        row_chars = sorted(lines_map[top], key=lambda x: x.get('x0', 0))
                                        line = ''.join([c.get('text', '') for c in row_chars])
                                        lines.append(line)
                                    page_text = '\n'.join(lines)
                            except Exception:
                                page_text = None
                        if page_text:
                            import csv
                            from io import StringIO
                            import re

                            rows = []
                            # First, try CSV reader if commas present
                            if ',' in page_text:
                                reader = csv.reader(StringIO(page_text))
                                rows = [[cell.strip() for cell in row] for row in reader if any(cell.strip() for cell in row)]
                            else:
                                # Try splitting lines and then splitting by multiple spaces or tabs
                                lines = [ln for ln in page_text.splitlines() if ln.strip()]
                                for ln in lines:
                                    parts = [p.strip() for p in re.split(r',|\s{2,}|\t', ln) if p.strip()]
                                    if parts:
                                        rows.append(parts)

                            if rows:
                                headers = rows[0] if len(rows) > 0 else []
                                data_rows = rows[1:] if len(rows) > 1 else []
                                tables.append({
                                    'headers': headers,
                                    'rows': data_rows,
                                    'description': 'Parsed CSV-like text from PDF'
                                })
                    except Exception:
                        pass
    except Exception:
        pass
    # If no tables were found by pdfplumber, try a full-text extraction fallback using pdfminer
    if not tables:
        try:
            try:
                from pdfminer.high_level import extract_text
            except Exception:
                extract_text = None
            if extract_text is not None:
                full_text = extract_text(io.BytesIO(pdf_bytes))
                if full_text:
                    import csv
                    from io import StringIO
                    import re
                    rows = []
                    if ',' in full_text:
                        reader = csv.reader(StringIO(full_text))
                        rows = [[cell.strip() for cell in row] for row in reader if any(cell.strip() for cell in row)]
                    else:
                        lines = [ln for ln in full_text.splitlines() if ln.strip()]
                        for ln in lines:
                            parts = [p.strip() for p in re.split(r',|\s{2,}|\t', ln) if p.strip()]
                            if parts:
                                rows.append(parts)

                    if rows:
                        headers = rows[0] if len(rows) > 0 else []
                        data_rows = rows[1:] if len(rows) > 1 else []
                        tables.append({
                            'headers': headers,
                            'rows': data_rows,
                            'description': 'Parsed text (pdfminer)'
                        })
        except Exception:
            pass
    return tables


def extract_text_from_image_bytes(img_bytes: bytes) -> str:
    im = Image.open(io.BytesIO(img_bytes))
    # convert to RGB for tesseract
    if im.mode != 'RGB':
        im = im.convert('RGB')
    text = pytesseract.image_to_string(im)
    return text


def parse_number(s: str) -> Optional[float]:
    if s is None:
        return None
    s = str(s).strip()
    if s == '':
        return None
    # Remove common currency symbols and spaces
    s = s.replace('\u00A0', '').replace('\u202F', '').strip()
    s = s.replace('$', '').replace('€', '').replace('£', '').replace('AED', '').replace('OMR', '')
    # Handle parentheses as negative
    negative = False
    if s.startswith('(') and s.endswith(')'):
        negative = True
        s = s[1:-1]
    # Remove thousands separators and non-numeric chars except dot, comma, and percent
    s = s.replace(',', '')
    # Handle percent
    is_percent = False
    if s.endswith('%'):
        is_percent = True
        s = s[:-1]
    try:
        val = float(s)
        if is_percent:
            val = val / 100.0
        if negative:
            val = -val
        return val
    except Exception:
        return None


def build_mock_boq_from_tables(tables) -> list:
    # Heuristic: if a table has headers like 'Item' 'Description' 'Quantity' include as a BOQ
    boqs = []
    for t in tables:
        headers = [h.lower() for h in t.get('headers', [])]
        if any(x in ' '.join(headers) for x in ['description', 'qty', 'quantity', 'rate', 'amount']):
            # Convert rows into BOQ items with best-effort parsing
            items = []
            for r in t.get('rows', []):
                # Map columns heuristically
                desc = ''
                qty = 0.0
                unit = ''
                rate = 0.0
                amount = 0.0
                itemCode = ''
                confidence = 0.0
                for i, cell in enumerate(r):
                    h = headers[i] if i < len(headers) else ''
                    cell_str = str(cell).strip()
                    if 'item' in h or 'code' in h:
                        itemCode = cell_str
                    elif 'desc' in h:
                        desc = cell_str
                    elif 'qty' in h or 'quantity' in h:
                        parsed = parse_number(cell_str)
                        if parsed is not None:
                            qty = parsed
                            confidence += 0.3
                        else:
                            qty = 0.0
                    elif 'unit' in h:
                        unit = cell_str
                    elif 'rate' in h:
                        parsed = parse_number(cell_str)
                        if parsed is not None:
                            rate = parsed
                            confidence += 0.3
                        else:
                            rate = 0.0
                    elif 'amount' in h or 'total' in h:
                        parsed = parse_number(cell_str)
                        if parsed is not None:
                            amount = parsed
                            confidence += 0.3
                        else:
                            amount = 0.0
                    else:
                        # fallback: append to description
                        desc = (desc + ' ' + cell_str).strip()

                # normalize confidence to 0..1
                conf = min(1.0, confidence) if confidence > 0 else None
                items.append(BOQItem(itemCode=itemCode or None, description=desc or '-', quantity=qty, unit=unit or '-', rate=rate, amount=amount, confidence=conf))

            boqs.append(BOQ(title=None, description=None, items=items))
    return boqs


@app.post('/extract', response_model=ExtractedData)
async def extract(data: ExtractDataInput, mode: Optional[str] = Query('mock')):
    """
    mode: 'mock' (default) — return mocked data
          'genai' — attempt to call external GenAI endpoint configured with env vars
    """
    try:
        if mode == 'genai':
            try:
                result = await call_external_genai(data.fileDataUri)
                return JSONResponse(content=result.model_dump())
            except Exception as e:
                # Surface helpful message so frontend can show reason
                raise HTTPException(status_code=502, detail=f'GenAI error: {str(e)}')

        if mode == 'tgi':
            # Call a local Text-Generation-Inference (TGI) server via HTTP
            tgi_endpoint = os.getenv('PY_TGI_ENDPOINT', 'http://127.0.0.1:8080/v1/models/default/generate')
            # Build a short prompt from OCR/text
            try:
                raw_bytes = decode_data_uri(data.fileDataUri)
            except Exception as e:
                raise HTTPException(status_code=400, detail=f'Invalid data URI: {e}')
            text = ''
            try:
                text = extract_text_from_image_bytes(raw_bytes)
            except Exception:
                text = ''

            prompt = (
                "Extract tables and bill of quantities (BOQ) from the following text. "
                "Return JSON only with keys: tables (headers+rows) and boqs (items with description, quantity, unit, rate, amount).\n\n" + text
            )
            try:
                async with httpx.AsyncClient(timeout=15.0) as client:
                    payload = {"inputs": prompt, "parameters": {"max_new_tokens": 512, "temperature": 0.0}}
                    headers = {"Content-Type": "application/json"}
                    hf_token = os.getenv('PY_GENAI_KEY')
                    if hf_token:
                        headers['Authorization'] = f'Bearer {hf_token}'
                    resp = await client.post(tgi_endpoint, json=payload, headers=headers)
                    resp.raise_for_status()
                    data = resp.json()
                    text_out = ''
                    if isinstance(data, dict):
                        text_out = data.get('generated_text') or (data.get('results')[0].get('text') if data.get('results') else None) or str(data)
                    else:
                        text_out = str(data)
                parsed = try_parse_json_from_text(text_out)
                extracted = ExtractedData.model_validate(parsed)
                return JSONResponse(content=extracted.model_dump())
            except Exception as e:
                # If TGI isn't available or parsing failed, fallback to local open-source extraction (mock path)
                try:
                    raw_bytes = decode_data_uri(data.fileDataUri)
                except Exception:
                    raise HTTPException(status_code=502, detail=f'TGI error and invalid data URI: {e}')
                # Attempt pdfplumber/pytesseract pipeline as fallback
                try:
                    tables = extract_tables_from_pdf_bytes(raw_bytes)
                except Exception:
                    tables = []
                if not tables:
                    try:
                        text = extract_text_from_image_bytes(raw_bytes)
                        lines = [l.strip() for l in text.splitlines() if l.strip()]
                        if lines:
                            rows = [[ln] for ln in lines]
                            tables = [{ 'headers': ['text'], 'rows': rows, 'description': 'OCR text lines (TGI fallback)' }]
                    except Exception:
                        tables = []
                boqs = []
                try:
                    boqs = build_mock_boq_from_tables(tables)
                except Exception:
                    boqs = []
                extracted = ExtractedData(tables=tables or None, lists=None, prices=None, boqs=boqs or None)
                return JSONResponse(content=extracted.model_dump())

        if mode == 'llama':
            # Call a local Llama model via llama-cpp-python using the robust JSON wrapper
            if Llama is None:
                raise HTTPException(status_code=500, detail='llama-cpp-python is not installed')
            model_path = os.getenv('PY_LLAMA_MODEL_PATH')
            if not model_path:
                raise HTTPException(status_code=400, detail='PY_LLAMA_MODEL_PATH not set')
            try:
                raw_bytes = decode_data_uri(data.fileDataUri)
            except Exception as e:
                raise HTTPException(status_code=400, detail=f'Invalid data URI: {e}')
            text = ''
            try:
                text = extract_text_from_image_bytes(raw_bytes)
            except Exception:
                text = ''
            try:
                llm = Llama(model_path=model_path)
                extracted = llama_json_extract(llm, text)
                return JSONResponse(content=extracted.model_dump())
            except HTTPException:
                raise
            except Exception as e:
                raise HTTPException(status_code=502, detail=f'Llama extraction error: {str(e)}')

        # Default/mock mode: attempt open-source extraction (pdfplumber + pytesseract)
        try:
            raw_bytes = decode_data_uri(data.fileDataUri)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f'Invalid data URI: {e}')

        tables = []
        boqs = []

        # Try PDF extraction first
        try:
            tables = extract_tables_from_pdf_bytes(raw_bytes)
        except Exception:
            tables = []

        # If no tables from PDF, try OCR as image
        if not tables:
            try:
                text = extract_text_from_image_bytes(raw_bytes)
                # Very basic: split into lines and make one table-like structure
                lines = [l.strip() for l in text.splitlines() if l.strip()]
                if lines:
                    # Make a single-column table
                    rows = [[ln] for ln in lines]
                    tables = [{ 'headers': ['text'], 'rows': rows, 'description': 'OCR text lines' }]
            except Exception:
                tables = []

        # Build BOQs heuristically from tables
        try:
            boqs = build_mock_boq_from_tables(tables)
        except Exception:
            boqs = []

        extracted = ExtractedData(tables=tables or None, lists=None, prices=None, boqs=boqs or None)
        return JSONResponse(content=extracted.model_dump())
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get('/health')
async def health():
    return {"status": "ok"}
