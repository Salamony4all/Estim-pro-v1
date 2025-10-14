from pydantic import BaseModel, Field, validator
from typing import List, Optional
import re

DATA_URI_RE = re.compile(r'^data:([a-zA-Z0-9/+.-]+\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\r\n]+)$')

class Table(BaseModel):
    headers: List[str]
    rows: List[List[str]]
    description: Optional[str]

class ListSchema(BaseModel):
    title: Optional[str]
    items: List[str]

class BOQItem(BaseModel):
    itemCode: Optional[str]
    description: str
    quantity: float
    unit: str
    rate: float = 0.0
    amount: float = 0.0
    confidence: Optional[float] = None

class BOQ(BaseModel):
    title: Optional[str]
    description: Optional[str]
    items: List[BOQItem]

class ExtractedData(BaseModel):
    tables: Optional[List[Table]] = None
    lists: Optional[List[ListSchema]] = None
    prices: Optional[List[str]] = None
    boqs: Optional[List[BOQ]] = None

class ExtractDataInput(BaseModel):
    fileDataUri: str

    @validator('fileDataUri')
    def validate_data_uri(cls, v):
        if not v or not isinstance(v, str):
            raise ValueError('fileDataUri must be a non-empty string')
        if not DATA_URI_RE.match(v):
            raise ValueError('Invalid data URI format; expected base64 data URI')
        # estimate size from base64
        base64_part = v.split(',')[1] if ',' in v else ''
        approx_bytes = int((len(base64_part) * 3) / 4)
        MAX_BYTES = 10 * 1024 * 1024  # 10 MB
        if approx_bytes > MAX_BYTES:
            raise ValueError(f'File too large: estimated {approx_bytes} bytes')
        return v
