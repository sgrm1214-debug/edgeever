#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

readonly GHCR_IMAGE="ghcr.io/tianma-if/edgeever"
readonly TCR_IMAGE="ccr.ccs.tencentyun.com/edgeever/edgeever"
readonly GLOBAL_COMPOSE_URL="https://edgeever.org/compose.yaml"
readonly TENCENT_COMPOSE_URL="https://edgeever-installer-1256854452.cos.ap-guangzhou.myqcloud.com/compose.yaml"

install_dir="${EDGE_EVER_INSTALL_DIR:-${HOME:-}/edgeever}"
compose_url="${EDGE_EVER_COMPOSE_URL:-}"
image="${EDGE_EVER_IMAGE:-}"
version="${EDGE_EVER_VERSION:-}"
port="${EDGE_EVER_PORT:-}"
username="${EDGE_EVER_AUTH_USERNAME:-}"
password="${EDGE_EVER_AUTH_PASSWORD:-}"
project_name="${EDGE_EVER_PROJECT_NAME:-edgeever}"
generated_password=false
temporary_compose=""
temporary_env=""
current_step="Parse arguments"
diagnostics_printed=false
start_epoch=0
declare -a compose=()

log() {
  local level="$1"
  shift
  printf '[%s] [%-7s] %s\n' "$(date '+%H:%M:%S')" "$level" "$*" >&2
}

step() {
  current_step="$2"
  log "STEP $1/6" "$2"
}

usage() {
  cat <<'EOF'
Install or upgrade EdgeEver with Docker Compose.

Usage:
  curl -fsSL https://edgeever.org/install.sh | bash
  curl -fsSL https://edgeever-installer-1256854452.cos.ap-guangzhou.myqcloud.com/install.sh | bash -s -- --mirror tcr

Options:
  --mirror ghcr|tcr   Select the image registry (default: ghcr)
  --image IMAGE      Use a custom image repository
  --version TAG      Deploy an image tag (default: latest)
  --compose-url URL  Download Compose configuration from URL
  --install-dir DIR  Store Compose configuration in DIR (default: ~/edgeever)
  --port PORT        Publish EdgeEver on PORT (default: 8787)
  -h, --help         Show this help

The same options can be provided with EDGE_EVER_IMAGE, EDGE_EVER_VERSION,
EDGE_EVER_COMPOSE_URL, EDGE_EVER_INSTALL_DIR, EDGE_EVER_PORT, and
EDGE_EVER_AUTH_PASSWORD.
EOF
}

print_diagnostics() {
  [[ "$diagnostics_printed" == false ]] || return 0
  diagnostics_printed=true

  log ERROR "Stage: $current_step"
  if ((${#compose[@]} > 0)); then
    log INFO "Container status:"
    "${compose[@]}" ps -a >&2 || true
    log INFO "Recent container logs:"
    "${compose[@]}" logs --tail 80 edgeever >&2 || true
    log INFO "Troubleshooting commands:"
    printf '  cd %q\n' "$install_dir" >&2
    printf '  docker compose --project-name %q --env-file .env --file compose.yaml ps -a\n' "$project_name" >&2
    printf '  docker compose --project-name %q --env-file .env --file compose.yaml logs --tail 200 edgeever\n' "$project_name" >&2
  fi
  log INFO "Deployment guide: https://github.com/tianma-if/edgeever/blob/main/docs/deploy-docker.md"
}

fail() {
  trap - ERR
  log ERROR "$*"
  print_diagnostics
  exit 1
}

on_error() {
  local exit_code=$?
  local line_number="${BASH_LINENO[0]}"
  trap - ERR
  log ERROR "A command failed (exit code: $exit_code, line: $line_number)"
  print_diagnostics
  exit "$exit_code"
}

trap on_error ERR

require_value() {
  [[ $# -ge 2 && -n "$2" ]] || fail "$1 requires a value"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mirror)
      require_value "$@"
      case "$2" in
        ghcr) image="$GHCR_IMAGE" ;;
        tcr) image="$TCR_IMAGE" ;;
        *) fail "--mirror must be ghcr or tcr" ;;
      esac
      shift 2
      ;;
    --image)
      require_value "$@"
      image="$2"
      shift 2
      ;;
    --version)
      require_value "$@"
      version="$2"
      shift 2
      ;;
    --compose-url)
      require_value "$@"
      compose_url="$2"
      shift 2
      ;;
    --install-dir)
      require_value "$@"
      install_dir="$2"
      shift 2
      ;;
    --port)
      require_value "$@"
      port="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *) fail "unknown option: $1" ;;
  esac
