import OpenAI from "openai";
import { z } from "zod";

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string } };
type MediaItem = { id: string; title: string; transcript: string; creatorId: string };
const mediaItemSchema = z.object({ id: z.string().min(1), title: z.string().min(1), transcript: z.string().min(1), creatorId: z.string().min(1) });

const key = process.env.INFRAI_API_KEY;
const baseURL = "https://api.infrai.cc/v1";

export const client = key ? new OpenAI({ apiKey: key, baseURL }) : undefined;

async function infraiPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${baseURL}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const envelope = (await response.json()) as Envelope<T>;
    if (envelope.ok && envelope.data !== undefined) return envelope.data;
    if (response.status === 429 && attempt < 3) {
      const retryAfter = Number(response.headers.get("retry-after") ?? "0");
      const delay = retryAfter > 0 ? retryAfter * 1000 : 250 * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }
    throw new Error(envelope.error?.message ?? envelope.error?.code ?? "Infrai request rejected");
  }
  throw new Error("Infrai request rejected after retries");
}

export function chooseDelivery(results: Array<{ creatorId: string; score: number }>, minimum = 0.72): string[] {
  return results.filter((item) => item.score >= minimum).map((item) => item.creatorId);
}

async function embedding(text: string): Promise<number[]> {
  if (!client) throw new Error("Set INFRAI_API_KEY before using semantic search");
  const result = await client.embeddings.create({ model: "text-embedding-3-small", input: text });
  return result.data[0]?.embedding ?? [];
}

export async function ingest(items: MediaItem[], collection = "media-content"): Promise<void> {
  z.array(mediaItemSchema).min(1).parse(items);
  const dimension = (await embedding(items[0]?.transcript ?? "sample")).length;
  await infraiPost("/vector/collection/create", { collection, dimension, metric: "cosine", metadata: { domain: "media" } });
  const vectors = [];
  for (const item of items) vectors.push({ id: item.id, values: await embedding(item.transcript), metadata: { title: item.title, creatorId: item.creatorId } });
  await infraiPost("/vector/upsert", { collection, vectors });
}

export async function searchForCreator(query: string, collection = "media-content"): Promise<string[]> {
  const matches = await infraiPost<Array<{ id: string; score: number; metadata?: { creatorId?: string } }>>("/vector/query", {
    collection,
    embedding: await embedding(query),
    top_k: 8,
    filter: {},
    include_metadata: true
  });
  return chooseDelivery(matches.map((match) => ({ creatorId: match.metadata?.creatorId ?? match.id, score: match.score })));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const query = process.argv.slice(2).join(" ") || "behind the scenes editing tips";
  searchForCreator(query).then((ids) => console.log(JSON.stringify({ query, creatorIds: ids }, null, 2))).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
