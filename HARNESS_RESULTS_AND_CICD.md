# Harness Results Interpretation and CI/CD Integration
This guide explains how to read harness outputs and automate harness execution in CI/CD.

## What the harness runs
- `npm run harness`
  - Runs provider-switching integration scenario across all providers:
    - `livekit`
    - `daily`
    - `agora`
    - `tencent_rtc`
- `npm run harness:burst`
  - Repeats `npm run harness` on cadence.
  - Default cadence is every 4 hours for 20 hours:
    - `HARNESS_RUNS=6`
    - `HARNESS_INTERVAL_SECONDS=14400`

## Output structure
Both scripts write into `harness-results/`.

### Single harness run
`scripts/run-harness.sh` creates:
- `harness-results/<timestamp>/summary.txt`
- `harness-results/<timestamp>/livekit.log`
- `harness-results/<timestamp>/daily.log`
- `harness-results/<timestamp>/agora.log`
- `harness-results/<timestamp>/tencent_rtc.log`

### Burst harness run
`scripts/run-harness-burst.sh` creates:
- `harness-results/burst-<timestamp>/summary.txt`
- `harness-results/burst-<timestamp>/run-1/summary.txt`
- `harness-results/burst-<timestamp>/run-1/*.log`
- ...
- `harness-results/burst-<timestamp>/run-6/summary.txt`
- `harness-results/burst-<timestamp>/run-6/*.log`

## How to interpret `summary.txt`
### Per-run summary (`run-harness.sh`)
For each provider:
- `status: PASS` means provider scenario completed successfully.
- `status: FAIL` means that provider failed for that run.
- `log: <path>` points to provider-specific test output.

Totals line:
- `Totals: pass=<n> fail=<n>`
- If `fail > 0`, script exits with non-zero code.

### Burst summary (`run-harness-burst.sh`)
For each scheduled run:
- `run_status: PASS|FAIL`
- `run_summary: <path to that run's summary>`

Totals line:
- `Burst totals: pass=<n> fail=<n>`
- If `fail > 0`, script exits with non-zero code.

## Recommended triage flow for failures
1. Open burst-level `summary.txt`.
2. Identify first failed run (`run_status: FAIL`).
3. Open that run’s `summary.txt`.
4. Identify failing provider(s).
5. Open provider log (`<provider>.log`) for exact test failure stack trace.
6. Re-run locally with shorter cadence to reproduce quickly:
   - `HARNESS_RUNS=1 npm run harness`

## CI/CD integration approach
Use two workflows:

1. Fast PR gate:
- Run `npm run test:integration` (or `npm run harness` if desired for provider sweep).
- Keep this workflow short and deterministic.

2. Scheduled or on-demand burst:
- Run `npm run harness:burst`.
- Upload `harness-results/**` as artifacts.
- Useful for longitudinal provider reliability.

## Example GitHub Actions workflow (burst)
```yaml
name: rtc-harness-burst
on:
  workflow_dispatch:
  schedule:
    - cron: "0 */4 * * *"
jobs:
  harness-burst:
    runs-on: ubuntu-latest
    timeout-minutes: 1300
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - name: Run 20-hour burst (every 4 hours)
        run: npm run harness:burst
      - name: Upload harness artifacts
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: harness-results
          path: harness-results/**
```

## Notes on scheduling behavior
- `harness:burst` already performs 6 runs over 20 hours internally.
- If you also use a `cron` trigger every 4 hours, you will start overlapping bursts unless guarded.
- Recommended:
  - Use `workflow_dispatch` for intentional burst windows, or
  - Use a `concurrency` group in GitHub Actions to prevent overlaps.

## Optional hardening
- Add `concurrency` in workflow:
  - `concurrency: rtc-harness-burst`
- Add environment-based provider secrets for future real media checks.
- Parse summaries into JSON in a future enhancement for dashboard ingestion.
