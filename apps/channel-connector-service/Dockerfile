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
COPY apps/channel-connector-service/ ./apps/channel-connector-service/
WORKDIR /app/apps/channel-connector-service
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
COPY --from=builder /app/apps/channel-connector-service/dist ./apps/channel-connector-service/dist
COPY --from=builder /app/apps/channel-connector-service/node_modules ./apps/channel-connector-service/node_modules
COPY --from=builder /app/apps/channel-connector-service/package.json ./apps/channel-connector-service/package.json

WORKDIR /app/apps/channel-connector-service
ENV NODE_ENV=production
EXPOSE 3002
CMD ["node", "dist/main"]
