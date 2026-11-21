#!/usr/bin/env bash
# Run shellcheck, actionlint, and gitleaks. Tool archives are checksum-pinned.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "${script_dir}/.." && pwd)"
cd "${root}"

if ! command -v shellcheck >/dev/null 2>&1; then
  echo "shellcheck is required" >&2
  exit 1
fi

shellcheck "${root}/scripts/"*.sh

if [[ "$(uname -m)" != "x86_64" ]]; then
  echo "quality tools are pinned for x86_64" >&2
  exit 1
fi

tmp="$(mktemp -d)"
cleanup() {
  rm -rf "${tmp}"
}
trap cleanup EXIT

install_tar() {
  local url="$1"
  local checksum="$2"
  local binary="$3"
  local archive="${tmp}/archive.tar.gz"

  curl -fsSL -o "${archive}" "${url}"
  echo "${checksum}  ${archive}" | sha256sum -c -
  tar -xzf "${archive}" -C "${tmp}" "${binary}"
  chmod +x "${tmp}/${binary}"
  rm -f "${archive}"
}

install_tar \
  "https://github.com/rhysd/actionlint/releases/download/v1.7.12/actionlint_1.7.12_linux_amd64.tar.gz" \
  "8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8" \
  "actionlint"

"${tmp}/actionlint"

install_tar \
  "https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_linux_x64.tar.gz" \
  "551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb" \
  "gitleaks"

"${tmp}/gitleaks" detect --source "${root}" --redact --no-banner
