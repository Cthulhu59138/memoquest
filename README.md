# MémoQuest

Flashcards et répétition espacée, en français, sans compte ni serveur métier.
Adresse prévue : https://memoquest.papaye-labs.fr/

## Développer

Node.js **22.19.0** (ou une version compatible >=22.13.0), npm et Git.

```sh
npm ci
npm run dev
npm run check
npm run preview
```

`npm run check` exécute les tests métier, TypeScript et la compilation Vite.
La sortie `dist/` comprend le service worker et toutes les ressources locales
nécessaires au fonctionnement hors ligne. Aucun secret de compilation requis.

## Données

- Base IndexedDB `memoquest`, schéma 1, locale au navigateur et à l’origine web.
- Quatre parcours et 160 cartes ; FSRS 5.4.1, rétention 0,90 et fuzz conservés.
- Le Sprint enregistre des résultats sans changer les échéances FSRS.
- Paquets `schemaVersion: 1`, sauvegardes `backupVersion: 1`.
- La restauration valide le fichier complet et réhydrate les dates avant toute
  écriture transactionnelle. L’interface demande confirmation du remplacement.

Changer de domaine ne transfère pas IndexedDB : **exporter depuis l’ancienne
adresse, puis restaurer dans la nouvelle**. Conserver le fichier original.
Voir [l’aide intégrée](public/aide.html).

## Publier et revenir en arrière

1. Dans les réglages du dépôt, choisir **Pages → GitHub Actions**.
2. Définir le domaine `memoquest.papaye-labs.fr` et son DNS CNAME vers
   `cthulhu59138.github.io` ; vérifier d’abord le domaine racine dans GitHub.
3. Un push sur `main` lance vérification, compilation, puis publication du même
   artefact. Les pull requests ne publient pas.
4. Après émission du certificat, activer **Enforce HTTPS** et ouvrir l’adresse.

Pour revenir en arrière, faire un `git revert` du changement concerné puis
pousser sur `main`. Le pipeline republie une version cohérente. Ne pas effacer
les données du navigateur pour changer de version. Si le site doit être retiré,
retirer aussi son raccordement DNS ; conserver le TXT de vérification du domaine.

Le cache est lié au contenu de chaque build. Les mises à jour attendent la
confirmation « Mettre à jour » ou la fermeture des anciens onglets. IndexedDB
n’est jamais supprimée par le service worker.

## Médias et limites

Les vingt photos Wikimedia sont externes : elles ne sont pas garanties hors
ligne. [Le registre des crédits](public/media-credits.json) conserve les auteurs,
licences, URL sources et date de vérification. Les textes des cartes et le cœur
de l’application fonctionnent hors ligne après le premier chargement complet.

Aucune synchronisation entre appareils, aucun compte, aucune APK produite par
ce dépôt. Les contenus pédagogiques sont un point de départ, pas une validation
scientifique exhaustive. Les cartes Nature ne servent pas à décider de consommer
une plante. Les tests doivent être complétés par un essai sur téléphone physique
pour qualifier l’installation PWA propre à chaque navigateur.

Voir [les décisions de publication](docs/DECISIONS.md) et
[les notices tierces](THIRD_PARTY_NOTICES.md).
