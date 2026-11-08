import mediaCredits from "../public/media-credits.json";

export type CardKind = "image" | "text" | "number";

export type LearningCard = {
  id: string;
  deckId: string;
  kind: CardKind;
  prompt: string;
  answer: string;
  acceptedAnswers: string[];
  clue: string;
  explanation: string;
  emoji?: string;
  image?: string;
  source?: string;
  tags: string[];
};

export type Deck = {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  accent: string;
  soft: string;
  cardCount: number;
};

export const decks: Deck[] = [
  {
    id: "nature",
    title: "Nature de France",
    subtitle: "Reconnaître le vivant autour de soi",
    icon: "🌿",
    accent: "#16785b",
    soft: "#dff4e9",
    cardCount: 20,
  },
  {
    id: "major",
    title: "Système majeur",
    subtitle: "00 à 99, du nombre à l’image",
    icon: "🧠",
    accent: "#6656d9",
    soft: "#e9e6ff",
    cardCount: 100,
  },
  {
    id: "science",
    title: "Sciences essentielles",
    subtitle: "Comprendre les idées qui changent le monde",
    icon: "⚗️",
    accent: "#1973b8",
    soft: "#ddecfa",
    cardCount: 20,
  },
  {
    id: "history",
    title: "Grands repères",
    subtitle: "Relier les dates, les causes et les effets",
    icon: "🏛️",
    accent: "#c05b32",
    soft: "#f8e4d7",
    cardCount: 20,
  },
];

const natureSeeds = [
  ["Chêne pédonculé", "Quercus robur", "🌳", "Quercus robur.jpg", "Feuilles lobées et glands portés par un long pédoncule.", "arbre"],
  ["Hêtre commun", "Fagus sylvatica", "🌳", "Fagus sylvatica.jpg", "Écorce lisse et grise, feuilles ovales au bord légèrement ondulé.", "arbre"],
  ["Bouleau verruqueux", "Betula pendula", "🌲", "Betula pendula.jpg", "Tronc blanc marqué de noir et fins rameaux retombants.", "arbre"],
  ["Érable sycomore", "Acer pseudoplatanus", "🍁", "Acer pseudoplatanus.jpg", "Grandes feuilles à cinq lobes et samares en hélice.", "arbre"],
  ["Châtaignier", "Castanea sativa", "🌰", "Castanea sativa.jpg", "Longues feuilles dentées et bogues très épineuses.", "arbre"],
  ["Pin sylvestre", "Pinus sylvestris", "🌲", "Pinus sylvestris.jpg", "Écorce orangée en hauteur et aiguilles groupées par deux.", "arbre"],
  ["If commun", "Taxus baccata", "🌲", "Taxus baccata.jpg", "Aiguilles souples et arilles rouges ; presque toute la plante est toxique.", "arbre"],
  ["Houx", "Ilex aquifolium", "🍃", "Ilex aquifolium.jpg", "Feuilles persistantes luisantes et baies rouges.", "plante"],
  ["Lierre grimpant", "Hedera helix", "🍃", "Hedera helix.jpg", "Plante grimpante persistante aux feuilles souvent lobées.", "plante"],
  ["Grande ortie", "Urtica dioica", "🌿", "Urtica dioica.jpg", "Feuilles opposées, dentées, couvertes de poils urticants.", "plante"],
  ["Pissenlit", "Taraxacum officinale", "🌼", "Taraxacum officinale.jpg", "Capitule jaune puis boule de graines plumeuses.", "plante"],
  ["Pâquerette", "Bellis perennis", "🌼", "Bellis perennis.jpg", "Petit cœur jaune entouré de ligules blanches parfois rosées.", "plante"],
  ["Coquelicot", "Papaver rhoeas", "🌺", "Papaver rhoeas.jpg", "Quatre pétales rouges très fins et cœur sombre.", "plante"],
  ["Digitale pourpre", "Digitalis purpurea", "🪻", "Digitalis purpurea.jpg", "Longue grappe de clochettes pourpres tachetées ; plante toxique.", "plante"],
  ["Renard roux", "Vulpes vulpes", "🦊", "Vulpes vulpes.jpg", "Pelage roux, museau fin et longue queue touffue.", "animal"],
  ["Hérisson d’Europe", "Erinaceus europaeus", "🦔", "Erinaceus europaeus.jpg", "Petit mammifère nocturne couvert de piquants.", "animal"],
  ["Écureuil roux", "Sciurus vulgaris", "🐿️", "Sciurus vulgaris.jpg", "Queue en panache et pinceaux de poils aux oreilles en hiver.", "animal"],
  ["Mésange charbonnière", "Parus major", "🐦", "Parus major.jpg", "Tête noire, joues blanches et ventre jaune barré de noir.", "animal"],
  ["Merle noir", "Turdus merula", "🐦‍⬛", "Turdus merula.jpg", "Le mâle est noir avec un bec jaune-orangé.", "animal"],
  ["Abeille domestique", "Apis mellifera", "🐝", "Apis mellifera.jpg", "Corps brun et doré, velu, avec des corbeilles à pollen.", "animal"],
] as const;

