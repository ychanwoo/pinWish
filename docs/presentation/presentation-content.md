# Presentation content

These sections provide material to select and condense into slides. They are not a narration script, timed agenda or demo sequence.

## Product

**PinWish: Turn Saved Posts into Places**  
CS 446 Cloud Computing · Youngchan Woo

**Core message:** PinWish turns recommendations found in social-media posts into a personal map and shareable travel plans.

People discover destinations in posts, but a saved post is not yet a usable travel plan. A carousel can contain multiple venues; the useful information is scattered across images, captions and separate map searches. PinWish connects source recommendations to searchable places, collections and planned visits.

Primary intended users are travelers, students and friends collecting restaurants and destinations. The proposed value is less manual copying and a clearer view of where to go. Future premium shared planning or larger collections is a product hypothesis, not implemented billing, demonstrated demand or proven revenue.

## Current product scope

| Capability | Implemented behavior |
| --- | --- |
| Accounts | Email/password signup, verification, sign-in/out, password reset and optional seven-day remembered sessions |
| Instagram intake | Web URL entry for public photo carousels; candidate extraction, place lookup and automatic saving of resolved matches |
| Direct search | Search a place/address, select a provider result and choose or create a destination collection |
| Organization | Persistent collections, notes, bookmarks, visit status and moving saved places |
| Personal map | Amazon Location/MapLibre map, clustering, selection, hover names, collection colors and visited checks |
| Place information | Best-effort representative photos, attribution and available weekly hours/time zones |
| Journeys | Editable visit estimates, opening-hour-aware scheduling, driving/walking estimates, persistence and read-only sharing |
| Collection sharing | Opt-in, revocable, expiring read-only public links |

The web app is responsive. A native phone application and an Instagram share-sheet destination are future work. The embedded map uses Amazon Location; Google Maps opens only for external directions. Instagram account login is not the PinWish authentication method.

## From images to mapped places

- Public carousel retrieval supplies slide images and caption context to a Bedrock vision model.
- Extraction preserves original text and slide references, excludes covers/end cards and validates structured output.
- Search-query conversion supports English lookup for overseas places while preserving the source evidence.
- Amazon Location resolves candidates to provider identities, addresses and coordinates.
- Resolved matches can be saved automatically; failed or ambiguous matches remain visible for retry/correction rather than receiving invented coordinates.

The model proposes names; it does not establish geographic truth. A returned provider match can still be the wrong branch of a similarly named venue. The November 12 live sample yielded ten saved English locations from twelve photos; this is a sample result, not a general accuracy rate.

## Journeys: constraints before prose

The planner uses **deterministic scheduling with AWS location/routing data**, not an LLM writing a plausible itinerary.

- Select 3–20 places in one known time zone.
- Visit-length defaults are editable category estimates, not measured venue-specific recommendations.
- Fit full visits against known weekly opening windows, travel estimates and the daily activity window.
- Use bounded beam search to compare candidate orders; preserve manual order when selected.
- Account for lunch, arrival buffer and a 20% allowance on provider travel estimates.
- Extend dates or assign clearly labeled suggested times when required so every selected place appears exactly once.
- Retain unknown routes/hours as unknown. A complete plan is not proof that every venue is open or every journey leg is feasible.

Days and nights describe the recommended calendar span; they do not represent hotel bookings. Accommodation, airport transfers, reservations, last admission and holiday changes are outside the guarantees. See [the scheduling rules](../collection-itinerary.md) for exact behavior.

## Why AWS is central

The product depends on AWS for accounts, durable user data, authenticated APIs, background processing, AI inference, maps, place search, routes and hosting. It is more than a static UI with cloud hosting. [Architecture details](architecture.md) map each service to a concrete responsibility.

Serverless components avoid maintaining an always-running application server for this small project. They still require quotas, monitoring, caching and explicit runtime controls; serverless does not mean free or unlimited.

## Engineering decisions worth explaining

| Problem | Implemented response | Tradeoff |
| --- | --- | --- |
| Imports can outlast a browser/API request | Accepted asynchronous jobs, polling and owner-scoped job records | Cancellation stops UI polling; accepted work may already be running |
| Account changes can race with responses | Session-owner/generation guards and server-side ownership checks | More lifecycle handling than a simple fetch-and-render flow |
| Routes and hours are incomplete | Explicit unknown values and provisional visits | Users still need to confirm practical feasibility |
| Twenty stops exceed a single matrix request boundary | At most four 10×10 batches, cache only a complete matrix | Up to 400 billed origin/destination pairs |
| Large initial JavaScript entry | Selected lazy features and deferred Cognito SDK | MapLibre remains large; first use still loads deferred code |
| Unrelated UI state rebuilt map data | Stable memoized inputs and narrowed map dependencies | Actual pin/filter/color changes must still invalidate inputs |

## Quality and measured results

- November 12: real AWS deployment passed all 14 recorded combined browser checkpoints, plus real signup verification and password reset.
- November 13: 140 unit tests and 106 browser tests passed; three intentional platform skips remained.
- Main production JavaScript entry decreased from 526.77 to 351.16 kB; gzip decreased from 159.83 to 107.12 kB.
- Six sidebar toggles caused 12 map data worker updates before refactoring and zero afterward in the same fixture scenario.
- Seven of eight journey reference screenshots were byte-identical; one differed by a single focus-outline pixel without a layout change.

These are dated results, not new tests run for this document. The roughly 33% entry-size reduction is not a 33% total download or page-load-time claim. See [evidence and scope](evidence.md).

## Privacy, reliability and costs

Private records are tied to the authenticated owner. Public sharing is explicit and read-only, with a server-side field allowlist excluding personal notes and account information. Links expire after 30 days and can be revoked; recipients can still retain information already downloaded.

Caches, atomic quotas, bounded worker lifetimes and automatic pause reduce unnecessary usage. Pausing retains data and can leave storage/log/hosting charges. Budget notifications and request quotas are not hard spending caps. No current bill, remaining credit or guaranteed free-tier capacity is asserted here.

## Limitations and future work

- Public Instagram retrieval is experimental; private posts, Reels and universal future-post access are not supported guarantees.
- OCR, translation and automatic place matching can fail. Detailed South Korean lookup is unsupported by the current integration.
- Photos are best-effort Wikimedia discovery, not Google Places Photos or guaranteed coverage.
- Listed weekly hours do not establish holiday access or ticket availability; route estimates do not predict all future traffic.
- Shared collections/journeys are read-only, not collaborative editing.
- Native mobile sharing, broader coverage and improved matching evaluation are potential future work, not current features.

The achieved outcome is a working AWS-backed web product that connects source recommendations, persistent places, personal maps and shareable journeys while exposing uncertainty instead of hiding it.
