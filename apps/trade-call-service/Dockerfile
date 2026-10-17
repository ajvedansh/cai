# Build stage — runs from monorepo root context
FROM node:20-alpine AS builder
WORKDIR /app

# Copy shared libs and compile them
COPY libs/types/ ./libs/types/
RUN cd libs/types && npm install && npm run build

COPY libs/events/ ./libs/events/
RUN cd libs/events && npm install && npm run build

# Copy root tsconfig (needed for extends path in service tsconfig)
COPY tsconfig.base.json ./

# Copy service source and install deps
COPY apps/trade-call-service/ ./apps/trade-call-service/
WORKDIR /app/apps/trade-call-service
RUN npm install
RUN npm run build

# Runner stage — lean production image
FROM node:20-alpine AS runner
WORKDIR /app

# Copy compiled shared libs (needed by require('@cai/types') at runtime)
COPY --from=builder /app/libs/types/dist ./libs/types/dist
COPY --from=builder /app/libs/types/package.json ./libs/types/package.json
COPY --from=builder /app/libs/events/dist ./libs/events/dist
COPY --from=builder /app/libs/events/package.json ./libs/events/package.json

# Copy compiled service
COPY --from=builder /app/apps/trade-call-service/dist ./apps/trade-call-service/dist
COPY --from=builder /app/apps/trade-call-service/node_modules ./apps/trade-call-service/node_modules
COPY --from=builder /app/apps/trade-call-service/package.json ./apps/trade-call-service/package.json

WORKDIR /app/apps/trade-call-service
ENV NODE_ENV=production
EXPOSE 3004
CMD ["node", "dist/main"]
