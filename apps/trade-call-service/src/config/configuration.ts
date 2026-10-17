export interface AppConfig {
  port: number;
  nodeEnv: string;
  mongodbUri: string;
  redisUrl: string;
  apiKey: string;
  consumerGroup: string;
  consumerName: string;
  streams: {
    tradeCallCreated: string;
    needsReview: string;
    tradeCallActivated: string;
  };
}

export default (): AppConfig => ({
  port: parseInt(process.env.PORT ?? '3004', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  mongodbUri:
    process.env.MONGODB_URI ??
    'mongodb://trade_svc:trade_svc_local@localhost:27017/trade_call_db',
  redisUrl: process.env.REDIS_URL ?? 'redis://:cai_redis_local@localhost:6379',
  apiKey: process.env.API_KEY ?? 'dev-api-key-change-in-prod',
  consumerGroup: process.env.CONSUMER_GROUP ?? 'trade-call-svc-group',
  consumerName: process.env.CONSUMER_NAME ?? 'trade-call-svc-1',
  streams: {
    tradeCallCreated:
      process.env.STREAM_TRADE_CALL_CREATED ?? 'cai:trade_call.created',
    needsReview: process.env.STREAM_NEEDS_REVIEW ?? 'cai:message.needs_review',
    tradeCallActivated:
      process.env.STREAM_TRADE_CALL_ACTIVATED ?? 'cai:trade_call.activated',
  },
});
