// ---------------------------------------------------------------------------
//  Symbi-OS — OpenAI Embedding Utility
//
//  Wraps text-embedding-3-small for use in API routes.
//  Cached singleton to avoid re-instantiating on every request.
// ---------------------------------------------------------------------------

import { OpenAIEmbeddings } from "@langchain/openai";

let instance: OpenAIEmbeddings | null = null;

function getEmbeddings(): OpenAIEmbeddings {
  if (!instance) {
    instance = new OpenAIEmbeddings({
      model: "text-embedding-3-small",
    });
  }
  return instance;
}

/** Embed a single query string → 1536-d float array. */
export async function embedQuery(text: string): Promise<number[]> {
  return getEmbeddings().embedQuery(text);
}

/** Embed multiple documents → array of 1536-d float arrays. */
export async function embedDocuments(texts: string[]): Promise<number[][]> {
  return getEmbeddings().embedDocuments(texts);
}
