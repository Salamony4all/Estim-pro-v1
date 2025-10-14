'use server';

import { extractDataFromFile, type ExtractDataInput } from '@/ai/flows/extract-data-flow';

/**
 * Dual-mode extract action:
 * - If NEXT_USE_PY_BACKEND or NEXT_PUBLIC_USE_PY_BACKEND = '1', proxy to Python backend at NEXT_PUBLIC_PY_API_URL (default http://localhost:8000)
 * - Otherwise, call the in-app Genkit flow via `extractDataFromFile`.
 */
export type ExtractionMethod = 'auto' | 'best' | 'genkit' | 'py-mock' | 'py-genai' | 'py-llama' | 'py-tgi' | 'py-gpt4all';

export async function extractData(input: ExtractDataInput, options?: { method?: ExtractionMethod }) {
  const method = options?.method || 'auto';

  // If explicitly requested, call the in-app Genkit flow
  if (method === 'genkit') {
    return await extractDataFromFile(input);
  }

  // If a Python backend method is requested, proxy the request there with mode=mock|genai
  if (method === 'py-mock' || method === 'py-genai' || method === 'py-llama' || method === 'py-tgi' || method === 'py-gpt4all') {
    const backendUrl = process.env.NEXT_PUBLIC_PY_API_URL || 'http://localhost:8000';
    // map frontend method to backend mode
    let mode = 'mock';
    if (method === 'py-genai' || method === 'py-tgi' || method === 'py-gpt4all') mode = 'tgi';
    if (method === 'py-llama') mode = 'llama';
    const url = `${backendUrl.replace(/\/+$/, '')}/extract?mode=${mode}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Python backend error: ${res.status} ${text}`);
    }

    return await res.json();
  }

  // Auto / Best mode: detect best available backend
  const methodToUse = ((): ExtractionMethod => {
    if (method === 'best') return 'best';
    if (method !== 'auto') return method;
    // method === 'auto' -> fall through to detection
    return 'auto';
  })();

  // Detection happens server-side (Node) using env vars. For 'best' we decide which backend to call.
  if (methodToUse === 'best' || methodToUse === 'auto') {
    // Prefer local TGI if configured, else prefer Llama if model path exists, else GenAI if configured, else fallback to genkit/mock
    const pyApi = process.env.NEXT_PUBLIC_PY_API_URL || 'http://localhost:8000';
    const hasTgi = !!process.env.PY_TGI_ENDPOINT || false;
    const hasLlama = !!process.env.PY_LLAMA_MODEL_PATH || false;
    const hasGenai = !!process.env.PY_GENAI_ENDPOINT || !!process.env.PY_GENAI_KEY || false;

    // Priority: TGI -> Llama -> GenAI -> Python mock -> Genkit
    if (hasTgi) {
      const url = `${pyApi.replace(/\/+$/, '')}/extract?mode=tgi`;
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
      if (!res.ok) { const text = await res.text(); throw new Error(`Python backend error: ${res.status} ${text}`); }
      return await res.json();
    }

    if (hasLlama) {
      const url = `${pyApi.replace(/\/+$/, '')}/extract?mode=llama`;
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
      if (!res.ok) { const text = await res.text(); throw new Error(`Python backend error: ${res.status} ${text}`); }
      return await res.json();
    }

    if (hasGenai) {
      const url = `${pyApi.replace(/\/+$/, '')}/extract?mode=genai`;
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
      if (!res.ok) { const text = await res.text(); throw new Error(`Python backend error: ${res.status} ${text}`); }
      return await res.json();
    }

    // fallback to python mock if python backend present
    try {
      const url = `${pyApi.replace(/\/+$/, '')}/extract`;
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
      if (res.ok) return await res.json();
    } catch (e) {
      // ignore and fall through to genkit
    }

    // final fallback: Genkit in-app flow
    return await extractDataFromFile(input);
  }

  // Default fallback: use the TypeScript Genkit flow
  return await extractDataFromFile(input);
}
