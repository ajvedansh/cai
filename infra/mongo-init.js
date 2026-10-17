// MongoDB initialisation — creates separate databases and users per service
db = db.getSiblingDB('channel_db');
db.createUser({
  user: 'channel_svc',
  pwd: 'channel_svc_local',
  roles: [{ role: 'readWrite', db: 'channel_db' }],
});
db.raw_messages.createIndex({ dedup_hash: 1 }, { unique: true });
db.raw_messages.createIndex({ status: 1, received_at: -1 });
db.raw_messages.createIndex({ source_channel: 1, received_at: -1 });
db.channel_registry.createIndex({ platform: 1, channel_id: 1 }, { unique: true });

db = db.getSiblingDB('trade_call_db');
db.createUser({
  user: 'trade_svc',
  pwd: 'trade_svc_local',
  roles: [{ role: 'readWrite', db: 'trade_call_db' }],
});
db.trade_calls.createIndex({ status: 1, created_at: -1 });
db.trade_calls.createIndex({ instrument: 1, channel_id: 1, created_at: -1 });
db.trade_calls.createIndex({ raw_message_id: 1 }, { unique: true });
db.review_queue.createIndex({ status: 1, created_at: -1 });
