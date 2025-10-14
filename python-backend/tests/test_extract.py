import httpx
import base64

# tiny sample: a 1x1 PNG base64
PNG_1x1_BASE64 = (
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMA' \
    'ASsJTYQAAAAASUVORK5CYII='
)
DATA_URI = f"data:image/png;base64,{PNG_1x1_BASE64}"

async def run_test(mode='mock'):
    url = f'http://localhost:8000/extract?mode={mode}'
    async with httpx.AsyncClient() as client:
        resp = await client.post(url, json={'fileDataUri': DATA_URI}, timeout=30.0)
        print('status:', resp.status_code)
        print('body:', resp.text)

if __name__ == '__main__':
    import asyncio
    asyncio.run(run_test('mock'))
