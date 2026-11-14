#!/usr/bin/env bash
# Updates the API on the server: backup, new code, dependencies, build, database migrations, switch, restart,
# health check, and an automatic step back to the previous build if the new one does not start.
#
#   cd /home/arvin/deniz/backend && bash deploy/scripts/deploy.sh
#
# The code is pulled from git when the project is inside a git clone (also when the clone holds backend/ and frontend/
# and this is backend/); otherwise copy the new files in first (e.g. unzip), then run this. Order matters:
#   - the new build goes to dist.new: a failed build changes neither the database nor what the service runs
#   - migrations run only after the build succeeded
#   - dist is switched and the service restarted at the very end; until then the running version keeps serving
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_DIR"
SERVICE="${SERVICE:-deniz-api}"
PORT_FROM_ENV="$(grep -E '^PORT=' .env 2>/dev/null | tail -n 1 | cut -d= -f2- | tr -d '"'\''' || true)"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:${PORT_FROM_ENV:-3000}/health}"

step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
fail() {
	printf '\n\033[31mdeploy failed: %s\033[0m\n' "$*" >&2
	exit 1
}
healthy() {
	for _ in $(seq 1 30); do
		if curl -fsS --max-time 2 "$HEALTH_URL" >/dev/null 2>&1; then return 0; fi
		sleep 1
	done
	return 1
}

[[ -f .env ]] || fail ".env not found in $PROJECT_DIR (copy .env.example and fill it in)"

step "Backup (database + images) before changing anything"
bash deploy/scripts/backup.sh || fail "backup failed; nothing was changed"

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
	step "Pull the new code"
	git pull --ff-only || fail "git pull failed (local changes on the server?)"
else
	step "Not a git clone: deploying the files as they are in $PROJECT_DIR"
fi

step "Install dependencies (exactly the versions in package-lock.json)"
# dev dependencies too: the build (TypeScript, Prisma CLI) needs them, even if NODE_ENV=production is exported
npm ci --include=dev --no-audit --no-fund || fail "npm ci failed"

step "Build into dist.new (the running version is not touched)"
rm -rf dist.new
npx prisma generate >/dev/null || fail "prisma generate failed"
npx tsc -p tsconfig.build.json --outDir dist.new || fail "the build has errors; nothing was changed in the database or in dist"

step "Apply database migrations"
npx prisma migrate deploy || fail "migration failed; the running version was not changed. If the database was partly changed, restore the backup made above (deploy/DEPLOY.md, section 3)"

step "Switch to the new build and restart"
rm -rf dist.old
if [[ -d dist ]]; then mv dist dist.old; fi
mv dist.new dist
sudo systemctl restart "$SERVICE" || fail "could not restart $SERVICE"

step "Wait for the API to answer"
if healthy; then
	echo "healthy: $(curl -fsS --max-time 2 "$HEALTH_URL")"
	printf '\n\033[32mdeploy finished\033[0m (the previous build is kept in dist.old)\n'
	exit 0
fi

echo "the new version did not answer at $HEALTH_URL within 30 s; last log lines:" >&2
sudo journalctl -u "$SERVICE" -n 40 --no-pager >&2 || true
if [[ -d dist.old ]]; then
	step "Going back to the previous build"
	rm -rf dist.failed
	mv dist dist.failed
	mv dist.old dist
	sudo systemctl restart "$SERVICE" || true
	if healthy; then
		echo "the previous build is running again; the failed one is in dist.failed." >&2
		echo "If this deploy's migrations changed the database, check that the old version still works (or restore the backup)." >&2
	else
		echo "the previous build does not start either: check .env and the database (journalctl -u $SERVICE)." >&2
	fi
fi
fail "the new version does not start (see the log above)"
