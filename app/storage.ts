"use client";

import Dexie, { type EntityTable } from "dexie";
import { createEmptyCard, fsrs, Rating, type Card as FsrsCard, type Grade } from "ts-fsrs";
import { z } from "zod";
import { builtInCards, decks, type Deck, type LearningCard } from "./data";
import { validateBackup } from "./backup";

export type ReviewState = {
  cardId: string;
  fsrsCard: FsrsCard;
  correctStreak: number;
  totalCorrect: number;
  totalWrong: number;
  lastReviewedAt?: Date;
};

export type ReviewLogEntry = {
  id?: number;
  cardId: string;
  deckId: string;
  reviewedAt: Date;
  rating: number;
  correct: boolean;
  mode: "review" | "sprint";
  points: number;
};

export type SessionRecord = {
  id?: number;
  startedAt: Date;
  finishedAt: Date;
  mode: "review" | "sprint";
  deckId?: string;
  correct: number;
  total: number;
  score: number;
};

export type Setting = {
  key: string;
  value: unknown;
};

class MemoQuestDatabase extends Dexie {
  decks!: EntityTable<Deck, "id">;
  cards!: EntityTable<LearningCard, "id">;
  reviewStates!: EntityTable<ReviewState, "cardId">;
  reviewLogs!: EntityTable<ReviewLogEntry, "id">;
  sessions!: EntityTable<SessionRecord, "id">;
  settings!: EntityTable<Setting, "key">;

  constructor() {
    super("memoquest");
    this.version(1).stores({
      decks: "id, title",
      cards: "id, deckId, kind, *tags",
      reviewStates: "cardId, [fsrsCard.due+cardId], lastReviewedAt",
      reviewLogs: "++id, cardId, deckId, reviewedAt, mode",
      sessions: "++id, startedAt, mode, deckId",
      settings: "key",
    });
  }
}

export const db = new MemoQuestDatabase();
export const scheduler = fsrs({ request_retention: 0.9, enable_fuzz: true });

export async function seedDatabase() {
  const seeded = await db.settings.get("seedVersion");
  if (seeded?.value === 1) return;

  await db.transaction("rw", db.decks, db.cards, db.settings, async () => {
    await db.decks.bulkPut(decks);
    await db.cards.bulkPut(builtInCards);
    await db.settings.put({ key: "seedVersion", value: 1 });
    await db.settings.put({ key: "dailyNewLimit", value: 10 });
  });
}

export async function scheduleReview(
  card: LearningCard,
  rating: Grade,
  correct: boolean,
  points: number,
) {
  const now = new Date();
  const previous = await db.reviewStates.get(card.id);
  const fsrsCard: FsrsCard = previous?.fsrsCard ?? createEmptyCard<FsrsCard>(now);
  const result = scheduler.next(fsrsCard, now, rating);

  await db.transaction("rw", db.reviewStates, db.reviewLogs, async () => {
    await db.reviewStates.put({
      cardId: card.id,
      fsrsCard: result.card,
      correctStreak: correct ? (previous?.correctStreak ?? 0) + 1 : 0,
      totalCorrect: (previous?.totalCorrect ?? 0) + (correct ? 1 : 0),
      totalWrong: (previous?.totalWrong ?? 0) + (correct ? 0 : 1),
      lastReviewedAt: now,
    });
    await db.reviewLogs.add({
      cardId: card.id,
      deckId: card.deckId,
      reviewedAt: now,
      rating,
      correct,
      mode: "review",
      points,
    });
  });
}

export async function logSprintAnswer(card: LearningCard, correct: boolean, points: number) {
  await db.reviewLogs.add({
    cardId: card.id,
    deckId: card.deckId,
    reviewedAt: new Date(),
    rating: correct ? Rating.Good : Rating.Again,
    correct,
    mode: "sprint",
    points,
  });
}

export function isDue(state: ReviewState | undefined, now = new Date()) {
  if (!state) return true;
  return new Date(state.fsrsCard.due).getTime() <= now.getTime();
}

const webUrl = z.string().url().refine(value => /^https?:\/\//i.test(value), "Utilise une adresse web HTTP ou HTTPS.");
const cardSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["image", "text", "number"]).default("text"),
  prompt: z.string().min(1),
  answer: z.string().min(1),
  acceptedAnswers: z.array(z.string()).default([]),
  clue: z.string().default(""),
  explanation: z.string().default(""),
  emoji: z.string().optional(),
  image: webUrl.optional(),
  source: webUrl.optional(),
  tags: z.array(z.string()).default([]),
});

const deckSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  subtitle: z.string().default("Paquet personnel"),
  icon: z.string().default("✨"),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#6656d9"),
  soft: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#e9e6ff"),
});

export const deckPackageSchema = z.object({
  schemaVersion: z.literal(1),
  deck: deckSchema,
  cards: z.array(cardSchema).min(1),
});

export type DeckPackage = z.infer<typeof deckPackageSchema>;

export function validateDeckPackage(raw: string) {
  if (raw.length > 20_000_000) throw new Error("Le paquet dépasse la limite de 20 Mo.");
  const json = JSON.parse(raw);
  return deckPackageSchema.parse(json);
}

export async function importDeckPackage(payload: DeckPackage) {
  const isBuiltInId = decks.some((item) => item.id === payload.deck.id);
  const resolvedId = isBuiltInId
    ? `${payload.deck.id}-perso-${Date.now().toString(36)}`
    : payload.deck.id;
  const deck: Deck = {
    ...payload.deck,
    id: resolvedId,
    cardCount: payload.cards.length,
  };
  const cards: LearningCard[] = payload.cards.map((card) => ({
    ...card,
    id: `${resolvedId}-${card.id}`,
    deckId: deck.id,
    acceptedAnswers: Array.from(new Set([card.answer, ...card.acceptedAnswers])),
  }));

  await db.transaction("rw", db.decks, db.cards, async () => {
    await db.decks.put(deck);
    await db.cards.where("deckId").equals(deck.id).delete();
    await db.cards.bulkPut(cards);
  });

  return { deck, cards };
}

export async function createBackup() {
  const [savedDecks, cards, reviewStates, reviewLogs, sessions, settings] =
    await Promise.all([
      db.decks.toArray(),
      db.cards.toArray(),
      db.reviewStates.toArray(),
      db.reviewLogs.toArray(),
      db.sessions.toArray(),
      db.settings.toArray(),
    ]);

  return {
    backupVersion: 1,
    exportedAt: new Date().toISOString(),
    decks: savedDecks,
    cards,
    reviewStates,
    reviewLogs,
    sessions,
    settings,
  };
}

export async function restoreBackup(raw: string) {
  const backup = validateBackup(raw);

  await db.transaction(
    "rw",
    [db.decks, db.cards, db.reviewStates, db.reviewLogs, db.sessions, db.settings],
    async () => {
      await Promise.all([
        db.decks.clear(),
        db.cards.clear(),
        db.reviewStates.clear(),
        db.reviewLogs.clear(),
        db.sessions.clear(),
        db.settings.clear(),
      ]);
      await db.decks.bulkAdd(backup.decks ?? []);
      await db.cards.bulkAdd(backup.cards ?? []);
      await db.reviewStates.bulkAdd(backup.reviewStates ?? []);
      await db.reviewLogs.bulkAdd(backup.reviewLogs ?? []);
      await db.sessions.bulkAdd(backup.sessions ?? []);
      await db.settings.bulkAdd(backup.settings ?? []);
    },
  );
}
