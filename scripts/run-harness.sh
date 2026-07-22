#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${ROOT_DIR}/harness-results/$(date +%Y%m%d-%H%M%S)"
SUMMARY_FILE="${LOG_DIR}/summary.txt"
SCENARIO_FILE="${ROOT_DIR}/provider-switching.integration.test.ts"
PROVIDERS=(livekit daily agora tencent_rtc)

mkdir -p "${LOG_DIR}"

echo "RTC harness run started at $(date -u +%Y-%m-%dT%H:%M:%SZ)" | tee "${SUMMARY_FILE}"
echo "Scenario: ${SCENARIO_FILE}" | tee -a "${SUMMARY_FILE}"
echo "" | tee -a "${SUMMARY_FILE}"

PASS_COUNT=0
FAIL_COUNT=0

for provider in "${PROVIDERS[@]}"; do
  log_file="${LOG_DIR}/${provider}.log"
  echo "=== ${provider} ===" | tee -a "${SUMMARY_FILE}"
  if RTC_PROVIDER="${provider}" npx --yes tsx --test "${SCENARIO_FILE}" >"${log_file}" 2>&1; then
    echo "status: PASS" | tee -a "${SUMMARY_FILE}"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo "status: FAIL" | tee -a "${SUMMARY_FILE}"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
  echo "log: ${log_file}" | tee -a "${SUMMARY_FILE}"
  echo "" | tee -a "${SUMMARY_FILE}"
done

echo "Totals: pass=${PASS_COUNT} fail=${FAIL_COUNT}" | tee -a "${SUMMARY_FILE}"
echo "Summary file: ${SUMMARY_FILE}"

if [[ "${FAIL_COUNT}" -gt 0 ]]; then
  exit 1
fi
