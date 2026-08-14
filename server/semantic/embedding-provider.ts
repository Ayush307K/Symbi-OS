import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { MARKETPLACE_RANKING_CONFIG } from "@/server/feed/config";

/**
 * What a text is being embedded *for*. Retrieval is asymmetric — the same
 * sentence embedded as a stored document and as a search query should not land
 * in the same place — and providers that model this produce better recall.
 * Optional: a provider without the concept ignores it.
 */
export type EmbeddingPurpose = "document" | "query";

export interface EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  embed(
    inputs: readonly string[],
    purpose?: EmbeddingPurpose,
  ): Promise<number[][]>;
}

export type EmbeddingProviderFactory = () => EmbeddingProvider;

const providerFactories = new Map<string, EmbeddingProviderFactory>();

export function registerEmbeddingProvider(
  name: string,
  factory: EmbeddingProviderFactory,
) {
  providerFactories.set(name.trim().toLowerCase(), factory);
}

class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = "openai";
  readonly dimensions = MARKETPLACE_RANKING_CONFIG.embedding.dimensions;
  private client: OpenAI | null = null;

  private getClient() {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) throw new Error("OPENAI_API_KEY is required for the OpenAI embedding provider.");
    this.client ??= new OpenAI({ apiKey });
    return this.client;
  }

  async embed(inputs: readonly string[]) {
    if (inputs.length === 0) return [];
    const response = await this.getClient().embeddings.create({
      model:
        process.env.LISTING_EMBEDDING_MODEL?.trim() ||
        MARKETPLACE_RANKING_CONFIG.embedding.defaultModel,
      input: [...inputs],
      dimensions: this.dimensions,
      encoding_format: "float",
    });
    return response.data
      .sort((left, right) => left.index - right.index)
      .map((item) => item.embedding);
  }
}

registerEmbeddingProvider("openai", () => new OpenAIEmbeddingProvider());

/**
 * Scale a vector to unit length.
 *
 * Both vector columns are indexed with vector_cosine_ops. Cosine ignores
 * magnitude in principle, but a truncated Gemini vector is not unit length
 * (measured 0.587 at 768 of 3072 dimensions), and pgvector's cosine operator
 * is only equivalent to a dot product on normalised input. Normalising once at
 * write time keeps stored vectors and query vectors on the same footing.
 */
export function normalizeUnitVector(vector: readonly number[]) {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(norm) || norm === 0) {
    throw new Error("Cannot normalise a zero or non-finite embedding.");
  }
  return vector.map((value) => value / norm);
}

class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly name = "gemini";
  readonly dimensions = MARKETPLACE_RANKING_CONFIG.embedding.dimensions;
  private client: GoogleGenAI | null = null;

  private get settings() {
    return MARKETPLACE_RANKING_CONFIG.embedding.gemini;
  }

  private getClient() {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) throw new Error("GEMINI_API_KEY is required for the Gemini embedding provider.");
    this.client ??= new GoogleGenAI({ apiKey });
    return this.client;
  }

  /**
   * Retry on rate limiting, with exponential backoff.
   *
   * The free tier limits requests per minute, and a full backfill of this
   * catalogue exceeds it partway through — 54 listings then 54 documents was
   * enough. Without this, half the corpus silently ends up unembedded and
   * retrieval quietly degrades to lexical for exactly those rows.
   *
   * Only 429/RESOURCE_EXHAUSTED is retried. A bad key or a wrong model should
   * fail immediately rather than after a minute of backoff.
   */
  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    const { maxRetries, baseDelayMs } = this.settings.rateLimit;
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        const rateLimited =
          message.includes("429") || message.includes("RESOURCE_EXHAUSTED");
        if (!rateLimited || attempt === maxRetries) throw error;
        const delay = baseDelayMs * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw lastError;
  }

  async embed(inputs: readonly string[], purpose: EmbeddingPurpose = "document") {
    if (inputs.length === 0) return [];
    const settings = this.settings;
    const model =
      process.env.LISTING_EMBEDDING_MODEL?.trim() || settings.model;
    const taskType =
      purpose === "query" ? settings.queryTaskType : settings.documentTaskType;

    const vectors: number[][] = [];
    // The API caps inputs per request, and a backfill batch can exceed it.
    for (let start = 0; start < inputs.length; start += settings.maxBatchSize) {
      const slice = inputs.slice(start, start + settings.maxBatchSize);
      const response = await this.withRetry(() =>
        this.getClient().models.embedContent({
          model,
          contents: [...slice],
          config: {
            outputDimensionality: settings.outputDimensionality,
            taskType,
          },
        }),
      );
      const batch = response.embeddings ?? [];
      if (batch.length !== slice.length) {
        throw new Error(
          `Gemini returned ${batch.length} embeddings for ${slice.length} inputs.`,
        );
      }
      for (const item of batch) {
        const values = item.values ?? [];
        vectors.push(
          settings.normalizeAfterTruncation ? normalizeUnitVector(values) : values,
        );
      }
    }
    return vectors;
  }
}

registerEmbeddingProvider("gemini", () => new GeminiEmbeddingProvider());


export function getEmbeddingProvider(name = process.env.LISTING_EMBEDDING_PROVIDER) {
  const selected =
    name?.trim().toLowerCase() ||
    MARKETPLACE_RANKING_CONFIG.embedding.defaultProvider;
  const factory = providerFactories.get(selected);
  if (!factory) {
    throw new Error(
      `Unknown embedding provider "${selected}". Register it with registerEmbeddingProvider().`,
    );
  }
  return factory();
}

export function validateEmbedding(
  vector: readonly number[],
  dimensions: number = MARKETPLACE_RANKING_CONFIG.embedding.dimensions,
) {
  if (vector.length !== dimensions) {
    throw new Error(`Expected a ${dimensions}-dimension embedding; received ${vector.length}.`);
  }
  if (vector.some((value) => !Number.isFinite(value))) {
    throw new Error("Embedding contains a non-finite value.");
  }
  if (vector.every((value) => value === 0)) {
    throw new Error("Embedding is a zero vector and cannot be cosine-indexed.");
  }
  return [...vector];
}
