"use client";

import {
  ArchiveRestore,
  ArrowLeft,
  BarChart3,
  BookOpen,
  Brain,
  Check,
  ChevronRight,
  Clock3,
  Copy,
  Download,
  Flame,
  Gauge,
  Home,
  Import,
  Info,
  Lightbulb,
  Medal,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  Sparkles,
  Star,
  Target,
  Trophy,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { Rating } from "ts-fsrs";
import { validateBackup } from "./backup";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  chatGptPrompt,
  resolveImageUrl,
  type Deck,
  type LearningCard,
} from "./data";
import {
  createBackup,
  db,
  importDeckPackage,
  isDue,
  logSprintAnswer,
  restoreBackup,
  scheduleReview,
  seedDatabase,
  validateDeckPackage,
  type ReviewState,
  type SessionRecord,
} from "./storage";

type Tab = "home" | "decks" | "import" | "stats";
type StudyMode = "review" | "sprint";

const normalize = (value: string) =>
  value
    .toLocaleLowerCase("fr")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’']/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function seededShuffle<T>(values: T[], seed: string) {
  const clone = [...values];
  let hash = Array.from(seed).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  for (let i = clone.length - 1; i > 0; i -= 1) {
    hash = (hash * 9301 + 49297) % 233280;
    const j = Math.floor((hash / 233280) * (i + 1));
    [clone[i], clone[j]] = [clone[j], clone[i]];
  }
  return clone;
}

function formatNextReview(date: Date | string) {
  const due = new Date(date);
  const diff = due.getTime() - Date.now();
  if (diff <= 60_000) return "à revoir maintenant";
  if (diff < 3_600_000) return `dans ${Math.ceil(diff / 60_000)} min`;
  if (diff < 86_400_000) return `dans ${Math.ceil(diff / 3_600_000)} h`;
  return `dans ${Math.ceil(diff / 86_400_000)} j`;
}

function useAppData(refreshToken: number) {
  const [data, setData] = useState<{
    decks: Deck[];
    cards: LearningCard[];
    states: ReviewState[];
    sessions: SessionRecord[];
  }>({ decks: [], cards: [], states: [], sessions: [] });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      await seedDatabase();
      const [decks, cards, states, sessions] = await Promise.all([
        db.decks.toArray(),
        db.cards.toArray(),
        db.reviewStates.toArray(),
        db.sessions.orderBy("startedAt").reverse().toArray(),
      ]);
      if (active) {
        setData({ decks, cards, states, sessions });
        setReady(true);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [refreshToken]);

  return { ...data, ready };
}

