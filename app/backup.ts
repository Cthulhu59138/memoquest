import { z } from "zod";

const isoDate = z.union([z.date(), z.iso.datetime({ offset: true }).transform((value) => new Date(value))]);
const id = z.string().min(1);
const nonnegative = z.number().finite().min(0);
const webUrl = z.string().url().refine(value => /^https?:\/\//i.test(value), "Adresse web non autorisée.");
const dateFields = {
  due: isoDate,
  stability: nonnegative,
  difficulty: nonnegative,
  elapsed_days: nonnegative,
  scheduled_days: nonnegative,
  reps: nonnegative.int(),
  lapses: nonnegative.int(),
  state: z.number().int().min(0).max(3),
  learning_steps: nonnegative.int().default(0),
  last_review: isoDate.optional(),
};
const storedCard = z.object({
  id, deckId: id, kind: z.enum(["image", "text", "number"]),
  prompt: z.string().min(1), answer: z.string().min(1),
  acceptedAnswers: z.array(z.string()), clue: z.string(), explanation: z.string(),
  emoji: z.string().optional(), image: webUrl.optional(), source: webUrl.optional(), tags: z.array(z.string()),
});
const backupSchema = z.object({
  backupVersion: z.literal(1), exportedAt: isoDate,
  decks: z.array(z.object({ id, title: z.string().min(1), subtitle: z.string(), icon: z.string(), accent: z.string(), soft: z.string(), cardCount: nonnegative.int() })),
  cards: z.array(storedCard),
  reviewStates: z.array(z.object({ cardId: id, fsrsCard: z.object(dateFields), correctStreak: nonnegative.int(), totalCorrect: nonnegative.int(), totalWrong: nonnegative.int(), lastReviewedAt: isoDate.optional() })),
  reviewLogs: z.array(z.object({ id: z.number().int().positive().optional(), cardId: id, deckId: id, reviewedAt: isoDate, rating: z.number().int().min(1).max(4), correct: z.boolean(), mode: z.enum(["review", "sprint"]), points: z.number().finite() })),
  sessions: z.array(z.object({ id: z.number().int().positive().optional(), startedAt: isoDate, finishedAt: isoDate, mode: z.enum(["review", "sprint"]), deckId: id.optional(), correct: nonnegative.int(), total: nonnegative.int(), score: z.number().finite() })),
  settings: z.array(z.object({ key: id, value: z.unknown() })),
});

export function validateBackup(raw: string) {
  if (raw.length > 20_000_000) throw new Error("La sauvegarde dépasse la limite de 20 Mo.");
  const parsed = backupSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) throw new Error("La sauvegarde est incomplète ou incompatible. Tes données n’ont pas été modifiées.");
  const backup = parsed.data;
  function unique(values: Array<string | number | undefined>) {
    const defined = values.filter((value) => value !== undefined);
    if (new Set(defined).size !== defined.length) throw new Error("La sauvegarde contient des identifiants en double.");
  }
  unique(backup.decks.map(x => x.id)); unique(backup.cards.map(x => x.id));
  unique(backup.reviewStates.map(x => x.cardId)); unique(backup.reviewLogs.map(x => x.id));
  unique(backup.sessions.map(x => x.id)); unique(backup.settings.map(x => x.key));
  const deckIds = new Set(backup.decks.map(x => x.id));
  const cardIds = new Set(backup.cards.map(x => x.id));
  if (backup.cards.some(x => !deckIds.has(x.deckId)) || backup.reviewStates.some(x => !cardIds.has(x.cardId))) {
    throw new Error("Des cartes ou des paquets manquent dans cette sauvegarde.");
  }
  return backup;
}
