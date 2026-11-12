# PinWish working agreements

- Work one issue and feature branch at a time. Follow the user's `feat/` or `ui/` branch names; do not push directly to `main`.
- Do not commit or push unless the user requests it. When authorized, split commits by work unit and use `feat:` or `ui:` prefixes. PR titles use the same prefixes; issue titles use `[Feat]` or `[UI]`.
- At branch completion, before reporting commits or proposing the next issue/branch, inspect the corresponding GitHub issue and update completed checklist items to `[x]`. Do this without requiring a reminder. Verify the updated issue body on GitHub.
- When the user says a PR was merged or a new branch was created, reconcile the previous issue's checklist before starting the next feature. Closing an issue or merging a PR does not automatically check its tasks.
- Check completion against implementation and validation evidence. Do not mark deferred or unverified work complete merely because an issue is closed; document those exceptions clearly.
- Run appropriate validation and preserve meaningful results. Use bounded AWS test sessions, clean up temporary test data, and pause runtime after testing.
