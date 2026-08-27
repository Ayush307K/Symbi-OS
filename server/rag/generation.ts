import {
  FunctionCallingConfigMode,
  GoogleGenAI,
  type FunctionDeclaration,
} from "@google/genai";
import { MARKETPLACE_RANKING_CONFIG } from "@/server/feed/config";

/**
 * Grounded answer generation, behind one interface so the model is swappable.
 *
 * The previous call site constructed an OpenAI client inline and defaulted to
 * "gpt-5.6-terra", so switching provider meant editing retrieval code, and a
 * wrong model id degraded silently to the extractive fallback with nothing
 * said. A provider is selected by name here and reports whether it can run.
 */
export interface GenerationProvider {
  readonly name: string;
  readonly model: string;
  /** False when the provider has no credentials; callers fall back extractively. */
  isConfigured(): boolean;
  generate(input: { instructions: string; prompt: string }): Promise<string>;
  /** Optional structured tool selection used by the marketplace assistant. */
  selectTool?(input: {
    instructions: string;
    prompt: string;
    tools: GenerationToolDefinition[];
  }): Promise<GenerationToolCall | null>;
}

export interface GenerationToolDefinition {
  name: string;
  description: string;
  parametersJsonSchema: Record<string, unknown>;
}

export interface GenerationToolCall {
  name: string;
  args: Record<string, unknown>;
}

class GeminiGenerationProvider implements GenerationProvider {
  readonly name = "gemini";
  private client: GoogleGenAI | null = null;

  get model() {
    return (
      process.env.GEMINI_RAG_MODEL?.trim() ||
      MARKETPLACE_RANKING_CONFIG.generation.gemini.model
    );
  }

  isConfigured() {
    return Boolean(process.env.GEMINI_API_KEY?.trim());
  }

  private getClient() {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey)
      throw new Error("GEMINI_API_KEY is required for Gemini generation.");
    this.client ??= new GoogleGenAI({ apiKey });
    return this.client;
  }

  async generate({
    instructions,
    prompt,
  }: {
    instructions: string;
    prompt: string;
  }) {
    const settings = MARKETPLACE_RANKING_CONFIG.generation.gemini;
    const response = await this.getClient().models.generateContent({
      model: this.model,
      contents: prompt,
      config: {
        // The grounding rules are a system instruction rather than part of the
        // prompt, so retrieved supplier text cannot sit alongside them as if it
        // carried the same authority.
        systemInstruction: instructions,
        temperature: settings.temperature,
        maxOutputTokens: settings.maxOutputTokens,
      },
    });
    return (response.text ?? "").trim();
  }

  async selectTool({
    instructions,
    prompt,
    tools,
  }: {
    instructions: string;
    prompt: string;
    tools: GenerationToolDefinition[];
  }): Promise<GenerationToolCall | null> {
    const response = await this.getClient().models.generateContent({
      model: this.model,
      contents: prompt,
      config: {
        systemInstruction: instructions,
        temperature: 0,
        maxOutputTokens: 256,
        tools: [
          {
            functionDeclarations: tools.map((tool): FunctionDeclaration => ({
              name: tool.name,
              description: tool.description,
              parametersJsonSchema: tool.parametersJsonSchema,
            })),
          },
        ],
        toolConfig: {
          functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO },
        },
      },
    });
    const call = response.functionCalls?.[0];
    return call?.name ? { name: call.name, args: call.args ?? {} } : null;
  }
}

const providers = new Map<string, () => GenerationProvider>([
  ["gemini", () => new GeminiGenerationProvider()],
]);

export function registerGenerationProvider(
  name: string,
  factory: () => GenerationProvider,
) {
  providers.set(name.trim().toLowerCase(), factory);
}

export function getGenerationProvider(
  name = process.env.RAG_GENERATION_PROVIDER,
) {
  const selected =
    name?.trim().toLowerCase() ||
    MARKETPLACE_RANKING_CONFIG.generation.defaultProvider;
  const factory = providers.get(selected);
  if (!factory) {
    throw new Error(
      `Unknown generation provider "${selected}". Register it with registerGenerationProvider().`,
    );
  }
  return factory();
}
