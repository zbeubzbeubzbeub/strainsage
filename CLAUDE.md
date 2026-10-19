# StrainSage Pro — contexte du projet pour Claude Code

> Ce fichier résume tout le travail fait jusqu'ici. Il sert de point de départ.
> **Avant de modifier quoi que ce soit, lis le code réel du dépôt** : si ce résumé et le code divergent, c'est le code qui fait foi. Signale-moi les écarts.

## 1. Le projet

StrainSage Pro est une web app de conseil en variétés, faite pour **Culture Indoor Anglet**, mon growshop à Anglet (Pays Basque). Je la développe seul.

- **Côté client** (`index.html`) : un chat où le client décrit ce qu'il cherche (effets, goûts, niveau, culture indoor/outdoor, budget). L'IA recommande des variétés en priorité **parmi le stock du magasin** et les affiche sous forme de cartes.
- **Côté admin** (`admin.html`) : import du stock (CSV/Excel), prix d'achat/vente et marges, statistiques (variétés les plus recherchées, favoris), réglages.

Objectifs : recommandations fiables et sourcées, interface soignée, déploiement stable, coûts API maîtrisés.

## 2. Stack et architecture

| Élément | Détail |
|---|---|
| Frontend | `index.html` + `admin.html` (toute la logique front est dans ces fichiers) + module `gd-reference.js` |
| Dépôt | GitHub `zbeubzbeubzbeub/strainsage`, branche `main` |
| Hébergement | Vercel → strainsage.vercel.app (avant : GitHub Pages) |
| Proxy / backend | Cloudflare Worker (`worker.js`), déployé avec Wrangler. Relaie l'API Anthropic et Jina. Auth par en-tête `X-Shop-Token` |
| Routes du Worker | `PROXY + '/search'` (recherche Jina), `PROXY + '/fetch-page'` (lecture directe d'une URL) |
| Base de données | Firebase Firestore : profils clients, stock, réglages admin, cache `reference` |
| IA | Anthropic API via le Worker : `claude-sonnet-5-5` pour les recommandations, `claude-haiku-5-5` pour l'extraction et les questions simples |

## 3. Ce qui fonctionne déjà

**Interface**
- Double thème clair / sombre (bouton ☀️/🌙), basé sur des variables CSS (`--bg`, `--accent`, `--text1`…) sous `[data-theme]`, mémorisé dans localStorage.
- Modal de profil utilisateur (niveau, type de culture, budget, préférences) enregistré dans Firestore et injecté dans le prompt.
- Mémoire de session : variétés aimées, pas aimées, déjà essayées.

**Chat et IA**
- Streaming SSE, `max_tokens` entre 3000 et 4000, historique limité aux 8 derniers messages.
- Détection de plus de 60 noms de variétés, plus extraction des mots à majuscule, filtrés par une liste `stopWords` de mots français courants.
- `buildCtx` : pour chaque variété citée (2 au maximum), lecture directe de la fiche seedfinder.eu, puis leafly.com en secours (`fetchStrainSource()`). Sans variété citée, `detectQueryIntent()` adapte la recherche (effets, goûts, culture, variétés similaires). Chaque source est étiquetée et tronquée à 1500 caractères. Rien n'est lancé si la variété est déjà connue.
- Une variété consultée il y a moins de 24 h ne relance pas de recherche web.
- Routage des coûts : les questions générales passent sur Haiku, les recommandations sur Sonnet.
- Prompt caching sur le prompt système et la liste de stock (efficace seulement si le stock est importé et assez gros).
- Bloc JSON des cartes lu de façon tolérante (virgules en trop, guillemets typographiques, balise manquante, réponse tronquée). Le « thinking » est désactivé pour le chat, car il consommait les tokens et coupait le JSON.
- Les messages d'erreur de Jina (401, quota) sont filtrés et ne sont plus transmis à l'IA comme s'ils étaient des données.

**`gd-reference.js`**
- Consulte d'abord le cache Firestore `reference`. Ne va chercher la fiche GrowDiaries que si elle manque ou est périmée (60 jours pour une fiche variété, 7 jours pour une recherche par catégorie).
- Extrait par IA uniquement les faits : lignée, breeders, descendants, effets, goûts. Jamais les avis, journaux de culture ou photos.
- **GrowDiaries bloque désormais les lecteurs automatiques (403)**, donc ce module est en pratique inactif. Sa logique est conservée au cas où un accès officiel serait obtenu (demande de partenariat envoyée, sans réponse).

**Admin**
- Session persistante (localStorage), `saveSettings()` vers Firebase, synchronisation du stock entre collections.

## 4. Nouveauté : la base de variétés en CSV

J'ai reçu une base de données de variétés complète en CSV (fournie par un freelance, sources mixtes). **C'est la priorité.** L'idée est qu'elle devienne la source principale de l'app, et que la recherche web ne serve plus qu'en secours.

Le format qui avait été demandé :
- Séparateur `;`, et `|` à l'intérieur des cellules qui contiennent une liste.
- Deux niveaux : les **variétés** (faits génétiques) et les **produits** (une graine vendue par un breeder, rattachée à sa variété par `variete_id`).

Schéma cible pour une variété :
```
id (nom en minuscules avec tirets), nom, alias[], type ("indica"|"sativa"|"hybride"), dominante,
breeder_createur, parents[], descendants[{nom, autre_parent}],
thc_min, thc_max, cbd_min, cbd_max, terpenes[] (par ordre de dominance),
effets[], effets_indesirables[], gouts[],
floraison_sem_min, floraison_sem_max, autofloraison (bool),
difficulte ("facile"|"moyenne"|"difficile"), hauteur ("compacte"|"moyenne"|"grande"),
rendement ("faible"|"moyen"|"eleve"), resistance_moisissure (bool|null),
indoor, outdoor, serre (bool),
sources[{url, type: "breeder"|"seedbank"|"base"|"communaute", date: "AAAA-MM-JJ"}]
```
Schéma cible pour un produit :
```
variete_id, breeder, nom_commercial, type_graine ("feminisee"|"auto"|"reguliere"|"cbd"),
floraison_sem_min, floraison_sem_max, thc_annonce (nombre|null), url
```

Le fichier livré ne respecte peut-être pas exactement ce format. **Ne présuppose rien : inspecte-le d'abord.**

## 5. Étapes à suivre

1. **Analyser le CSV** : encodage, séparateur, colonnes, nombre de lignes, taux de remplissage par colonne, doublons, valeurs aberrantes. Fais-moi un rapport court avant toute transformation.
2. **Script de nettoyage et de conversion** (Node ou Python, versionné dans le dépôt, par exemple `scripts/import-varietes`) :
   - Mapper les colonnes vers le schéma ci-dessus.
   - Convertir en vrais nombres (retirer « % », « semaines »), les listes en vrais tableaux, normaliser les valeurs d'énumération.
   - Un champ inconnu vaut `null`. **Ne jamais inventer de valeur.**
   - Fusionner les doublons et les alias.
   - **Supprimer tout texte recopié (descriptions longues), avis et photos.** Ne garder que les faits.
   - Conserver la source (URL) de chaque fiche. Lister à part les fiches sans source.
   - Produire `varietes.json` et `produits.json`, plus un rapport d'import (lignes rejetées et pourquoi).
3. **Import dans Firestore**, par lots (batch writes), dans une collection dédiée (proposer un nom, par exemple `varietes`, ou réutiliser `reference` si c'est plus cohérent avec `gd-reference.js`). Faire d'abord un test sur 20 fiches.
4. **Brancher la base dans l'app** :
   - `buildCtx` consulte d'abord la base. La recherche web (seedfinder/leafly) n'est lancée que si la variété est absente.
   - Envoyer à l'IA une fiche compacte (les champs utiles, pas tout), pour limiter les tokens.
   - Faire le lien entre la base et le stock du magasin (correspondance de noms tolérante, alias).
   - Afficher la source sur les cartes quand elle existe.
   - Élargir la détection de variétés en utilisant les noms et alias de la base, au lieu de la liste codée en dur.
5. Plus tard : page admin pour consulter et corriger les fiches.

## 6. Règles à respecter absolument

- **Ne jamais redéployer le Worker sans me prévenir avant et m'expliquer les risques.** Un redéploiement a déjà fait perdre le secret `ANTHROPIC_API_KEY`, qui a ensuite été mal recréé deux fois (une fois avec la clé comme nom de variable, une fois avec un `u` en trop au début, repéré grâce à `wrangler tail`). Avant tout redéploiement, vérifier les secrets avec `wrangler secret list` ; pour diagnostiquer, utiliser `wrangler tail`.
- **Ne jamais contourner les protections anti-bot de GrowDiaries** (ni d'aucun autre site) : pas de changement de user-agent, de proxy rotatif, de headless browser, etc.
- Ne jamais exposer de clé API dans le front ni dans un commit.
- Les fonctions appelées depuis un `onclick` HTML doivent être exposées globalement : `window.maFonction = function() {...}` ou `window.maFonction = async function() {...}`. La syntaxe `async window.fn = ...` est invalide.
- Jina : les opérateurs `site:` et `OR` cassent les requêtes. La lecture directe d'une URL connue (`/fetch-page`) est plus fiable que la recherche.
- Leafly n'est pas fiable pour les images (formats d'URL qui changent, CORS).
- Ne pas partir sur une architecture « agents » multi-étapes : c'est jugé sur-dimensionné pour ce cas, ça ajoute de la latence.

## 7. Problèmes encore ouverts

- **Photos des variétés** : Jina bloqué (403), Leafly bloqué par CORS, la route `/image` du Worker renvoie 404. Piste envisagée : l'API Unsplash (pas encore de clé).
- **La recherche web générale demande une clé Jina**, à configurer dans le Worker (donc redéploiement, voir les règles).
- **Le stock du magasin est à réimporter** dans l'admin (il était vide lors du dernier test).

## 8. Ma façon de travailler

- Je parle français : réponds-moi en français.
- J'aime comprendre les compromis avant de trancher une décision d'architecture : propose-moi les options.
- Je déploie en poussant les fichiers sur GitHub, puis Vercel les sert. Après une modification, dis-moi clairement **quels fichiers ont changé** et lesquels je dois pousser.
- Après un gros patch, vérifie avec `grep -n` que les modifications sont bien en place.
- Quand c'est terminé, explique-moi concrètement ce qui a changé : ce que je voyais avant, et ce que je vois maintenant.