export default function MemoQuestApp() {
  const [tab, setTab] = useState<Tab>("home");
  const [refreshToken, setRefreshToken] = useState(0);
  const { decks, cards, states, sessions, ready } = useAppData(refreshToken);
  const stateMap = useMemo(
    () => new Map(states.map((state) => [state.cardId, state])),
    [states],
  );

  const [studyMode, setStudyMode] = useState<StudyMode | null>(null);
  const [studyDeckId, setStudyDeckId] = useState<string | undefined>();
  const [queue, setQueue] = useState<LearningCard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [answered, setAnswered] = useState(false);
  const [wasCorrect, setWasCorrect] = useState(false);
  const [usedHint, setUsedHint] = useState(false);
  const [combo, setCombo] = useState(0);
  const [score, setScore] = useState(0);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [sessionStartedAt, setSessionStartedAt] = useState<Date | null>(null);
  const [timeLeft, setTimeLeft] = useState(60);
  const [sessionDone, setSessionDone] = useState(false);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [editingCard, setEditingCard] = useState<LearningCard | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const sprintDeadline = useRef<number | null>(null);
  const scoreRef = useRef(0);
  const correctRef = useRef(0);
  const attemptedRef = useRef(0);
  const finishingRef = useRef(false);

  const flash = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2600);
  }, []);

  useEffect(() => {
    if (studyMode !== "sprint" || sessionDone || !sprintDeadline.current) return;
    const timer = window.setInterval(() => {
      const remaining = Math.max(
        0,
        Math.ceil((sprintDeadline.current! - Date.now()) / 1000),
      );
      setTimeLeft(remaining);
    }, 250);
    return () => window.clearInterval(timer);
  }, [studyMode, sessionDone]);

  const dueCount = useMemo(
    () => cards.filter((card) => isDue(stateMap.get(card.id))).length,
    [cards, stateMap],
  );
  const reviewedCount = states.length;
  const totalCorrect = states.reduce((sum, item) => sum + item.totalCorrect, 0);
  const totalWrong = states.reduce((sum, item) => sum + item.totalWrong, 0);
  const accuracy =
    totalCorrect + totalWrong > 0
      ? Math.round((totalCorrect / (totalCorrect + totalWrong)) * 100)
      : 0;
  const bestSprint = sessions
    .filter((session) => session.mode === "sprint")
    .reduce((best, session) => Math.max(best, session.score), 0);
  const xp = totalCorrect * 100;
  const level = Math.floor(xp / 1000) + 1;

  const currentCard = queue[currentIndex];
  const currentState = currentCard ? stateMap.get(currentCard.id) : undefined;
  const typedMode =
    studyMode === "review" && (currentState?.correctStreak ?? 0) >= 2;

  const choices = useMemo(() => {
    if (!currentCard) return [];
    const sameDeck = cards
      .filter(
        (card) =>
          card.deckId === currentCard.deckId && card.id !== currentCard.id,
      )
      .map((card) => card.answer);
    return seededShuffle(
      [currentCard.answer, ...seededShuffle(sameDeck, currentCard.id).slice(0, 3)],
      `${currentCard.id}-choices`,
    );
  }, [cards, currentCard]);

  const resetQuestion = () => {
    setAnswer("");
    setAnswered(false);
    setWasCorrect(false);
    setUsedHint(false);
  };

  const buildQueue = (mode: StudyMode, deckId?: string) => {
    const pool = cards.filter((card) => !deckId || card.deckId === deckId);
    if (mode === "sprint") {
      return seededShuffle(pool, `${Date.now()}`).slice(0, 60);
    }
    const dueExisting = pool.filter(
      (card) => stateMap.has(card.id) && isDue(stateMap.get(card.id)),
    );
    const newCards = pool
      .filter((card) => !stateMap.has(card.id))
      .slice(0, 10);
    return [...dueExisting, ...newCards];
  };

  const startStudy = (mode: StudyMode, deckId?: string) => {
    const nextQueue = buildQueue(mode, deckId);
    if (!nextQueue.length) {
      flash("Rien n’est dû ici. Un sprint reste toujours disponible !");
      return;
    }
    setStudyMode(mode);
    setStudyDeckId(deckId);
    setQueue(nextQueue);
    setCurrentIndex(0);
    setCombo(0);
    setScore(0);
    setSessionCorrect(0);
    scoreRef.current = 0;
    correctRef.current = 0;
    attemptedRef.current = 0;
    finishingRef.current = false;
    setSessionStartedAt(new Date());
    setSessionDone(false);
    setTimeLeft(60);
    sprintDeadline.current = mode === "sprint" ? Date.now() + 60_000 : null;
    resetQuestion();
  };

  const finishSession = useCallback(async () => {
    if (!studyMode || !sessionStartedAt || finishingRef.current) return;
    finishingRef.current = true;
    const record: SessionRecord = {
      startedAt: sessionStartedAt,
      finishedAt: new Date(),
      mode: studyMode,
      deckId: studyDeckId,
      correct: correctRef.current,
      total: attemptedRef.current,
      score: scoreRef.current,
    };
    await db.sessions.add(record);
    setSessionDone(true);
    setRefreshToken((value) => value + 1);
  }, [sessionStartedAt, studyDeckId, studyMode]);

  useEffect(() => {
    if (studyMode === "sprint" && timeLeft === 0 && !sessionDone) {
      void finishSession();
    }
  }, [finishSession, sessionDone, studyMode, timeLeft]);

  const submitAnswer = async (value: string) => {
    if (!currentCard || answered) return;
    const normalized = normalize(value);
    const correct = currentCard.acceptedAnswers.some(
      (accepted) =>
        normalize(accepted) === normalized ||
        normalize(currentCard.answer) === normalized,
    );
    const nextCombo = correct ? combo + 1 : 0;
    const multiplier = Math.min(3, 1 + Math.floor(nextCombo / 3) * 0.5);
    const points = correct ? Math.round(100 * multiplier) : 0;
    attemptedRef.current += 1;
    scoreRef.current += points;
    if (correct) correctRef.current += 1;

    setAnswer(value);
    setWasCorrect(correct);
    setAnswered(true);
    setCombo(nextCombo);
    setScore((valueScore) => valueScore + points);
    if (correct) setSessionCorrect((valueCorrect) => valueCorrect + 1);

    if (studyMode === "sprint") {
      await logSprintAnswer(currentCard, correct, points);
      window.setTimeout(() => {
        if (currentIndex + 1 >= queue.length) {
          void finishSession();
        } else {
          setCurrentIndex((index) => index + 1);
          resetQuestion();
        }
      }, 260);
    }
  };

  const submitTyped = (event: FormEvent) => {
    event.preventDefault();
    if (answer.trim()) void submitAnswer(answer);
  };

  const continueReview = async (easy = false) => {
    if (!currentCard || studyMode !== "review") return;
    const rating = !wasCorrect
      ? Rating.Again
      : easy
        ? Rating.Easy
        : usedHint
          ? Rating.Hard
          : Rating.Good;
    const points = wasCorrect ? Math.round(100 * Math.min(3, 1 + combo * 0.1)) : 0;
    await scheduleReview(currentCard, rating, wasCorrect, points);
    if (currentIndex + 1 >= queue.length) {
      await finishSession();
    } else {
      setCurrentIndex((index) => index + 1);
      resetQuestion();
    }
  };

  const leaveStudy = () => {
    setStudyMode(null);
    setSessionDone(false);
    setQueue([]);
    setRefreshToken((value) => value + 1);
  };

  const goToDeck = (deckId: string) => {
    setSelectedDeckId(deckId);
    setTab("decks");
  };

  if (!ready) {
    return (
      <main className="boot-screen" aria-live="polite">
        <div className="brand-mark large" aria-hidden="true">
          MQ
        </div>
        <div>
          <strong>MémoQuest</strong>
          <p>Préparation de ton terrain d’entraînement…</p>
        </div>
      </main>
    );
  }

  if (studyMode) {
    return (
      <StudyScreen
        mode={studyMode}
        currentCard={currentCard}
        currentIndex={currentIndex}
        total={queue.length}
        choices={choices}
        typedMode={typedMode}
        answer={answer}
        answered={answered}
        wasCorrect={wasCorrect}
        usedHint={usedHint}
        combo={combo}
        score={score}
        timeLeft={timeLeft}
        sessionDone={sessionDone}
        sessionCorrect={sessionCorrect}
        nextReview={
          currentCard && stateMap.get(currentCard.id)
            ? formatNextReview(stateMap.get(currentCard.id)!.fsrsCard.due)
            : undefined
        }
        onBack={leaveStudy}
        onAnswerChange={setAnswer}
        onSubmitTyped={submitTyped}
        onChoose={(choice) => void submitAnswer(choice)}
        onHint={() => setUsedHint(true)}
        onContinue={(easy) => void continueReview(easy)}
        onRestart={() => startStudy(studyMode, studyDeckId)}
      />
    );
  }

  return (
    <div className="app-shell">
      <Sidebar
        tab={tab}
        level={level}
        xp={xp}
        onNavigate={(nextTab) => {
          setTab(nextTab);
          if (nextTab !== "decks") setSelectedDeckId(null);
        }}
      />

      <main className="main-area">
        <Topbar level={level} xp={xp} />
        {tab === "home" && (
          <Dashboard
            dueCount={dueCount}
            reviewedCount={reviewedCount}
            totalCards={cards.length}
            accuracy={accuracy}
            level={level}
            xp={xp}
            bestSprint={bestSprint}
            decks={decks}
            states={states}
            onReview={() => startStudy("review")}
            onSprint={() => startStudy("sprint")}
            onDeck={goToDeck}
          />
        )}
        {tab === "decks" && (
          <DeckLibrary
            decks={decks}
            cards={cards}
            states={states}
            selectedDeckId={selectedDeckId}
            onSelectDeck={setSelectedDeckId}
            onReview={(id) => startStudy("review", id)}
            onSprint={(id) => startStudy("sprint", id)}
            onEdit={setEditingCard}
            onRefresh={() => setRefreshToken((value) => value + 1)}
            flash={flash}
          />
        )}
        {tab === "import" && (
          <ImportCenter
            flash={flash}
            onImported={() => {
              setRefreshToken((value) => value + 1);
              setTab("decks");
            }}
          />
        )}
        {tab === "stats" && (
          <StatsView
            sessions={sessions}
            reviewedCount={reviewedCount}
            totalCards={cards.length}
            accuracy={accuracy}
            totalCorrect={totalCorrect}
            totalWrong={totalWrong}
            bestSprint={bestSprint}
            level={level}
          />
        )}
      </main>

      <MobileNav tab={tab} onNavigate={setTab} />
      {editingCard && (
        <CardEditor
          card={editingCard}
          onClose={() => setEditingCard(null)}
          onSaved={() => {
            setEditingCard(null);
            setRefreshToken((value) => value + 1);
            flash("Carte mise à jour");
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={18} /> {toast}
        </div>
      )}
    </div>
  );
}

function Sidebar({
  tab,
  level,
  xp,
  onNavigate,
}: {
  tab: Tab;
  level: number;
  xp: number;
  onNavigate: (tab: Tab) => void;
}) {
  const items = [
    ["home", Home, "Aujourd’hui"],
    ["decks", BookOpen, "Mes parcours"],
    ["import", Import, "Créer & importer"],
    ["stats", BarChart3, "Progression"],
  ] as const;

  return (
    <aside className="sidebar">
      <button className="brand" onClick={() => onNavigate("home")}>
        <span className="brand-mark">MQ</span>
        <span>
          <strong>MémoQuest</strong>
          <small>Apprendre autrement</small>
        </span>
      </button>
      <nav aria-label="Navigation principale">
        <p className="nav-label">Ton espace</p>
        {items.map(([id, Icon, label]) => (
          <button
            key={id}
            className={tab === id ? "nav-item active" : "nav-item"}
            onClick={() => onNavigate(id)}
          >
            <Icon size={19} strokeWidth={2.2} />
            <span>{label}</span>
            {id === "home" && <span className="nav-dot" />}
          </button>
        ))}
      </nav>
      <div className="sidebar-spacer" />
      <div className="level-card">
        <div className="level-icon">
          <Trophy size={20} />
        </div>
        <div className="level-copy">
          <span>Niveau {level}</span>
          <small>{xp % 1000} / 1 000 XP</small>
        </div>
        <div className="mini-progress">
          <i style={{ width: `${(xp % 1000) / 10}%` }} />
        </div>
      </div>
      <div className="privacy-note">
        <span className="offline-dot" />
        Données gardées sur cet appareil
      </div>
    </aside>
  );
}

function Topbar({ level, xp }: { level: number; xp: number }) {
  return (
    <header className="topbar">
      <div className="mobile-brand">
        <span className="brand-mark small">MQ</span>
        <strong>MémoQuest</strong>
      </div>
      <div className="topbar-spacer" />
      <div className="streak-pill" title="Série actuelle">
        <Flame size={17} fill="currentColor" /> 1 jour
      </div>
      <div className="xp-pill" title={`Niveau ${level}`}>
        <Star size={16} fill="currentColor" /> {xp.toLocaleString("fr-FR")} XP
      </div>
      <button className="avatar" aria-label="Profil local">
        A
      </button>
    </header>
  );
}

function Dashboard({
  dueCount,
  reviewedCount,
  totalCards,
  accuracy,
  level,
  xp,
  bestSprint,
  decks,
  states,
  onReview,
  onSprint,
  onDeck,
}: {
  dueCount: number;
  reviewedCount: number;
  totalCards: number;
  accuracy: number;
  level: number;
  xp: number;
  bestSprint: number;
  decks: Deck[];
  states: ReviewState[];
  onReview: () => void;
  onSprint: () => void;
  onDeck: (id: string) => void;
}) {
  const progress = Math.min(100, Math.round((reviewedCount / totalCards) * 100));
  const today = new Date().toDateString();
  const reviewedToday = states.filter(state => state.lastReviewedAt && new Date(state.lastReviewedAt).toDateString() === today).length;
  return (
    <div className="page-content">
      <section className="welcome-row">
        <div>
          <p className="eyebrow">{new Date().toLocaleDateString("fr-FR", { weekday: "long" }).toLocaleUpperCase("fr-FR")} · TA PROGRESSION</p>
          <h1>Prêt à faire grandir ta mémoire ?</h1>
          <p>Quelques minutes aujourd’hui, des connaissances pour longtemps.</p>
        </div>
        <div className="daily-badge">
          <Sparkles size={18} />
          Objectif du jour
          <strong>{Math.min(10, reviewedToday)} / 10</strong>
        </div>
      </section>

      <section className="mission-card">
        <div className="mission-copy">
          <span className="mission-kicker">
            <Target size={16} /> MISSION DU JOUR
          </span>
          <h2>{dueCount > 0 ? `${Math.min(dueCount, 10)} cartes t’attendent` : "Tout est à jour !"}</h2>
          <p>
            {dueCount > 0
              ? "Une session courte, ciblée par ta mémoire. Pas de temps perdu sur ce que tu sais déjà."
              : "Ta prochaine révision arrivera au bon moment. Tu peux lancer un sprint pour le plaisir."}
          </p>
          <div className="mission-actions">
            <button className="primary-button" onClick={onReview}>
              <Play size={18} fill="currentColor" />
              Commencer la révision
            </button>
            <span className="duration">
              <Clock3 size={16} /> environ 5 min
            </span>
          </div>
        </div>
        <div className="mission-visual">
          <div
            className="progress-orbit"
            style={{ "--progress": `${Math.max(8, progress)}%` } as React.CSSProperties}
          >
            <div>
              <Brain size={35} />
              <strong>{progress}%</strong>
              <span>exploré</span>
            </div>
          </div>
          <span className="orbit-star one">✦</span>
          <span className="orbit-star two">✦</span>
          <span className="orbit-star three">✦</span>
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <span className="eyebrow">TES PARCOURS</span>
            <h2>Choisis ton terrain de jeu</h2>
          </div>
          <button className="text-button" onClick={() => onDeck(decks[0]?.id)}>
            Voir tous <ChevronRight size={16} />
          </button>
        </div>
        <div className="deck-grid">
          {decks.map((deck) => {
            const mastered = states.filter(
              (state) =>
                state.cardId.startsWith(`${deck.id}-`) &&
                state.correctStreak >= 2,
            ).length;
            const deckProgress = Math.round((mastered / deck.cardCount) * 100);
            return (
              <button
                key={deck.id}
                className="deck-card"
                style={
                  {
                    "--accent": deck.accent,
                    "--soft": deck.soft,
                  } as React.CSSProperties
                }
                onClick={() => onDeck(deck.id)}
              >
                <span className="deck-icon">{deck.icon}</span>
                <span className="deck-count">{deck.cardCount} cartes</span>
                <strong>{deck.title}</strong>
                <small>{deck.subtitle}</small>
                <span className="deck-progress">
                  <i style={{ width: `${Math.max(3, deckProgress)}%` }} />
                </span>
                <span className="deck-footer">
                  {deckProgress}% maîtrisé <ChevronRight size={17} />
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="two-column">
        <div className="sprint-card">
          <div className="sprint-icon">
            <Zap size={25} fill="currentColor" />
          </div>
          <div>
            <span className="eyebrow">DÉFI EXPRESS</span>
            <h2>Sprint 60 secondes</h2>
            <p>Enchaîne les réponses, construis ton combo et bats ton record.</p>
            <button className="dark-button" onClick={onSprint}>
              Lancer le sprint <ChevronRight size={17} />
            </button>
          </div>
          <div className="record-bubble">
            <Trophy size={18} />
            <span>Record</span>
            <strong>{bestSprint || "—"}</strong>
          </div>
        </div>
        <div className="stats-strip">
          <div>
            <span className="stat-icon violet">
              <Gauge size={20} />
            </span>
            <small>Précision</small>
            <strong>{accuracy || "—"}{accuracy ? "%" : ""}</strong>
          </div>
          <div>
            <span className="stat-icon green">
              <Check size={20} />
            </span>
            <small>Cartes vues</small>
            <strong>{reviewedCount}</strong>
          </div>
          <div>
            <span className="stat-icon amber">
              <Medal size={20} />
            </span>
            <small>Niveau</small>
            <strong>{level}</strong>
          </div>
          <div>
            <span className="stat-icon blue">
              <Star size={20} />
            </span>
            <small>Expérience</small>
            <strong>{xp}</strong>
          </div>
        </div>
      </section>
    </div>
  );
}

function DeckLibrary({
  decks,
  cards,
  states,
  selectedDeckId,
  onSelectDeck,
  onReview,
  onSprint,
  onEdit,
  onRefresh,
  flash,
}: {
  decks: Deck[];
  cards: LearningCard[];
  states: ReviewState[];
  selectedDeckId: string | null;
  onSelectDeck: (id: string | null) => void;
  onReview: (id: string) => void;
  onSprint: (id: string) => void;
  onEdit: (card: LearningCard) => void;
  onRefresh: () => void;
  flash: (message: string) => void;
}) {
  const [query, setQuery] = useState("");
  const selectedDeck = decks.find((deck) => deck.id === selectedDeckId);
  const deckCards = cards.filter((card) => card.deckId === selectedDeckId);
  const filteredCards = deckCards.filter((card) =>
    `${card.prompt} ${card.answer}`.toLowerCase().includes(query.toLowerCase()),
  );

  const addCard = async () => {
    if (!selectedDeck) return;
    const id = `${selectedDeck.id}-${crypto.randomUUID().slice(0, 8)}`;
    const card: LearningCard = {
      id,
      deckId: selectedDeck.id,
      kind: "text",
      prompt: "Nouvelle question",
      answer: "Nouvelle réponse",
      acceptedAnswers: ["Nouvelle réponse"],
      clue: "",
      explanation: "",
      emoji: "✨",
      tags: ["personnel"],
    };
    await db.cards.add(card);
    await db.decks.update(selectedDeck.id, { cardCount: selectedDeck.cardCount + 1 });
    onRefresh();
    onEdit(card);
  };

  if (selectedDeck) {
    const mastered = states.filter(
      (state) =>
        state.cardId.startsWith(`${selectedDeck.id}-`) &&
        state.correctStreak >= 2,
    ).length;
    return (
      <div className="page-content deck-detail">
        <button className="back-link" onClick={() => onSelectDeck(null)}>
          <ArrowLeft size={17} /> Tous les parcours
        </button>
        <section
          className="deck-hero"
          style={
            {
              "--accent": selectedDeck.accent,
              "--soft": selectedDeck.soft,
            } as React.CSSProperties
          }
        >
          <div className="big-deck-icon">{selectedDeck.icon}</div>
          <div className="deck-hero-copy">
            <span className="eyebrow">PARCOURS PERSONNEL</span>
            <h1>{selectedDeck.title}</h1>
            <p>{selectedDeck.subtitle}</p>
            <div className="deck-hero-meta">
              <span>{deckCards.length} cartes</span>
              <span>{mastered} maîtrisées</span>
              <span>{Math.round((mastered / Math.max(1, deckCards.length)) * 100)}% accompli</span>
            </div>
          </div>
          <div className="deck-hero-actions">
            <button className="primary-button" onClick={() => onReview(selectedDeck.id)}>
              <Play size={18} fill="currentColor" /> Réviser
            </button>
            <button className="secondary-button" onClick={() => onSprint(selectedDeck.id)}>
              <Zap size={18} /> Sprint
            </button>
          </div>
        </section>
        <section className="cards-manager">
          <div className="manager-heading">
            <div>
              <span className="eyebrow">CONTENU DU PARCOURS</span>
              <h2>Cartes et réponses</h2>
            </div>
            <button className="secondary-button compact" onClick={() => void addCard()}>
              <Plus size={17} /> Ajouter
            </button>
          </div>
          <label className="search-box">
            <Search size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher une carte…"
            />
          </label>
          <div className="card-list">
            {filteredCards.map((card) => (
              <button key={card.id} className="card-row" onClick={() => onEdit(card)}>
                <span className="card-emoji">{card.emoji ?? "✨"}</span>
                <span className="card-row-copy">
                  <strong>{card.prompt}</strong>
                  <small>{card.answer}</small>
                </span>
                {!card.source && (
                  <span className="unsourced" title="Source non renseignée">
                    <Info size={14} /> Non sourcée
                  </span>
                )}
                <Pencil size={17} />
              </button>
            ))}
          </div>
          {!filteredCards.length && (
            <div className="empty-state">
              <Search size={28} />
              <strong>Aucune carte trouvée</strong>
              <p>Essaie un autre mot ou ajoute une nouvelle carte.</p>
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="page-content">
      <section className="page-heading">
        <div>
          <span className="eyebrow">BIBLIOTHÈQUE</span>
          <h1>Tes parcours d’apprentissage</h1>
          <p>Chaque parcours avance à son rythme, selon ce que ta mémoire te demande.</p>
        </div>
        <button
          className="secondary-button"
          onClick={() => {
            navigator.clipboard.writeText(chatGptPrompt).then(
              () => flash("Prompt ChatGPT copié"),
              () => flash("Le prompt est disponible dans Créer & importer"),
            );
          }}
        >
          <Sparkles size={18} /> Créer avec ChatGPT
        </button>
      </section>
      <div className="library-grid">
        {decks.map((deck) => {
          const deckStates = states.filter((state) =>
            state.cardId.startsWith(`${deck.id}-`),
          );
          const mastered = deckStates.filter((state) => state.correctStreak >= 2).length;
          return (
            <article
              key={deck.id}
              className="library-card"
              style={
                {
                  "--accent": deck.accent,
                  "--soft": deck.soft,
                } as React.CSSProperties
              }
            >
              <div className="library-card-top">
                <span className="deck-icon">{deck.icon}</span>
                <span className="status-chip">{deck.id.length > 8 ? "Personnel" : "Inclus"}</span>
              </div>
              <h2>{deck.title}</h2>
              <p>{deck.subtitle}</p>
              <div className="library-numbers">
                <span><strong>{deck.cardCount}</strong> cartes</span>
                <span><strong>{mastered}</strong> maîtrisées</span>
              </div>
              <span className="deck-progress wide">
                <i style={{ width: `${Math.max(2, (mastered / Math.max(1, deck.cardCount)) * 100)}%` }} />
              </span>
              <div className="library-actions">
                <button className="secondary-button compact" onClick={() => onSelectDeck(deck.id)}>
                  Voir le contenu
                </button>
                <button className="round-play" onClick={() => onReview(deck.id)} aria-label={`Réviser ${deck.title}`}>
                  <Play size={18} fill="currentColor" />
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function StudyScreen({
  mode,
  currentCard,
  currentIndex,
  total,
  choices,
  typedMode,
  answer,
  answered,
  wasCorrect,
  usedHint,
  combo,
  score,
  timeLeft,
  sessionDone,
  sessionCorrect,
  onBack,
  onAnswerChange,
  onSubmitTyped,
  onChoose,
  onHint,
  onContinue,
  onRestart,
}: {
  mode: StudyMode;
  currentCard?: LearningCard;
  currentIndex: number;
  total: number;
  choices: string[];
  typedMode: boolean;
  answer: string;
  answered: boolean;
  wasCorrect: boolean;
  usedHint: boolean;
  combo: number;
  score: number;
  timeLeft: number;
  sessionDone: boolean;
  sessionCorrect: number;
  nextReview?: string;
  onBack: () => void;
  onAnswerChange: (value: string) => void;
  onSubmitTyped: (event: FormEvent) => void;
  onChoose: (value: string) => void;
  onHint: () => void;
  onContinue: (easy: boolean) => void;
  onRestart: () => void;
}) {
  if (sessionDone || !currentCard) {
    const attempted = Math.max(currentIndex + 1, sessionCorrect);
    return (
      <main className="study-shell complete-screen">
        <div className="confetti" aria-hidden="true">✦</div>
        <div className="completion-medal">
          <Trophy size={42} />
        </div>
        <span className="eyebrow">SESSION TERMINÉE</span>
        <h1>{mode === "sprint" ? "Sprint bouclé !" : "Mission accomplie !"}</h1>
        <p>
          Tu as renforcé {sessionCorrect} souvenir{sessionCorrect > 1 ? "s" : ""}.
          La régularité fait le reste.
        </p>
        <div className="completion-stats">
          <div><strong>{sessionCorrect}</strong><span>bonnes réponses</span></div>
          <div><strong>{attempted ? Math.round((sessionCorrect / attempted) * 100) : 0}%</strong><span>précision</span></div>
          <div><strong>{score}</strong><span>points</span></div>
        </div>
        <div className="completion-actions">
          <button className="secondary-button" onClick={onBack}>Retour à l’accueil</button>
          <button className="primary-button" onClick={onRestart}>
            <RotateCcw size={18} /> Recommencer
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="study-shell">
      <header className="study-header">
        <button className="icon-button" onClick={onBack} aria-label="Quitter la session">
          <X size={21} />
        </button>
        <div className="study-progress-wrap">
          <span>{mode === "sprint" ? "SPRINT EXPRESS" : "RÉVISION ADAPTATIVE"}</span>
          <div className="study-progress">
            <i style={{ width: `${((currentIndex + 1) / total) * 100}%` }} />
          </div>
        </div>
        {mode === "sprint" ? (
          <div className={timeLeft <= 10 ? "timer urgent" : "timer"}>
            <Clock3 size={18} /> {timeLeft}s
          </div>
        ) : (
          <div className="question-count">{currentIndex + 1} / {total}</div>
        )}
      </header>

      <section className="study-card">
        <div className="study-score-row">
          <span className="mode-chip">
            {typedMode ? <Pencil size={14} /> : <Target size={14} />}
            {typedMode ? "Rappel libre" : "Reconnaissance"}
          </span>
          <span className="combo-chip">
            <Flame size={15} fill="currentColor" /> Combo {combo}
          </span>
          <strong className="live-score">{score} pts</strong>
        </div>

        <div className="question-area">
          {currentCard.kind === "image" && (
            <div className="species-image">
              <span className="species-fallback">{currentCard.emoji}</span>
              {currentCard.image && (
                <img
                  key={currentCard.image}
                  src={resolveImageUrl(currentCard.image)}
                  alt="Photographie à identifier"
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                  }}
                />
              )}
            </div>
          )}
          {currentCard.kind !== "image" && (
            <div className="question-symbol" aria-hidden="true">
              {currentCard.kind === "number"
                ? currentCard.prompt.match(/\d{2}/)?.[0]
                : currentCard.emoji}
            </div>
          )}
          {currentCard.kind === "image" && <a className="photo-credit" href="/aide.html#credits" target="_blank" rel="noreferrer">Crédits photo · Internet nécessaire</a>}
          <span className="eyebrow">QUESTION {currentIndex + 1}</span>
          <h1>{currentCard.prompt}</h1>
          {!answered && (
            <button
              className={usedHint ? "hint-button active" : "hint-button"}
              onClick={onHint}
            >
              <Lightbulb size={17} />
              {usedHint ? currentCard.clue : "Afficher un indice"}
            </button>
          )}
        </div>

        {!answered && typedMode ? (
          <form className="typed-form" onSubmit={onSubmitTyped}>
            <label htmlFor="typed-answer">Ta réponse</label>
            <div>
              <input
                id="typed-answer"
                value={answer}
                autoFocus
                autoComplete="off"
                onChange={(event) => onAnswerChange(event.target.value)}
                placeholder="Écris ce dont tu te souviens…"
              />
              <button className="primary-button" type="submit" disabled={!answer.trim()}>
                Valider
              </button>
            </div>
          </form>
        ) : !answered ? (
          <div className="choice-grid">
            {choices.map((choice, index) => (
              <button key={choice} className="choice-button" onClick={() => onChoose(choice)}>
                <span>{String.fromCharCode(65 + index)}</span>
                {choice}
              </button>
            ))}
          </div>
        ) : (
          <div className={wasCorrect ? "feedback correct" : "feedback wrong"} role="status">
            <div className="feedback-title">
              <span>{wasCorrect ? <Check size={21} /> : <X size={21} />}</span>
              <div>
                <strong>{wasCorrect ? "Bien joué !" : "Pas encore — et c’est utile."}</strong>
                <p>La bonne réponse est <b>{currentCard.answer}</b>.</p>
              </div>
            </div>
            <div className="explanation">
              <Info size={18} />
              <p>{currentCard.explanation}</p>
            </div>
            {mode === "review" && (
              <div className="feedback-actions">
                {wasCorrect && (
                  <button className="secondary-button" onClick={() => onContinue(true)}>
                    Trop facile
                  </button>
                )}
                <button className="primary-button" onClick={() => onContinue(false)}>
                  Continuer <ChevronRight size={17} />
                </button>
              </div>
            )}
          </div>
        )}
      </section>
      <p className="study-footnote">
        <Brain size={15} /> Les points récompensent le jeu ; l’algorithme choisit séparément le bon moment pour revoir la carte.
      </p>
    </main>
  );
}

function ImportCenter({
  flash,
  onImported,
}: {
  flash: (message: string) => void;
  onImported: () => void;
}) {
  const [json, setJson] = useState("");
  const [preview, setPreview] = useState<ReturnType<typeof validateDeckPackage> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const restoreInput = useRef<HTMLInputElement>(null);

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(chatGptPrompt);
    flash("Prompt copié — colle-le dans ChatGPT");
  };

  const validate = () => {
    try {
      const payload = validateDeckPackage(json);
      setPreview(payload);
      setError(null);
    } catch (caught) {
      setPreview(null);
      setError(caught instanceof Error ? caught.message : "JSON invalide");
    }
  };

  const importNow = async () => {
    if (!preview) return;
    await importDeckPackage(preview);
    flash(`${preview.cards.length} cartes importées`);
    onImported();
  };

  const exportBackup = async () => {
    const backup = await createBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `memoquest-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    flash("Sauvegarde téléchargée");
  };

  const restore = async (file: File) => {
    try {
      if (file.size > 20_000_000) throw new Error("La sauvegarde dépasse la limite de 20 Mo.");
      const raw = await file.text();
      const backup = validateBackup(raw);
      if (!window.confirm(`Restaurer ${backup.cards.length} cartes et leur progression ? Les données actuelles de cet appareil seront remplacées. Exporte-les d’abord si tu veux les conserver.`)) return;
      await restoreBackup(raw);
      setError(null);
      flash("Sauvegarde restaurée");
      onImported();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sauvegarde invalide");
    } finally {
      if (restoreInput.current) restoreInput.current.value = "";
    }
  };

  return (
    <div className="page-content">
      <section className="page-heading">
        <div>
          <span className="eyebrow">ATELIER DE CONTENU</span>
          <h1>Transforme ta curiosité en parcours</h1>
          <p>ChatGPT prépare le brouillon. Tu gardes le contrôle, puis MémoQuest fonctionne sans IA.</p>
        </div>
      </section>

      <div className="import-layout">
        <section className="prompt-card">
          <div className="step-number">1</div>
          <span className="eyebrow">PRÉPARER DANS CHATGPT</span>
          <h2>Génère un paquet structuré</h2>
          <p>
            Copie ce modèle, précise ton sujet et demande à ChatGPT de retourner uniquement le JSON.
          </p>
          <pre>{chatGptPrompt}</pre>
          <button className="primary-button" onClick={() => void copyPrompt()}>
            <Copy size={18} /> Copier le prompt
          </button>
        </section>

        <section className="json-card">
          <div className="step-number">2</div>
          <span className="eyebrow">VÉRIFIER ET IMPORTER</span>
          <h2>Colle le JSON obtenu</h2>
          <textarea
            value={json}
            onChange={(event) => {
              setJson(event.target.value);
              setPreview(null);
              setError(null);
            }}
            placeholder={'{"schemaVersion": 1, "deck": { ... }, "cards": [ ... ]}'}
          />
          {error && <div className="validation-error"><X size={17} /> {error}</div>}
          {preview && (
            <div className="import-preview">
              <div>
                <span className="preview-icon">{preview.deck.icon}</span>
                <span>
                  <strong>{preview.deck.title}</strong>
                  <small>{preview.cards.length} cartes · {preview.cards.filter((card) => !card.source).length} sans source</small>
                </span>
              </div>
              <Check size={20} />
            </div>
          )}
          <div className="json-actions">
            <button className="secondary-button" onClick={validate} disabled={!json.trim()}>
              Vérifier
            </button>
            <button className="primary-button" onClick={() => void importNow()} disabled={!preview}>
              <Upload size={18} /> Importer le parcours
            </button>
          </div>
        </section>
      </div>

      <section className="backup-card">
        <div className="backup-icon"><Settings2 size={22} /></div>
        <div>
          <span className="eyebrow">SAUVEGARDE LOCALE</span>
          <h2>Tes données t’appartiennent</h2>
          <p>Exporte régulièrement cartes, progression, scores et réglages dans un fichier portable.</p>
        </div>
        <div className="backup-actions">
          <button className="secondary-button" onClick={() => void exportBackup()}>
            <Download size={18} /> Exporter
          </button>
          <button className="secondary-button" onClick={() => restoreInput.current?.click()}>
            <ArchiveRestore size={18} /> Restaurer
          </button>
          <input
            ref={restoreInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void restore(file);
            }}
          />
        </div>
      </section>
    </div>
  );
}

function StatsView({
  sessions,
  reviewedCount,
  totalCards,
  accuracy,
  totalCorrect,
  totalWrong,
  bestSprint,
  level,
}: {
  sessions: SessionRecord[];
  reviewedCount: number;
  totalCards: number;
  accuracy: number;
  totalCorrect: number;
  totalWrong: number;
  bestSprint: number;
  level: number;
}) {
  const days = ["L", "M", "M", "J", "V", "S", "D"];
  const bars = [24, 42, 18, 62, 46, 74, sessions.length ? 88 : 8];
  return (
    <div className="page-content">
      <section className="page-heading">
        <div>
          <span className="eyebrow">PROGRESSION</span>
          <h1>Ce que ta mémoire construit</h1>
          <p>Observe les tendances, pas la perfection. La répétition régulière fait la différence.</p>
        </div>
      </section>
      <div className="metrics-grid">
        <Metric icon={<Target />} label="Précision globale" value={accuracy ? `${accuracy}%` : "—"} detail={`${totalCorrect} réussites · ${totalWrong} erreurs utiles`} color="violet" />
        <Metric icon={<BookOpen />} label="Cartes rencontrées" value={`${reviewedCount}`} detail={`sur ${totalCards} disponibles`} color="green" />
        <Metric icon={<Trophy />} label="Record sprint" value={bestSprint ? `${bestSprint}` : "—"} detail="points en 60 secondes" color="amber" />
        <Metric icon={<Medal />} label="Niveau actuel" value={`${level}`} detail="continue pour débloquer le suivant" color="blue" />
      </div>
      <div className="stats-layout">
        <section className="chart-card">
          <div className="section-heading">
            <div><span className="eyebrow">7 DERNIERS JOURS</span><h2>Rythme d’apprentissage</h2></div>
            <span className="status-chip">{sessions.length} sessions</span>
          </div>
          <div className="bar-chart" aria-label="Activité des sept derniers jours">
            {bars.map((height, index) => (
              <div key={`${days[index]}-${index}`}>
                <span style={{ height: `${height}%` }} />
                <small>{days[index]}</small>
              </div>
            ))}
          </div>
        </section>
        <section className="achievements-card">
          <span className="eyebrow">BADGES</span>
          <h2>Petites victoires</h2>
          <div className="achievement-list">
            <Achievement icon="🌱" title="Premier pas" detail="Première carte étudiée" unlocked={reviewedCount > 0} />
            <Achievement icon="🎯" title="Œil de lynx" detail="80 % de précision" unlocked={accuracy >= 80} />
            <Achievement icon="⚡" title="Éclair" detail="Premier sprint terminé" unlocked={bestSprint > 0} />
            <Achievement icon="🧠" title="Mémoire vive" detail="50 cartes rencontrées" unlocked={reviewedCount >= 50} />
          </div>
        </section>
      </div>
      <section className="history-card">
        <span className="eyebrow">SESSIONS RÉCENTES</span>
        <h2>Ton journal d’entraînement</h2>
        {sessions.slice(0, 8).map((session) => (
          <div className="session-row" key={`${session.startedAt}-${session.id}`}>
            <span className={session.mode === "sprint" ? "session-icon sprint" : "session-icon"}>
              {session.mode === "sprint" ? <Zap size={18} /> : <Brain size={18} />}
            </span>
            <span>
              <strong>{session.mode === "sprint" ? "Sprint express" : "Révision adaptative"}</strong>
              <small>{new Date(session.startedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</small>
            </span>
            <b>{session.correct} bonnes</b>
            <strong>{session.score} pts</strong>
          </div>
        ))}
        {!sessions.length && (
          <div className="empty-state small">
            <Brain size={27} />
            <strong>Ton histoire commence maintenant</strong>
            <p>Termine une première session pour voir ta progression.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function Metric({ icon, label, value, detail, color }: { icon: React.ReactNode; label: string; value: string; detail: string; color: string }) {
  return (
    <div className="metric-card">
      <span className={`metric-icon ${color}`}>{icon}</span>
      <small>{label}</small>
      <strong>{value}</strong>
      <p>{detail}</p>
    </div>
  );
}

function Achievement({ icon, title, detail, unlocked }: { icon: string; title: string; detail: string; unlocked: boolean }) {
  return (
    <div className={unlocked ? "achievement unlocked" : "achievement"}>
      <span>{icon}</span>
      <div><strong>{title}</strong><small>{detail}</small></div>
      {unlocked ? <Check size={17} /> : <span className="lock-dot" />}
    </div>
  );
}

function CardEditor({
  card,
  onClose,
  onSaved,
}: {
  card: LearningCard;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState(card);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    await db.cards.put({
      ...draft,
      acceptedAnswers: Array.from(
        new Set([draft.answer, ...draft.acceptedAnswers.filter(Boolean)]),
      ),
    });
    onSaved();
  };
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="editor-modal" onSubmit={save} onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <div><span className="eyebrow">ÉDITEUR DE CARTE</span><h2>Affiner le souvenir</h2></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fermer"><X size={20} /></button>
        </div>
        <label>Question<input value={draft.prompt} onChange={(event) => setDraft({ ...draft, prompt: event.target.value })} /></label>
        <label>Réponse<input value={draft.answer} onChange={(event) => setDraft({ ...draft, answer: event.target.value })} /></label>
        <label>Indice<textarea value={draft.clue} onChange={(event) => setDraft({ ...draft, clue: event.target.value })} /></label>
        <label>Explication<textarea value={draft.explanation} onChange={(event) => setDraft({ ...draft, explanation: event.target.value })} /></label>
        <label>Source facultative<input type="url" value={draft.source ?? ""} onChange={(event) => setDraft({ ...draft, source: event.target.value || undefined })} placeholder="https://…" /></label>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Annuler</button>
          <button className="primary-button" type="submit"><Check size={18} /> Enregistrer</button>
        </div>
      </form>
    </div>
  );
}

function MobileNav({ tab, onNavigate }: { tab: Tab; onNavigate: (tab: Tab) => void }) {
  const items = [
    ["home", Home, "Accueil"],
    ["decks", BookOpen, "Parcours"],
    ["import", Plus, "Créer"],
    ["stats", BarChart3, "Progrès"],
  ] as const;
  return (
    <nav className="mobile-nav" aria-label="Navigation mobile">
      {items.map(([id, Icon, label]) => (
        <button key={id} className={tab === id ? "active" : ""} onClick={() => onNavigate(id)}>
          <Icon size={20} /><span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
