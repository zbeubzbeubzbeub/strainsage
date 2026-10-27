# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: customers of Culture Indoor Anglet, a growshop in Anglet (Pays Basque), choosing cannabis seed varieties. They describe what they want (effects, tastes, level, indoor or outdoor, budget) and get recommendations. They use the chat in three situations, all confirmed by the owner: on a tablet in the shop, on their phone at home, and on a computer at home. Their level ranges from first-time growers to experienced ones who know strain names, lineages and seed banks.

Secondary: the shop owner, alone, in the admin (`admin.html`) on a computer: syncing the supplier catalogue, importing the variety base, checking catalogue quality and matching, settings, statistics, customer codes.

## Product Purpose

StrainSage is an AI variety advisor for Culture Indoor Anglet. A customer asks in plain French and receives recommendations restricted to seeds that the shop can actually order from its wholesaler, Garden Seeds Trading, described with facts from the shop's own variety base. Success means a customer leaves with a variety that fits them, with exact packs and prices, and trusts the answer.

## Positioning

The advice is grounded in two real data sources that a generic chatbot or a seed bank site does not combine: the wholesaler catalogue the shop orders from (variants, packs, prices, stock status) and a curated variety base (lineage, effects, tastes, terpenes, flowering). The AI only recommends what can be ordered, and never invents a price, pack or variant.

## Operating Context

- Static pages served by Vercel (`index.html` client chat, `admin.html` admin), Firebase Firestore, a Cloudflare Worker proxy to the Anthropic API, the Garden Seeds API and Jina.
- Customers sign in with a first name and a shop code; profile, favourites and conversation history are kept.
- Chat modes: Chat, Culture, Comparer, Stats. Recommendations appear as variety cards (photo, type, THC, CBD, flowering, yield, lineage, packs and prices, rating, favourites, lineage tree, compare).
- Admin works on large tables and long operations (synchronisation with progress, import, audits).
- Planned, undecided: linking StrainSage to the owner's online shop OG's Farm so that seed cards offer purchase links on that site, and possibly CBD.

## Capabilities and Constraints

- Functionality must be preserved exactly when the look changes: every feature, `window.fn` onclick handler, data flow and Firestore write stays as it is.
- Light and dark themes are both required (toggle remembered locally).
- Usable on a shop tablet, a phone (about 380 px wide) and a desktop computer.
- External scripts load from cdnjs where possible; no API key in the front end.
- Recommendations come only from the wholesaler catalogue; out-of-stock variants are stated as such; bulk professional packs (Granel) are hidden by default.

## Brand Commitments

- Name: StrainSage (logo: lowercase wordmark « strainsage », the dot of the i drawn as a young sprout), the advisor of Culture Indoor Anglet.
- Copy is in French, informal « tu » with customers.
- Art direction: inspired by the owner's online shop OG's Farm (`C:\Users\theob\ogs-farm`, Next.js app, `app/globals.css`), so that both can later live together. The inspiration goes from OG's Farm to StrainSage, never the reverse; OG's Farm must not be modified for this.
- Imagery: a professional mix of royalty-free photos (seeds, trichomes) and vector illustrations, all credited where a licence requires it.

## Evidence on Hand

- Real data: the Garden Seeds catalogue (about 2,800 orderable varieties), the variety base imported from CSV, Garden Seeds product photos (320 px thumbnail, 600 px main) and base photos (1,024 to 1,500 px).
- Royalty-free photos already sourced and credited for OG's Farm: `ogs-farm/public/images/` (Unsplash licence, credits in `credits.txt`).
- No testimonials, reviews, press, ratings history or customer numbers may be invented.

## Product Principles

1. Trust over persuasion: every price, pack, variant and fact shown is real and traceable to the catalogue or the base.
2. The answer is the product: the customer's question and the AI's recommendation lead every screen.
3. Restraint: a knowledgeable shop advisor, not a head shop or a hype machine.
4. One tool, three settings: shop tablet, phone, computer, all first-class.

## Accessibility & Inclusion

- Readable in both themes, usable by keyboard, with visible focus, for an audience of adults of all ages, in a shop with varied lighting.
