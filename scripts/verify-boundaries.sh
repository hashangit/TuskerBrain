#!/usr/bin/env bash
# verify-boundaries.sh — prove the architecture boundaries fail fast.
#
# For each "<dir>:<forbidden import>" pair, writes a temp probe file into <dir>
# importing <forbidden import>, runs the linter on it, and expects an ERROR.
# Exit 0 only if every violation is caught. Probe files are always removed.
#
# Usage:
#   ./verify-boundaries.sh \
#     "src/ui:stripe" \
#     "src/ui:../domain/order-service" \
#     "src/domain:stripe" \
#     "src/capabilities:../ui/button"
#
# Override the lint command with LINT_CMD (default: npx eslint --no-warn-ignored).
# A probe that lints CLEAN means the boundary is NOT enforced — fix the config,
# not the probe. (If the probe file is eslint-ignored, that also counts as a hole.)

set -uo pipefail

LINT_CMD="${LINT_CMD:-npx eslint --no-warn-ignored}"
probes=()
failures=0

cleanup() { for p in "${probes[@]:-}"; do [ -n "$p" ] && rm -f "$p"; done; }
trap cleanup EXIT

if [ "$#" -eq 0 ]; then
  echo "usage: $0 <dir>:<forbidden-import> [<dir>:<forbidden-import> ...]" >&2
  exit 2
fi

for pair in "$@"; do
  dir="${pair%%:*}"
  import="${pair#*:}"
  probe="${dir}/.__boundary-probe.ts"

  if [ ! -d "$dir" ]; then
    echo "SKIP: ${dir} does not exist"
    continue
  fi

  printf "import '%s';\n" "$import" > "$probe"
  probes+=("$probe")

  if $LINT_CMD "$probe" >/dev/null 2>&1; then
    echo "HOLE: ${dir} accepted forbidden import '${import}' — boundary NOT enforced"
    failures=$((failures + 1))
  else
    echo "OK:   ${dir} rejected '${import}'"
  fi
done

echo
if [ "$failures" -eq 0 ]; then
  echo "All probed boundaries are enforced."
  exit 0
else
  echo "${failures} boundary hole(s) found — architecture is aspirational until these fail."
  exit 1
fi