const commonsImage = (filename: string) =>
  mediaCredits.find(item => item.originalFilename === filename)?.imageUrl;

// Les sauvegardes v1 conservent leurs URL originales. Corriger uniquement
// l'affichage des photos fournies, sans modifier les cartes ni leur progression.
export const resolveImageUrl = (url: string) =>
  mediaCredits.find(item =>
    url === `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(item.originalFilename)}?width=900`
  )?.imageUrl ?? url;

const natureCards: LearningCard[] = natureSeeds.map(
  ([answer, latin, emoji, filename, explanation, tag], index) => ({
    id: `nature-${index + 1}`,
    deckId: "nature",
    kind: "image",
    prompt: "Quelle espèce reconnais-tu ?",
    answer,
    acceptedAnswers: [answer, latin],
    clue: explanation,
    explanation: `${answer} — ${latin}. ${explanation}`,
    emoji,
    image: commonsImage(filename),
    source: `https://fr.wikipedia.org/wiki/${encodeURIComponent(answer.replaceAll(" ", "_"))}`,
    tags: ["France", tag],
  }),
);

// Une liste concrète et modifiable : chaque mot respecte au mieux les sons du
// système majeur français (0 s/z, 1 t/d, 2 n, 3 m, 4 r, 5 l, 6 ch/j, 7 k/g,
// 8 f/v, 9 p/b). Elle sert de point de départ, pas de vérité imposée.
const majorWords = [
  "sauce", "site", "cygne", "somme", "sari", "sel", "singe", "sac", "savon", "soupe",
  "tasse", "tête", "thon", "dame", "terre", "dalle", "douche", "ticket", "dauphin", "taupe",
  "noce", "natte", "nonne", "ennemi", "noir", "Nil", "niche", "nuque", "navet", "nappe",
  "mousse", "moto", "mine", "momie", "mare", "moule", "mèche", "mug", "mauve", "mappe",
  "rose", "rat", "reine", "rame", "rire", "rail", "roche", "requin", "rave", "robe",
  "lasso", "lait", "lune", "lama", "lyre", "lilas", "louche", "lac", "lave", "loup",
  "chaise", "chat", "chaîne", "chamois", "jarre", "gel", "juge", "jack", "cheveu", "jupe",
  "case", "couteau", "canne", "gomme", "gare", "clé", "cage", "coq", "cave", "cape",
  "vase", "fête", "vanne", "femme", "phare", "voile", "vache", "vague", "fève", "VIP",
  "bus", "botte", "banane", "pomme", "poire", "balle", "bûche", "bague", "bœuf", "bébé",
];

const majorCards: LearningCard[] = majorWords.map((word, index) => {
  const number = String(index).padStart(2, "0");
  return {
    id: `major-${number}`,
    deckId: "major",
    kind: "number",
    prompt: `Quelle image mentale associer à ${number} ?`,
    answer: word,
    acceptedAnswers: [word],
    clue: "Transforme les chiffres en consonnes, puis ajoute librement des voyelles.",
    explanation: `${number} → ${word}. Personnalise ce mot si une autre image est plus vive pour toi.`,
    emoji: "✦",
    tags: ["00–99", "mémoire"],
  };
});

