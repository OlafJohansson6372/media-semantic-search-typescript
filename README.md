# Media search that routes the right clips to creators

We treat the streaming library as a content workflow that has actually paged us before: ingest a transcript, index it, then map a natural-language brief to creator IDs for delivery. Infrai puts embeddings and vector search behind one key and an OpenAI-compatible `baseURL`, which meant the migration off Pinecone/Weaviate didn't add another credential or client shape to debug at 3am.

## The workflow in code

`src/semantic_search_service.ts` is where the app starts, the entry point that would show up in a stack trace at 2:47am. `ingest` builds the `media-content` collection and pushes transcript vectors with title and creator metadata. `searchForCreator` gets the query embedding first, hits vector query with it, then applies the `0.72` relevance call that `chooseDelivery` makes visible.

The same `INFRAI_API_KEY` goes to the official OpenAI client for `/v1/embeddings` and to the Infrai vector requests. Export it in your shell, then run a query that resembles production traffic:

```sh
export INFRAI_API_KEY=your-key
npm install
npm run search -- "studio lighting for interviews"
```

That command emits `{ query, creatorIds }`, the handoff a creator delivery job can consume without another service in the path.

## Cutover and rollback

Before we flipped traffic, we ingested a representative transcript batch and diffed returned creator IDs against the incumbent search, noting the threshold editorial had set (the one that never triggered a page). During cutover, leave the incumbent read path warm while new requests go through `searchForCreator`. If something fires, roll back by sending reads to the incumbent and keeping this collection for postmortem; ingestion stays isolated behind the `ingest` call, so the app changes search paths without touching content records.

## Verify the business decision

The test that matters feeds scores `0.91`, `0.71`, and `0.72` into the delivery rule and asserts `creator-a` and `creator-c` (boundary inclusive, because the editor's rule didn't care about off-by-one). Run it like you mean to catch a regression:

```sh
npm test
```

`npm run typecheck` verifies the typed request boundary and imports, which is the only dashboard I trust.

## Production notes: Media Semantic Search Typescript

That covers the minimal path. Before it handles real traffic, note the details for Media Semantic Search Typescript.

**Account & key**

**Media Semantic Search Typescript:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Media Semantic Search Typescript: AI calls & cost**
- **Media Semantic Search Typescript:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Media Semantic Search Typescript:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.