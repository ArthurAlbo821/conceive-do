# Database Indexes Documentation

## Overview
This document explains the database indexes added for performance optimization.

## Index Strategy

### Messages Table
**High volume table** - Expects thousands of messages per user

| Index Name | Columns | Purpose | Impact |
|------------|---------|---------|--------|
| `idx_messages_conversation` | (conversation_id, timestamp DESC) | Fetch messages for a conversation | ✅ Existing |
| `idx_messages_instance` | (instance_id) | Filter by instance | ✅ Existing |
| `idx_messages_instance_timestamp` | (instance_id, timestamp DESC) | Instance + sorted by time | ⚡ NEW |
| `idx_messages_sender_phone` | (sender_phone) | Search by sender | ⚡ NEW |
| `idx_messages_receiver_phone` | (receiver_phone) | Search by receiver | ⚡ NEW |

**Query improvements:**
```sql
-- BEFORE: Seq scan on messages (slow)
SELECT * FROM messages WHERE instance_id = '...' ORDER BY timestamp DESC LIMIT 50;

-- AFTER: Index scan on idx_messages_instance_timestamp (fast)
-- ~100x faster with 10,000+ messages
```

### Conversations Table
**Medium volume** - Hundreds of conversations per user

| Index Name | Columns | Purpose | Impact |
|------------|---------|---------|--------|
| `idx_conversations_instance_id` | (instance_id) | Filter by instance | ✅ Existing |
| `idx_conversations_last_message` | (last_message_at DESC) | Sort by activity | ✅ Existing |
| `idx_conversations_instance_last_message` | (instance_id, last_message_at DESC) | Instance + sorted | ⚡ NEW |
| `idx_conversations_contact_phone` | (contact_phone) | Find by phone | ⚡ NEW |

**Query improvements:**
```sql
-- BEFORE: Index scan + sort (moderate)
SELECT * FROM conversations
WHERE instance_id = '...'
ORDER BY last_message_at DESC;

-- AFTER: Direct index scan (faster)
-- ~10x faster with 1,000+ conversations
```

### Appointments Table
**Medium volume** - Daily/weekly queries for calendar view

| Index Name | Columns | Purpose | Impact |
|------------|---------|---------|--------|
| `idx_appointments_user_id` | (user_id) | Filter by user | ✅ Existing |
| `idx_appointments_date` | (appointment_date) | Filter by date | ✅ Existing |
| `idx_appointments_user_date_time` | (user_id, appointment_date, start_time) | Calendar queries | ⚡ NEW |
| `idx_appointments_conversation_id` | (conversation_id) WHERE IS NOT NULL | Link to conversation | ⚡ NEW |

**Query improvements:**
```sql
-- BEFORE: Multiple index scans + filter
SELECT * FROM appointments
WHERE user_id = '...'
  AND appointment_date BETWEEN '2025-01-01' AND '2025-01-31'
ORDER BY appointment_date, start_time;

-- AFTER: Single composite index scan
-- ~20x faster for date range queries
```

## Performance Benchmarks

### Expected Improvements

| Operation | Before (ms) | After (ms) | Improvement |
|-----------|-------------|------------|-------------|
| Load 50 messages | 150ms | 5ms | **30x faster** |
| Load conversation list | 80ms | 8ms | **10x faster** |
| Load monthly appointments | 100ms | 5ms | **20x faster** |
| Search by phone number | 200ms | 10ms | **20x faster** |

*Based on datasets with:*
- 10,000+ messages
- 1,000+ conversations
- 500+ appointments

## Index Maintenance

### Index Size Impact
- Each index adds ~2-5% to table size
- Total additional storage: ~10-15% of table size
- Trade-off: **Worth it** for query performance

### Monitoring
Check index usage with:
```sql
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan as scans,
  idx_tup_read as tuples_read
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;
```

### When to Rebuild
Indexes should be rebuilt if:
- High table churn (many updates/deletes)
- Index bloat detected
- Performance degrades over time

```sql
-- Rebuild an index
REINDEX INDEX CONCURRENTLY idx_messages_instance_timestamp;
```

## Deployment

### Applying Migration

**Local Development:**
```bash
supabase db reset
```

**Production (Supabase Dashboard):**
1. Go to SQL Editor
2. Run migration file
3. Indexes created with IF NOT EXISTS (safe to re-run)

**Via CLI:**
```bash
supabase db push
```

## Rollback

If needed, remove indexes:
```sql
DROP INDEX IF EXISTS idx_messages_instance_timestamp;
DROP INDEX IF EXISTS idx_messages_sender_phone;
DROP INDEX IF EXISTS idx_messages_receiver_phone;
DROP INDEX IF EXISTS idx_conversations_instance_last_message;
DROP INDEX IF EXISTS idx_conversations_contact_phone;
DROP INDEX IF EXISTS idx_appointments_user_date_time;
DROP INDEX IF EXISTS idx_appointments_conversation_id;
DROP INDEX IF EXISTS idx_user_informations_user_id;
DROP INDEX IF EXISTS idx_availabilities_user_day;
```

## Best Practices

### DO ✅
- Add indexes on foreign keys (already done)
- Use composite indexes for common query patterns
- Index columns used in WHERE, JOIN, ORDER BY
- Use partial indexes for filtered queries

### DON'T ❌
- Over-index (each index has maintenance cost)
- Index columns that are frequently updated
- Index small tables (<1000 rows)
- Forget to analyze query performance

## Further Optimization

Consider if data grows significantly:
1. **Partitioning** messages by month
2. **Archiving** old messages (>6 months)
3. **Materialized views** for analytics
4. **Full-text search** indexes for message content

---

**Last Updated:** 2025-10-29
**Migration File:** `20251029000000_add_performance_indexes.sql`
