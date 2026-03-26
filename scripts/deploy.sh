#!/bin/bash
set -euo pipefail

APP_DIR="/opt/pledge-wall"
COMPOSE_FILE="$APP_DIR/docker-compose.yml"
ENV_FILE="$APP_DIR/.env"
LAST_GOOD_TAG_FILE="$APP_DIR/.last-good-tag"

GITHUB_REPOSITORY=$(grep "^GITHUB_REPOSITORY=" "$ENV_FILE" | cut -d '=' -f2)
NEW_TAG="${IMAGE_TAG}"
IMAGE="ghcr.io/${GITHUB_REPOSITORY}"

echo "=============================="
echo " Deploying: $IMAGE:$NEW_TAG"
echo "=============================="

# Pull the new image
docker pull "$IMAGE:$NEW_TAG"

# Update IMAGE_TAG in .env so compose uses the new image
sed -i "s|^IMAGE_TAG=.*|IMAGE_TAG=$NEW_TAG|" "$ENV_FILE"

# Restart only the app container (mongo stays up — zero downtime on DB)
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --no-deps app

# Health check loop: 12 attempts x 5s = 60s window
# Runs directly inside the container — no port exposure or DNS needed
echo ">>> Waiting for health check..."
for i in $(seq 1 12); do
    sleep 5
    if docker exec pledge-wall-app wget -qO- http://localhost:3000/health > /dev/null 2>&1; then
        echo ">>> Health check passed on attempt $i"
        echo ">>> Deployment successful: $NEW_TAG"
        echo "$NEW_TAG" > "$LAST_GOOD_TAG_FILE"
        exit 0
    fi
    echo "    Attempt $i/12 failed, retrying..."
done

# All attempts failed — roll back to last known good deployment
ROLLBACK_TAG=$(cat "$LAST_GOOD_TAG_FILE" 2>/dev/null || echo "latest")
echo ">>> ERROR: Health check failed after 60s. Rolling back to $ROLLBACK_TAG..."

sed -i "s|^IMAGE_TAG=.*|IMAGE_TAG=$ROLLBACK_TAG|" "$ENV_FILE"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --no-deps app

echo ">>> Rollback complete. Running on: $ROLLBACK_TAG"

# Exit with error so GitHub Actions marks the workflow as FAILED
exit 1