done

start_epoch="$(date '+%s')"
step 1 "Validate environment"
[[ -n "$install_dir" ]] || fail "set HOME or EDGE_EVER_INSTALL_DIR"
[[ "$project_name" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || fail "invalid EDGE_EVER_PROJECT_NAME"

command -v curl >/dev/null 2>&1 || fail "curl is required"
command -v docker >/dev/null 2>&1 || fail "Docker is required: https://docs.docker.com/engine/install/"
docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is required"
docker info >/dev/null 2>&1 || fail "cannot connect to the Docker daemon"
log INFO "Docker and Docker Compose are available"

host_os=""
if [[ -r /etc/os-release ]]; then
  while IFS='=' read -r key value; do
    if [[ "$key" == "PRETTY_NAME" ]]; then
      host_os="${value#\"}"
      host_os="${host_os%\"}"
      break
    fi
  done < /etc/os-release
fi
host_os="${host_os:-$(uname -s)}"
kernel_version="$(uname -sr)"
host_architecture="$(uname -m)"
docker_engine_version="$(docker version --format '{{.Server.Version}}' 2>/dev/null || true)"
docker_engine_version="${docker_engine_version:-unknown}"
docker_compose_version="$(docker compose version --short 2>/dev/null || true)"
docker_compose_version="${docker_compose_version:-unknown}"
log INFO "Host OS: $host_os"
log INFO "Kernel: $kernel_version"
log INFO "Architecture: $host_architecture"
log INFO "Docker Engine: $docker_engine_version"
log INFO "Docker Compose: $docker_compose_version"

mkdir -p "$install_dir"
env_file="$install_dir/.env"
compose_file="$install_dir/compose.yaml"
if [[ -f "$env_file" ]]; then
  install_mode="upgrade"
else
  install_mode="new installation"
fi

read_env_value() {
  local key="$1"
  local line value
  [[ -f "$env_file" ]] || return 1
  while IFS= read -r line; do
    case "$line" in
      "$key="*)
        value="${line#*=}"
        if [[ "$value" == "'"*"'" && ${#value} -ge 2 ]]; then
          value="${value:1:${#value}-2}"
        fi
        printf '%s' "$value"
        return 0
        ;;
    esac
  done < "$env_file"
  return 1
}

step 2 "Resolve configuration"
if [[ -z "$image" ]]; then
  image="$(read_env_value EDGE_EVER_IMAGE || true)"
  image="${image:-$GHCR_IMAGE}"
fi

if [[ -z "$compose_url" ]]; then
  if [[ "$image" == "$TCR_IMAGE" ]]; then
    compose_url="$TENCENT_COMPOSE_URL"
  else
    compose_url="$GLOBAL_COMPOSE_URL"
  fi
fi

if [[ -z "$version" ]]; then
  version="$(read_env_value EDGE_EVER_VERSION || true)"
  version="${version:-latest}"
fi

if [[ -z "$port" ]]; then
  port="$(read_env_value EDGE_EVER_PORT || true)"
  port="${port:-8787}"
fi

if [[ -z "$username" ]]; then
  username="$(read_env_value EDGE_EVER_AUTH_USERNAME || true)"
  username="${username:-admin}"
fi

if [[ -z "$password" ]]; then
  password="$(read_env_value EDGE_EVER_AUTH_PASSWORD || true)"
fi

if [[ -z "$password" ]]; then
  if command -v openssl >/dev/null 2>&1; then
    password="$(openssl rand -hex 16)"
  elif command -v od >/dev/null 2>&1; then
    password="$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"
  else
    fail "openssl or od is required to generate a password"
  fi
  generated_password=true
fi

[[ "$image" != *[[:space:]]* ]] || fail "image must not contain whitespace"
[[ "$version" != *[[:space:]]* ]] || fail "version must not contain whitespace"
[[ "$port" =~ ^[0-9]+$ ]] && ((port >= 1 && port <= 65535)) || fail "port must be between 1 and 65535"
[[ "$username" != *$'\n'* && "$username" != *"'"* ]] || fail "invalid administrator username"
[[ "$password" != *$'\n'* && "$password" != *"'"* ]] || fail "password must not contain a newline or single quote"
log INFO "Mode: $install_mode"
log INFO "Install directory: $install_dir"
log INFO "EdgeEver target: $image:$version"
log INFO "Compose source: $compose_url"
log INFO "Published port: $port"

cleanup() {
  [[ -z "$temporary_compose" || ! -e "$temporary_compose" ]] || rm -f "$temporary_compose"
  [[ -z "$temporary_env" || ! -e "$temporary_env" ]] || rm -f "$temporary_env"
  return 0
}
trap cleanup EXIT

step 3 "Download Compose configuration"
temporary_compose="$(mktemp "$install_dir/.compose.yaml.XXXXXX")"
curl --fail --silent --show-error --location --output "$temporary_compose" "$compose_url"
grep -q '^services:' "$temporary_compose" || fail "downloaded Compose file is invalid"
chmod 0644 "$temporary_compose"
mv "$temporary_compose" "$compose_file"
temporary_compose=""
log INFO "Saved Compose configuration to $compose_file"

step 4 "Write runtime configuration"
temporary_env="$(mktemp "$install_dir/.env.XXXXXX")"
{
  printf "EDGE_EVER_IMAGE='%s'\n" "$image"
  printf "EDGE_EVER_VERSION='%s'\n" "$version"
  printf "EDGE_EVER_PORT='%s'\n" "$port"
  printf "EDGE_EVER_AUTH_USERNAME='%s'\n" "$username"
  printf "EDGE_EVER_AUTH_PASSWORD='%s'\n" "$password"
} > "$temporary_env"
chmod 0600 "$temporary_env"
mv "$temporary_env" "$env_file"
temporary_env=""
log INFO "Saved protected configuration to $env_file (password hidden)"

compose=(
  docker compose
  --project-name "$project_name"
  --project-directory "$install_dir"
  --env-file "$env_file"
  --file "$compose_file"
)

step 5 "Pull image and start container"
"${compose[@]}" pull
"${compose[@]}" up -d --remove-orphans

step 6 "Wait for health check"
container_id=""
health=""
for attempt in {1..60}; do
  container_id="$("${compose[@]}" ps -q edgeever 2>/dev/null || true)"
  if [[ -n "$container_id" ]]; then
    health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id" 2>/dev/null || true)"
    [[ "$health" == "healthy" ]] && break
    [[ "$health" == "exited" || "$health" == "dead" ]] && break
  fi
  if ((attempt == 1 || attempt % 5 == 0)); then
    log INFO "Waiting for container health (status: ${health:-not started}, elapsed: $((attempt * 2))s)"
  fi
  sleep 2
done

if [[ "$health" != "healthy" ]]; then
  fail "container did not become healthy (status: ${health:-unknown})"
fi

running_image="$(docker inspect --format '{{.Config.Image}}' "$container_id" 2>/dev/null || true)"
log INFO "Running image: ${running_image:-$image:$version}"
log SUCCESS "EdgeEver is ready ($(($(date '+%s') - start_epoch))s)"
printf '\nConnection details\n'
printf '  URL: http://<server-ip>:%s\n' "$port"
printf '  Username: %s\n' "$username"
if [[ "$generated_password" == true ]]; then
  printf '  Password: %s\n' "$password"
else
  printf '  Password: unchanged (stored in %s)\n' "$env_file"
fi
printf '  Install directory: %s\n' "$install_dir"
printf '\nUseful commands\n'
printf '  cd %q\n' "$install_dir"
printf '  docker compose ps\n'
printf '  docker compose logs --tail 200 -f edgeever\n'
