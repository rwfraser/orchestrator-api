#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNS="${HARNESS_RUNS:-6}"
INTERVAL_SECONDS="${HARNESS_INTERVAL_SECONDS:-14400}"
BURST_DIR="${ROOT_DIR}/harness-results/burst-$(date +%Y%m%d-%H%M%S)"
BURST_SUMMARY_FILE="${BURST_DIR}/summary.txt"

mkdir -p "${BURST_DIR}"

echo "RTC burst harness started at $(date -u +%Y-%m-%dT%H:%M:%SZ)" | tee "${BURST_SUMMARY_FILE}"
echo "Configured runs: ${RUNS}" | tee -a "${BURST_SUMMARY_FILE}"
echo "Interval seconds: ${INTERVAL_SECONDS}" | tee -a "${BURST_SUMMARY_FILE}"
echo "" | tee -a "${BURST_SUMMARY_FILE}"

RUN_PASS=0
RUN_FAIL=0

for run_index in $(seq 1 "${RUNS}"); do
  run_dir="${BURST_DIR}/run-${run_index}"
  echo ">>> Run ${run_index}/${RUNS} started at $(date -u +%Y-%m-%dT%H:%M:%SZ)" | tee -a "${BURST_SUMMARY_FILE}"
  if HARNESS_OUTPUT_DIR="${run_dir}" "${ROOT_DIR}/scripts/run-harness.sh"; then
    echo "run_status: PASS" | tee -a "${BURST_SUMMARY_FILE}"
    RUN_PASS=$((RUN_PASS + 1))
  else
    echo "run_status: FAIL" | tee -a "${BURST_SUMMARY_FILE}"
    RUN_FAIL=$((RUN_FAIL + 1))
  fi
  echo "run_summary: ${run_dir}/summary.txt" | tee -a "${BURST_SUMMARY_FILE}"
  echo "" | tee -a "${BURST_SUMMARY_FILE}"

  if [[ "${run_index}" -lt "${RUNS}" ]]; then
    sleep "${INTERVAL_SECONDS}"
  fi
done

echo "Burst totals: pass=${RUN_PASS} fail=${RUN_FAIL}" | tee -a "${BURST_SUMMARY_FILE}"
echo "Burst summary file: ${BURST_SUMMARY_FILE}"

if [[ "${RUN_FAIL}" -gt 0 ]]; then
  exit 1
fi
