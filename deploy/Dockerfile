# Build with repository-root context: docker build -f deploy/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY frontend/confidence-panel/package.json frontend/confidence-panel/package-lock.json ./frontend/confidence-panel/
RUN npm --prefix frontend/confidence-panel ci --include=dev
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/deploy ./deploy
COPY --from=build /app/agents ./agents
COPY --from=build /app/frontend/confidence-panel/dist ./frontend/confidence-panel/dist
EXPOSE 10000
ENV PORT=10000
CMD ["node", "deploy/server.js"]
