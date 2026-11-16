# Import collection recovery — November 16, 2026

The default collection can be renamed, but login/navigation and an unauthenticated
save draft could retain the temporary `Saved places` label. Import persistence
looked up the collection by name and rejected the finished analysis even though
the default collection still existed.

The navigation fallback now uses the catalog's actual default name. Import drafts
retain a stable collection ID when available; persistence uses that ID across
renames, refreshes an unavailable catalog, and resolves a legacy placeholder to
the real default collection. An explicitly selected deleted ID is never silently
redirected. On failure, the existing form now offers a collection selection so
already resolved places can be retried without another analysis.

Validation: lint/typecheck/build passed; 43 Chromium and 43 WebKit cloud checks
passed, with an additional focused pre-login draft/renamed-default reproduction
passing in both engines after that regression was strengthened. Tests use fixtures
and consume no Instagram analysis quota. Amplify deployment 24 completed; 13
frontend assets and four backend packages matched the current working tree.
No existing account records were changed, no quota counters were reset, and no
commit/push was performed. The user's already active bounded test window was
left intact; this change did not start an additional AWS test session.

A currently open page still runs the old JavaScript until refreshed. In-memory
analysis is not preserved by a full page reload; retrying a newly loaded page
therefore still obeys the normal daily import limit. The corrected in-page
collection retry itself does not re-run Instagram extraction.
