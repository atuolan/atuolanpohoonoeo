FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY src ./src

# HF Spaces 以 user 1000 (非 root) 執行，需確保 data 目錄可寫
RUN mkdir -p /app/data && chown -R 1000:1000 /app
USER 1000

# PORT=7860 是 Hugging Face Spaces 的必要 port
# 本機 docker-compose 可透過 environment 覆蓋為 3004
ENV PORT=7860
ENV SYNC_DATA_DIR=/app/data
EXPOSE 7860
CMD ["node", "src/server.js"]
