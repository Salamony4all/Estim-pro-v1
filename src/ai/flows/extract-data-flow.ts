'use server';
/**
 * @fileOverview A flow for extracting structured data from a document.
 * 
 * - extractDataFromFile: A function that handles the data extraction process.
 * - ExtractDataInput: The input type for the extractDataFromFile function.
 * - ExtractedData: The return type for the extractDataFromFile function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

const ExtractDataInputSchema = z.object({
  fileDataUri: z
    .string()
    .describe(
      "A file (e.g., PDF, image) encoded as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'"
    ),
});
export type ExtractDataInput = z.infer<typeof ExtractDataInputSchema>;

const TableSchema = z.object({
  headers: z.array(z.string()).describe('The headers of the table.'),
  rows: z.array(z.array(z.string())).describe('The rows of the table, where each inner array represents a row.'),
  description: z.string().optional().describe('A brief description of the table content.'),
});

const ListSchema = z.object({
    title: z.string().optional().describe('The title of the list.'),
    items: z.array(z.string()).describe('The items in the list.'),
});

const BOQItemSchema = z.object({
    itemCode: z.string().optional().describe('The item code or number.'),
    description: z.string().describe('The description of the work or item.'),
    quantity: z.number().describe('The quantity of the item.'),
    unit: z.string().describe('The unit of measurement (e.g., sqm, nos, kg).'),
    rate: z.number().describe('The rate per unit. If not present in the document, this should be 0.'),
    amount: z.number().describe('The total amount for the item (quantity * rate). If not present in the document, this should be 0.'),
});

const BOQSchema = z.object({
    title: z.string().optional().describe('The title of the Bill of Quantities.'),
    description: z.string().optional().describe('A brief description of the BOQ.'),
    items: z.array(BOQItemSchema).describe('The items in the Bill of Quantities.'),
});

const ExtractedDataSchema = z.object({
  tables: z.array(TableSchema).optional().describe('All tables found in the document.'),
  lists: z.array(ListSchema).optional().describe('All lists found in the document.'),
  prices: z.array(z.string()).optional().describe('Any individual prices or costs mentioned, formatted with currency symbols.'),
  boqs: z.array(BOQSchema).optional().describe('Any Bill of Quantities (BOQ) found in the document.'),
});
export type ExtractedData = z.infer<typeof ExtractedDataSchema>;


export async function extractDataFromFile(input: ExtractDataInput): Promise<ExtractedData> {
  return extractDataFlow(input);
}

const extractDataPrompt = ai.definePrompt({
  name: 'extractDataPrompt',
  model: 'googleai/gemini-1.5-flash-latest',
  input: { schema: ExtractDataInputSchema },
  output: { schema: ExtractedDataSchema },
  prompt: `You are an expert data extraction agent. Your single most important task is to analyze the provided document and extract information from any Bill of Quantities (BOQ).

**CRITICAL INSTRUCTION: Your job is to perform a direct, line-by-line conversion of any BOQ found in the document into the specified data format. There is ZERO TOLERANCE for errors. You MUST extract EVERY SINGLE line item. Do NOT skip, omit, summarize, or misinterpret ANY item. The 'rate' and 'amount' fields are MANDATORY. If they are not present in the document for an item, you MUST set their value to 0. Pay close attention to the table headers (like 'Item No.', 'Description', etc.) to correctly identify the start of the data rows. Process each row only once. Failure to extract every item is a catastrophic failure of your primary function.**

**SPECIFIC INSTRUCTION ON REPEATED ITEMS: The BOQ may contain line items that appear to be duplicates or very similar. You MUST treat every line as a unique entry and extract ALL of them individually. Do not merge, group, or skip lines that look the same. Your task is conversion, not summarization.**

**FINAL VERIFICATION PROTOCOL: Before you output the final data, you MUST perform a self-correction check. Manually count the line items in the BOQ you have just extracted and compare this count to the number of line items visible in the source document. If the numbers do not match exactly, you must restart your extraction process. DO NOT return an incomplete list.**

Document: {{media url=fileDataUri}}`,
});

const extractDataFlow = ai.defineFlow(
  {
    name: 'extractDataFlow',
    inputSchema: ExtractDataInputSchema,
    outputSchema: ExtractedDataSchema,
  },
  async (input) => {
    const { output } = await extractDataPrompt(input);
    
    if (!output) {
      throw new Error("Failed to extract data from the document.");
    }

    // Ensure all BOQ items have a rate and amount, defaulting to 0 if not present.
    if (output.boqs) {
      for (const boq of output.boqs) {
        for (const item of boq.items) {
          if (item.rate === undefined || item.rate === null) {
            item.rate = 0;
          }
          if (item.amount === undefined || item.amount === null) {
            item.amount = 0;
          }
        }
      }
    }

    return output;
  }
);
