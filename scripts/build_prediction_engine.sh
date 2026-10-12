#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd -P)"
cd "$root"
source_identity() {
  find kotlin -type f \( -name '*.kt' -o -name '*.kts' -o -name 'gradle.properties' -o -name 'gradle-wrapper.jar' -o -name 'gradle-wrapper.properties' -o -name 'gradlew' \) \
    ! -path '*/build/*' ! -path '*/.gradle/*' ! -path '*/.kotlin/*' -print0 |
    sort -z | xargs -0 sha256sum | sha256sum | cut -d' ' -f1
}
binary_identity() {
  find kotlin/production/build/install/production -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum | cut -d' ' -f1
}
source_hash="$(source_identity)"
stamp="kotlin/production/build/source-identity.txt"
binary="kotlin/production/build/install/production/bin/production"
cached_source=""; cached_binary=""
if [[ -f "$stamp" && -x "$binary" ]]; then read -r cached_source cached_binary < "$stamp"; fi
if [[ "$cached_source" != "$source_hash" || ! -x "$binary" || "$cached_binary" != "$(binary_identity 2>/dev/null || true)" ]]; then
  echo "KOTLIN_BUILD SOURCE_IDENTITY=$source_hash SOURCE_SHA=$(git rev-parse HEAD)" >&2
  ./kotlin/gradlew -p kotlin --no-daemon :production:installDist >&2
  [[ "$(source_identity)" == "$source_hash" ]] || { echo "Source changed during build" >&2; exit 3; }
  printf '%s %s\n' "$source_hash" "$(binary_identity)" > "$stamp"
fi
printf '%s\n' "$source_hash"
