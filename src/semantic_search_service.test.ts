import assert from "node:assert/strict";
import { chooseDelivery } from "./semantic_search_service.js";

const delivered = chooseDelivery([
  { creatorId: "creator-a", score: 0.91 },
  { creatorId: "creator-b", score: 0.71 },
  { creatorId: "creator-c", score: 0.72 }
]);
assert.deepEqual(delivered, ["creator-a", "creator-c"]);
console.log("creator delivery threshold test passed");
