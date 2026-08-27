import test from "node:test";
import assert from "node:assert/strict";

import { __testables } from "../src/worker.js";

const {
  OFFICIAL_ASSISTANT_SEEDS,
  collectAssistantFeatures,
  officialAssistantRowPayload
} = __testables;

test("official assistant seeds は 5件以上あり category を持つ", () => {
  assert.ok(Array.isArray(OFFICIAL_ASSISTANT_SEEDS));
  assert.ok(OFFICIAL_ASSISTANT_SEEDS.length >= 5);
  for (const seed of OFFICIAL_ASSISTANT_SEEDS) {
    assert.equal(typeof seed.id, "string");
    assert.equal(typeof seed.slug, "string");
    assert.equal(typeof seed.category, "string");
    assert.ok(seed.category.length > 0);
    assert.ok(Array.isArray(seed.features));
    assert.ok(seed.features.length > 0);
  }
});

test("collectAssistantFeatures は enabled かつ active の feature だけを重複なしで返す", () => {
  const features = collectAssistantFeatures([
    { enabled: true, isActive: true, features: ["review_support", "study_review"] },
    { enabled: true, isActive: true, features: ["study_review", "preset_builder"] },
    { enabled: false, isActive: true, features: ["feed_curator"] },
    { enabled: true, isActive: false, features: ["habit_support"] }
  ]);
  assert.deepEqual(features, ["review_support", "study_review", "preset_builder"]);
});

test("officialAssistantRowPayload は category と added/enabled を含む", () => {
  const payload = officialAssistantRowPayload({
    id: "oa_review_support",
    account_kind: "official_extension_assistant",
    name: "復習アシスタント",
    slug: "review-support",
    category: "復習",
    description: "復習を整理します。",
    avatar: "review",
    features_json: JSON.stringify(["review_support", "study_review"]),
    is_active: 1,
    added_count: 42,
    updated_at: 100
  }, new Map([
    ["oa_review_support", { enabled: true, addedAt: 10, updatedAt: 20 }]
  ]));
  assert.equal(payload.officialBadge, true);
  assert.equal(payload.category, "復習");
  assert.equal(payload.addedCount, 42);
  assert.equal(payload.added, true);
  assert.equal(payload.enabled, true);
  assert.deepEqual(payload.features, ["review_support", "study_review"]);
});
