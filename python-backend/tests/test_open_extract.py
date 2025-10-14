import asyncio
import httpx
import base64
from pathlib import Path
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

# tiny sample: a 1x1 PNG base64 (same as earlier)
PNG_1x1_BASE64 = (
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMA'
    'ASsJTYQAAAAASUVORK5CYII='
)
DATA_URI_PNG = f"data:image/png;base64,{PNG_1x1_BASE64}"

async def post_extract(data_uri, mode='mock'):
    async with httpx.AsyncClient() as client:
        res = await client.post(f'http://localhost:8000/extract?mode={mode}', json={'fileDataUri': data_uri}, timeout=30.0)
        return res


def make_simple_pdf(path: Path):
    c = canvas.Canvas(str(path), pagesize=letter)
    # Draw a simple table-like text
    c.drawString(100, 700, 'Item,Description,Quantity,Unit,Rate,Amount')
    c.drawString(100, 680, '1,Test Item,2,Nos,10,20')
    c.save()


def test_image_ocr():
    # Requires the backend running locally
    res = asyncio.run(post_extract(DATA_URI_PNG, mode='mock'))
    assert res.status_code == 200
    data = res.json()
    assert 'tables' in data or 'boqs' in data


def test_pdf_table_extraction(tmp_path):
    pdf_path = tmp_path / 'table_test.pdf'
    make_simple_pdf(pdf_path)
    b = pdf_path.read_bytes()
    data_uri = 'data:application/pdf;base64,' + base64.b64encode(b).decode('utf-8')
    res = asyncio.run(post_extract(data_uri, mode='mock'))
    assert res.status_code == 200
    data = res.json()
    # We expect at least one table or BOQ produced
    assert data.get('tables') or data.get('boqs')
