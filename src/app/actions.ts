'use server';

import { extractDataFromFile, ExtractDataInput } from '@/ai/flows/extract-data-flow';

export async function extractData(input: ExtractDataInput) {
  return await extractDataFromFile(input);
}
