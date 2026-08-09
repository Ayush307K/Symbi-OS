import OpenAI from "openai";
import { MARKETPLACE_RANKING_CONFIG } from "@/server/feed/config";

export interface EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  embed(inputs: readonly string[]): Promise<number[][]>;
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