const scienceSeeds = [
  ["Pourquoi le ciel paraît-il bleu ?", "La lumière bleue est davantage diffusée par l’atmosphère.", "Les molécules de l’air diffusent plus efficacement les courtes longueurs d’onde : c’est la diffusion de Rayleigh."],
  ["Quelle est l’unité SI de la force ?", "Le newton", "Un newton est la force nécessaire pour accélérer une masse de 1 kg de 1 m/s²."],
  ["Que mesure le pH ?", "L’acidité ou la basicité d’une solution", "Un pH inférieur à 7 est acide, 7 neutre et supérieur à 7 basique, à température usuelle."],
  ["Quel organite produit l’essentiel de l’énergie cellulaire ?", "La mitochondrie", "Elle transforme l’énergie chimique des nutriments en ATP par respiration cellulaire."],
  ["Qu’est-ce que la photosynthèse ?", "La conversion de lumière en énergie chimique par les organismes chlorophylliens", "Elle utilise notamment eau et dioxyde de carbone pour former des molécules organiques et libérer de l’oxygène."],
  ["Pourquoi les saisons existent-elles ?", "À cause de l’inclinaison de l’axe de la Terre", "L’inclinaison modifie l’angle et la durée d’ensoleillement ; la distance au Soleil n’en est pas la cause principale."],
  ["Quelle particule détermine l’élément chimique ?", "Le proton", "Le nombre de protons du noyau est le numéro atomique de l’élément."],
  ["Que décrit la sélection naturelle ?", "La reproduction différentielle de caractères héréditaires", "Dans un environnement donné, certains caractères augmentent les chances de laisser une descendance."],
  ["Quelle est la vitesse de la lumière dans le vide ?", "Environ 300 000 km/s", "Sa valeur exacte est 299 792 458 m/s."],
  ["Pourquoi un objet flotte-t-il ?", "La poussée d’Archimède équilibre ou dépasse son poids", "Le fluide exerce une force ascendante égale au poids du volume de fluide déplacé."],
  ["Quel gaz est le plus abondant dans l’atmosphère terrestre ?", "Le diazote", "Le diazote N₂ représente environ 78 % de l’atmosphère sèche."],
  ["Qu’est-ce qu’un gène ?", "Une séquence d’ADN contribuant à un produit fonctionnel", "Ce produit peut être un ARN ou, après traduction, une protéine."],
  ["Pourquoi la Lune présente-t-elle toujours la même face ?", "Sa rotation est synchronisée avec sa révolution", "Elle tourne sur elle-même dans le même temps qu’elle orbite autour de la Terre."],
  ["Quelle loi relie tension, résistance et intensité ?", "La loi d’Ohm : U = R × I", "À résistance constante, la tension est proportionnelle à l’intensité."],
  ["Qu’est-ce qu’un isotope ?", "Un atome d’un même élément avec un nombre différent de neutrons", "Les isotopes ont le même nombre de protons mais des masses différentes."],
  ["Quelle couche terrestre est liquide ?", "Le noyau externe", "Ses mouvements de fer liquide contribuent à générer le champ magnétique terrestre."],
  ["Qu’est-ce que l’entropie ?", "Une mesure du nombre de configurations microscopiques possibles", "Dans un système isolé, l’entropie tend à augmenter lors d’une évolution spontanée."],
  ["Pourquoi les antibiotiques n’agissent-ils pas sur les virus ?", "Les virus n’ont pas les structures bactériennes ciblées", "Les antibiotiques ciblent par exemple la paroi ou les ribosomes des bactéries."],
  ["Quelle différence entre masse et poids ?", "La masse mesure la quantité de matière ; le poids est une force gravitationnelle", "La masse reste la même, tandis que le poids dépend du champ de gravité."],
  ["Qu’est-ce qu’une année-lumière ?", "Une unité de distance", "C’est la distance parcourue par la lumière dans le vide en une année, environ 9 460 milliards de km."],
] as const;

const scienceCards: LearningCard[] = scienceSeeds.map(([prompt, answer, explanation], index) => ({
  id: `science-${index + 1}`,
  deckId: "science",
  kind: "text",
  prompt,
  answer,
  acceptedAnswers: [answer],
  clue: "Cherche le mécanisme, pas seulement un mot-clé.",
  explanation,
  emoji: ["🔭", "⚙️", "🧪", "🧬"][index % 4],
  tags: ["culture générale", "comprendre"],
  source: "https://www.universalis.fr/",
}));

