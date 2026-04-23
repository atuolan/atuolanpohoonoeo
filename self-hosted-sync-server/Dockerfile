FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
RUN mkdir -p /app/data
ENV PORT=3004
EXPOSE 3004
CMD ["node", "src/server.js"]
