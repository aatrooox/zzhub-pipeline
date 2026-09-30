FROM oven/bun:1.3.14

# `render` uses headless Chromium to export article HTML and cover images.
# Keep the worker self-contained so a cloud host does not need a desktop browser.
RUN apt-get update \
    && apt-get install -y --no-install-recommends chromium fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .

ENV NODE_ENV=production \
    PIPELINE_WORKER_HOST=127.0.0.1 \
    PIPELINE_WORKER_PORT=18887 \
    PIPELINE_WORKER_STATE_FILE=/data/pipeline-worker/jobs.json \
    PIPELINE_WORKSPACE_ROOT=/data/pipeline-worker \
    ZZHUB_PIPELINE_BRANDING_LOGO=/app/src/imgx/assets/icons/logo.png

VOLUME ["/data"]
CMD ["bun", "run", "services/cloud-worker/server.ts"]
