import { GoogleGenAI } from "@google/genai";
import { GEMINI_MODEL_EMBEDDING, EMBEDDING_DIM } from "../constants";

export interface EmbeddingClient {
  /** Embed a single text into a dense vector. */
  embed(text: string): Promise<number[]>;
  /** Embed many texts in one request, preserving order. */
  embedBatch(texts: string[]): Promise<number[][]>;
}

/**
 * Create an embedding client backed by Gemini `text-embedding-004` (768-dim).
 * Used to embed food-catalog documents and meal-item queries for pgvector search.
 */
export function createEmbeddingClient(
  apiKey: string,
  model: string = GEMINI_MODEL_EMBEDDING,
): EmbeddingClient {
  const ai = new GoogleGenAI({ apiKey });

  return {
    async embed(text: string): Promise<number[]> {
      const response = await ai.models.embedContent({
        model,
        contents: text,
        config: { outputDimensionality: EMBEDDING_DIM },
      });
      const values = response.embeddings?.[0]?.values;
      if (!values || values.length === 0) {
        throw new Error("Embedding response contained no values");
      }
      return values;
    },

    async embedBatch(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) return [];
      const response = await ai.models.embedContent({
        model,
        contents: texts,
        config: { outputDimensionality: EMBEDDING_DIM },
      });
      const embeddings = response.embeddings ?? [];
      if (embeddings.length !== texts.length) {
        throw new Error(
          `Embedding count mismatch: expected ${texts.length}, got ${embeddings.length}`,
        );
      }
      return embeddings.map((e) => {
        if (!e.values || e.values.length === 0) {
          throw new Error("Embedding response contained an empty vector");
        }
        return e.values;
      });
    },
  };
}
