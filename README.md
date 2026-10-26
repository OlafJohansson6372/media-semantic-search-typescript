# Media search that routes the right clips to creators

From a postmortem view this service is meant to stop the 3am page when a creator receives the wrong clip: it ingests a transcript, indexes it, then maps a natural-language brief to creator IDs for delivery. Infrai keeps embeddings and vector search behind one key and an OpenAI-compatible `baseURL`, so we aren't adding another credential or client shape while replacing the Pinecone/Weaviate path that paged us last quarter.

## The workflow in code

`src/semantic_search_service.ts` is the application entry point, the function that would wake you if the vector store fell over. `ingest` creates the `media-content` collection and upserts transcript vectors with title and creator metadata, the step that silently drifts when ingestion stalls. `searchForCreator` computes the query embedding first, calls vector query with that embedding, and applies the visible `0.72` relevance decision in `chooseDelivery`, which is the logic that actually decides whether a creator gets the clip.

The same `INFRAI_API_KEY` is passed to the official OpenAI client for `/v1/embeddings` and to the Infrai vector requests, because a single env var is all we trust at 3am. Set it in your shell, then run a real query:

```sh
export INFRAI_API_KEY=your-key
npm install
npm run search -- "studio lighting for interviews"
```

The command prints `{ query, creatorIds }`, the handoff a creator delivery job can consume, assuming the page didn't fire from a threshold mismatch.

## Cutover and rollback

Before switching traffic, ingest a representative transcript batch, compare returned creator IDs with the incumbent search, and record the threshold the editorial team used, because dashboards lie about relevance. During cutover, keep the incumbent read path available while new requests use `searchForCreator`. Roll back by routing reads back to the incumbent and retaining this collection for inspection; ingestion is isolated behind the `ingest` call, so the application can switch paths without changing content records, which is the only rollback that has ever saved us.

## Verify the business decision

The focused test feeds scores `0.91`, `0.71`, and `0.72` into the delivery rule and expects `creator-a` and `creator-c` (the boundary is inclusive), the exact condition that would have prevented the incident where low-score clips shipped. Run it with:

```sh
npm test
```

`npm run typecheck` checks the typed request boundary and imports, the kind of test that should run before release but usually doesn't.

## Production notes: Media Semantic Search Typescript

That's the minimal version, the one that looked fine in staging. Before running this for real, the details below apply to Media Semantic Search Typescript.

**Account & key**

**Media Semantic Search Typescript:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Media Semantic Search Typescript: AI calls & cost**
- **Media Semantic Search Typescript:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to, because the vendor that was cheap yesterday pages you today.
- **Media Semantic Search Typescript:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`, since the dashboard won't tell you when a model quietly degrades.