const historySeeds = [
  ["−52", "Défaite de Vercingétorix à Alésia", "La victoire de César accélère l’intégration de la Gaule au monde romain."],
  ["476", "Fin conventionnelle de l’Empire romain d’Occident", "La déposition de Romulus Augustule sert de repère à la fin de l’Antiquité en Occident."],
  ["800", "Couronnement impérial de Charlemagne", "Le couronnement à Rome réactive l’idée impériale en Occident."],
  ["987", "Hugues Capet devient roi des Francs", "Cette élection ouvre la dynastie capétienne."],
  ["1214", "Bataille de Bouvines", "La victoire de Philippe Auguste renforce l’autorité royale capétienne."],
  ["1453", "Fin de la guerre de Cent Ans et prise de Constantinople", "Cette année sert de double repère entre Moyen Âge et époque moderne."],
  ["1492", "Premier voyage de Christophe Colomb vers les Amériques", "Le voyage ouvre une période d’échanges, de conquêtes et de bouleversements mondiaux."],
  ["1515", "Bataille de Marignan", "La victoire de François Ier devient un symbole de son règne et des guerres d’Italie."],
  ["1598", "Édit de Nantes", "Henri IV accorde des droits aux protestants et apaise temporairement les guerres de Religion."],
  ["1685", "Révocation de l’édit de Nantes", "Louis XIV supprime les principales protections accordées aux protestants."],
  ["1776", "Déclaration d’indépendance des États-Unis", "Les colonies proclament leur séparation d’avec la Grande-Bretagne."],
  ["1789", "Début de la Révolution française", "États généraux, prise de la Bastille et Déclaration des droits transforment l’ordre politique."],
  ["1804", "Napoléon Ier est sacré empereur", "Le Consulat laisse place au Premier Empire."],
  ["1815", "Défaite de Waterloo", "Elle marque la fin des Cent-Jours et du pouvoir de Napoléon Ier."],
  ["1848", "Abolition de l’esclavage dans les colonies françaises et suffrage universel masculin", "La Deuxième République porte ces deux transformations majeures."],
  ["1870", "Proclamation de la Troisième République", "La chute du Second Empire ouvre un régime républicain durable."],
  ["1914–1918", "Première Guerre mondiale", "La guerre industrielle et mondiale bouleverse les sociétés et les frontières européennes."],
  ["1939–1945", "Seconde Guerre mondiale", "Le conflit mondial inclut la Shoah et se conclut par un nouvel ordre international."],
  ["1957", "Traités de Rome", "Ils fondent la CEE et Euratom, étapes majeures de la construction européenne."],
  ["1989", "Chute du mur de Berlin", "Elle symbolise l’effondrement des régimes communistes d’Europe de l’Est et la fin de la guerre froide."],
] as const;

const historyCards: LearningCard[] = historySeeds.map(([date, event, explanation], index) => ({
  id: `history-${index + 1}`,
  deckId: "history",
  kind: "text",
  prompt: `Que s’est-il passé en ${date} ?`,
  answer: event,
  acceptedAnswers: [event],
  clue: "Replace la date dans son époque et cherche le changement qu’elle représente.",
  explanation,
  emoji: "⌛",
  tags: ["chronologie", "culture générale"],
  source: "https://www.vie-publique.fr/",
}));

export const builtInCards: LearningCard[] = [
  ...natureCards,
  ...majorCards,
  ...scienceCards,
  ...historyCards,
];

export const chatGptPrompt = `Tu es un éditeur pédagogique rigoureux. Crée un paquet de flashcards en français au format JSON strict ci-dessous.

Contraintes :
- une réponse courte et vérifiable ;
- une explication qui aide à comprendre ;
- 3 à 5 tags ;
- une source fiable quand le contenu est factuel ;
- aucun markdown autour du JSON ;
- ne jamais inventer une source ;
- varier rappel direct, reconnaissance visuelle et questions "pourquoi/comment".

Schéma :
{
  "schemaVersion": 1,
  "deck": {
    "id": "identifiant-court",
    "title": "Titre",
    "subtitle": "Description en une phrase",
    "icon": "emoji",
    "accent": "#16785b",
    "soft": "#dff4e9"
  },
  "cards": [
    {
      "id": "identifiant-unique",
      "kind": "text",
      "prompt": "Question",
      "answer": "Réponse",
      "acceptedAnswers": ["variante admise"],
      "clue": "Indice sans donner la réponse",
      "explanation": "Explication pédagogique",
      "emoji": "✨",
      "image": "URL HTTPS facultative",
      "source": "URL facultative",
      "tags": ["thème"]
    }
  ]
}

Sujet demandé : [REMPLACE PAR TON SUJET]
Nombre de cartes : [REMPLACE PAR LE NOMBRE]`;

