---
version: 1
slug: "index-html"
primary_target: "index.html"
related_targets: ["admin.html"]
---

# StrainSage — chat client et admin

Scope: index.html (chat client : connexion, accueil, conversation, cartes variétés, culture, comparer, stats, profil) and admin.html (tableau de bord, stock, stats, clients, catalogue Garden Seeds, base de variétés, paramètres). Visitor mode: Operate on both.

Audience and job: shop customers on a shop tablet, a phone (≈380 px) and a home computer ask for a variety and must leave with an orderable seed, exact packs and prices. The owner alone runs long admin operations on a computer.

Constraints: functionality untouched (every id, window.fn handler, JS-built markup contract and Firestore flow kept); light and dark themes, dark by default when nothing is stored; keyboard focus visible; French copy unchanged unless a label is wrong.

Direction: pinned by the owner — inspired by his shop OG's Farm (ogs-farm/app/globals.css), never the reverse. No concept roll: a pinned direction beats the roll. Decisions taken by default after unanswered questions (owner may overrule at local validation): dark default, wordmark redrawn in the OG's Farm voice keeping the sprout dot, chat and admin in one pass.

Unresolved: future « acheter sur OG's Farm » links on cards (no link exists yet; leave room, invent nothing).

## Direction contract

THESIS: StrainSage is the shop's seed catalogue that answers back. It refuses the generic AI-chat look (rounded bubbles, gradient accents, bright SaaS cards): the answer reads like a page of a seed catalogue, set by the same house as OG's Farm.

OWN-WORLD: ground noir #171614 with elevated #201f1c and sunken #121211 (dark default) or ivoire #f2eee3 (light); ink ivoire #f2eee3 / encre #1a1a1a; or #d4af37 for primary action, focus and rules; cuivre for prices; vert sapin for in-stock; Bodoni Moda for names and headings (italic gold for section titles), Hanken Grotesk for interface and text, tabular lining numerals; square corners (2px), hairline gold rules and the double filet (2px + 1px); calibrated photography (darkened, amber, light grain) and fine line illustrations of seeds, trichomes and leaves.

STORY: the customer sees immediately where to type, recognises a serious shop, reads recommendations as catalogue entries with real packs and prices, and acts (favourite, compare, lineage, photo zoom).

FIRST VIEWPORT: chat — left rail (wordmark, profile, favourites, history, theme) on noir élevé; top bar with modes as tabs underlined in gold; the conversation column centred (max 760px); composer pinned at the bottom with a gold send button. Welcome: Bodoni greeting, one calibrated photo strip (graines / trichomes) with credit, quick criteria as square chips, the shelf of most-requested varieties as catalogue rows. Admin — same rail and tokens, tables set as catalogue ledgers with tabular numerals.

FORM: established world (OG's Farm) extended to an Operate surface; signature move = every pack and price line set as a catalogue entry: name, dotted leader, copper price, small-caps details. seed: none (pinned direction, no roll)

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
