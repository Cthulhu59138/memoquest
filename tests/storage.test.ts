import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { test, beforeEach, after } from "node:test";
import { Rating } from "ts-fsrs";
import { db, seedDatabase, createBackup, restoreBackup, scheduleReview, logSprintAnswer, validateDeckPackage, importDeckPackage } from "../app/storage";
import { builtInCards } from "../app/data";

beforeEach(async () => { await db.delete(); await db.open(); await seedDatabase(); });
after(async () => { await db.delete(); });

test("restores a JSON v1 backup including dates, progress and personal cards", async () => {
  await scheduleReview(builtInCards[0], Rating.Good, true, 10);
  await db.sessions.add({ startedAt: new Date(), finishedAt: new Date(), mode: "review", correct: 1, total: 1, score: 10 });
  await importDeckPackage(validateDeckPackage(JSON.stringify({ schemaVersion: 1, deck: { id: "test-personal", title: "Essai" }, cards: [{ id: "one", prompt: "Combien ?", answer: "2" }] })));
  const saved = JSON.stringify(await createBackup());
  await db.delete(); await db.open();
  await restoreBackup(saved);
  const restored = await createBackup();
  assert.equal(restored.cards.length, 161);
  const original = JSON.parse(saved);
  assert.deepEqual(JSON.parse(JSON.stringify(restored.reviewStates)), original.reviewStates);
  assert.deepEqual(JSON.parse(JSON.stringify(restored.reviewLogs)), original.reviewLogs);
  assert.deepEqual(JSON.parse(JSON.stringify(restored.sessions)), original.sessions);
  assert.deepEqual(restored.cards, original.cards);
  assert.deepEqual(restored.decks, original.decks);
  assert.deepEqual(restored.settings, original.settings);
  assert.ok(restored.reviewStates[0].fsrsCard.due instanceof Date);
  assert.ok(restored.reviewLogs[0].reviewedAt instanceof Date);
  await scheduleReview(builtInCards[0], Rating.Good, true, 10);
  assert.equal((await db.reviewStates.get(builtInCards[0].id))?.fsrsCard.reps, 2);
});

test("a Sprint does not modify existing FSRS states or create new ones", async () => {
  await scheduleReview(builtInCards[0], Rating.Good, true, 10);
  const states = await db.reviewStates.toArray();
  await logSprintAnswer(builtInCards[0], true, 20);
  await logSprintAnswer(builtInCards[1], false, 0);
  assert.deepEqual(await db.reviewStates.toArray(), states);
  assert.equal(await db.reviewLogs.where("mode").equals("sprint").count(), 2);
});

test("invalid or incomplete backups leave every existing table unchanged", async () => {
  await scheduleReview(builtInCards[0], Rating.Again, false, 0);
  const before = await createBackup();
  for (const raw of ["not json", '{"backupVersion":1,"cards":[]}', JSON.stringify({ ...before, reviewStates: [{ ...before.reviewStates[0], fsrsCard: { ...before.reviewStates[0].fsrsCard, due: "invalid" } }] }), JSON.stringify({ ...before, cards: [...before.cards, before.cards[0]] })]) {
    await assert.rejects(restoreBackup(raw));
    const current = await createBackup();
    assert.deepEqual({ ...current, exportedAt: "" }, { ...before, exportedAt: "" });
  }
});

test("valid import creates a personal copy when it uses a built-in deck id", async () => {
  const original = await db.cards.where("deckId").equals("nature").toArray();
  const payload = validateDeckPackage(JSON.stringify({ schemaVersion: 1, deck: { id: "nature", title: "Mon essai" }, cards: [{ id: "one", prompt: "Question", answer: "Réponse" }] }));
  const { deck } = await importDeckPackage(payload);
  assert.notEqual(deck.id, "nature");
  assert.deepEqual(await db.cards.where("deckId").equals("nature").toArray(), original);
  assert.equal(await db.cards.where("deckId").equals(deck.id).count(), 1);
});

test("malformed imports fail before writing and seed is idempotent", async () => {
  assert.throws(() => validateDeckPackage('{"schemaVersion":2,"cards":[]}'));
  await seedDatabase();
  assert.equal(await db.cards.count(), 160);
  assert.equal(await db.decks.count(), 4);
});

test("progress survives closing and reopening the database", async () => {
  await scheduleReview(builtInCards[1], Rating.Easy, true, 15);
  const state = await db.reviewStates.get(builtInCards[1].id);
  db.close(); await db.open();
  assert.deepEqual(await db.reviewStates.get(builtInCards[1].id), state);
});
