export default () => ({
  port: parseInt(process.env.PORT ?? '3002', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  mongodb: {
    uri: process.env.MONGODB_URI ?? 'mongodb://localhost:27017/channel_db',
  },
  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  },
  auth: {
    apiKey: process.env.API_KEY ?? 'dev-api-key-change-in-prod',
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET ?? '',
  },
  whatsapp: {
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? '',
    appSecret: process.env.WHATSAPP_APP_SECRET ?? '',
  },
  rateLimit: {
    ttl: parseInt(process.env.RATE_LIMIT_TTL ?? '60000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX ?? '100', 10),
  },
});
