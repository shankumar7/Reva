# Build context is the repository root. Works on arm64 (Oracle Ampere) and x86.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY server/package.json server/package-lock.json server/
RUN cd server && npm ci
COPY server server
COPY shared shared
RUN cd server && npx tsc -p .

FROM node:22-bookworm-slim
ENV NODE_ENV=production NODE_NO_WARNINGS=1
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/server/dist ./dist
COPY shared/package.json ./dist/shared/package.json
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server/src/index.js"]
