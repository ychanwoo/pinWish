# Local import connection follow-up — November 16, 2026

The user reported the generic unavailable/timeout message on localhost:5173.
Read-only checks found the configured AWS API enabled, localhost in the exact
CORS allowlist, a running Vite server and the expected processing endpoint.
No new import job corresponding to the attempt was found; the user's reset daily
import counter remained zero. Historical completed jobs do not prove this request
succeeded. Browser log capture contained no diagnostic for the earlier failure,
so the original transport/auth failure is not conclusively identified.

The processing client previously retried fetch failures only through receipt of
headers. It now includes body transfer and successful JSON parsing in the same
retry boundary, retains the same submission/job ID, and distinguishes connection
failure, invalid responses and parent timeout. This is a tested recovery fix,
not a claim that the exact original failure was reproduced.

Lint, types and build passed. Six processing browser tests passed, including a
truncated polling response (one import submission), an unreachable endpoint
(three attempts with the same ID), live progress, cancellation and quota handling.
Tests used fixtures and consumed no real account import quota. These changes are
available in the local Vite workspace; no additional production deployment was
made for this follow-up. Existing user data/counters and their bounded active AWS
session were left unchanged. No commit or push.
