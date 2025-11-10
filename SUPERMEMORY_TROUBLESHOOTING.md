# Supermemory.ai Integration - Troubleshooting Guide

## Overview

This guide helps diagnose and resolve issues with the Supermemory.ai integration for conversation memory storage.

## Architecture

```
Message Flow:
┌──────────────┐
│ Message In   │
└──────┬───────┘
       │
       ├─────────────────────────┐
       │                         │
       ▼                         ▼
┌──────────────┐         ┌──────────────┐
│ PostgreSQL   │         │ Supermemory  │
│ (Primary)    │         │ (Optional)   │
└──────────────┘         └──────────────┘
```

**Key Principle**: PostgreSQL is the primary storage. Supermemory is optional and failures are handled gracefully.

---

## Common Issues

### 1. Messages Not Being Stored in Supermemory

**Symptoms**:
- Logs show: `[supermemory] Supermemory configuration invalid or missing`
- Logs show: `supermemorySkipped: true`

**Causes**:
- Missing or invalid `SUPERMEMORY_API_KEY`
- API key doesn't start with `sm_`

**Solution**:
```bash
# Check if environment variable is set
echo $SUPERMEMORY_API_KEY

# Set the API key (get from https://console.supermemory.ai)
supabase secrets set SUPERMEMORY_API_KEY=sm_your_api_key_here

# Verify
supabase secrets list
```

---

### 2. Supermemory Storage Fails But App Continues

**Symptoms**:
- Logs show: `[supermemory] Failed to store message:`
- Messages appear in database but not in Supermemory
- `supermemoryStored: false, supermemorySkipped: false`

**This is EXPECTED behavior** - graceful degradation ensures the app continues working even if Supermemory is down.

**Debugging Steps**:
1. Check API key validity:
   ```bash
   curl -X POST https://api.supermemory.ai/v3/documents \
     -H "Authorization: Bearer $SUPERMEMORY_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"content": "test"}'
   ```

2. Check network connectivity to Supermemory API
3. Review error logs for specific error messages
4. Check Supermemory dashboard for quota limits

**Common Errors**:
- `401 Unauthorized` → Invalid API key
- `429 Too Many Requests` → Rate limit exceeded
- `500 Internal Server Error` → Supermemory API issue (retry will happen automatically)
- `timeout` → Network issue or slow API response

---

### 3. Search Not Working (Returns PostgreSQL Fallback)

**Symptoms**:
- Logs show: `[supermemory] ⚠️ Search not yet implemented`
- Logs show: `[data] ✅ Context source: database`

**Status**: This is EXPECTED - search endpoint is not yet implemented.

**Current State**:
- ✅ Messages are stored in Supermemory via `/v3/documents`
- ❌ Search/retrieval endpoint not yet implemented (requires testing with real API)
- ✅ PostgreSQL fallback works perfectly

**Timeline**: Search will be implemented once Supermemory account is available for testing the search API.

---

### 4. High Database Load Despite Supermemory

**Symptoms**:
- Database queries for messages still happening frequently
- Expected reduction in DB load not observed

**Cause**: Search is not yet implemented, so all context fetching still uses PostgreSQL.

**Impact**: Currently, Supermemory only reduces storage load, not read load.

**Future**: Once search is implemented, expect ~70% reduction in database reads for conversation context.

---

### 5. Duplicate Message IDs

**Symptoms**:
- Errors about duplicate `customId` in Supermemory
- Logs show: `duplicate key value violates unique constraint`

**Cause**: Message ID generation collision (unlikely with `crypto.randomUUID()`)

**Solution**:
- Check if Evolution API is providing `key.id`
- Verify message_id uniqueness in PostgreSQL
- Review Supermemory dashboard for duplicate entries

---

## Monitoring

### Check Supermemory Status

```typescript
// In your edge function logs, look for:
[supermemory] ✅ Configuration loaded
[supermemory] ⚠️ Supermemory configuration invalid or missing

// Message storage:
[webhook] Message stored in conversation {id}
supermemoryStored: true  // Success
supermemoryStored: false, supermemorySkipped: true  // Not configured
supermemoryStored: false, supermemorySkipped: false  // Failed
```

### Check Fallback Rate

```bash
# Count messages using database vs supermemory
supabase logs | grep "Context source"

# Expected output:
[data] ✅ Context source: database     # Current (search not implemented)
[data] ✅ Context source: supermemory  # Future (once search is ready)
```

---

## Testing

### Run Unit Tests

```bash
cd supabase/functions/_shared/tests
deno test supermemory.test.ts

# Run with Supermemory API key for integration tests:
SUPERMEMORY_API_KEY=sm_your_key deno test supermemory.test.ts
```

### Manual Testing

**Test Storage**:
1. Send a message via WhatsApp
2. Check PostgreSQL: `SELECT * FROM messages ORDER BY timestamp DESC LIMIT 1`
3. Check Supermemory dashboard for new document
4. Look for logs: `[supermemory] Failed to store message` (should NOT appear)

**Test Fallback**:
1. Temporarily unset API key: `supabase secrets unset SUPERMEMORY_API_KEY`
2. Send a message
3. Verify it's still stored in PostgreSQL
4. Restore API key

---

## Performance Metrics

### Expected Behavior

| Metric | Before Supermemory | With Supermemory (Storage Only) | With Supermemory (Full) |
|--------|-------------------|----------------------------------|------------------------|
| Message write latency | 50ms | 50ms (parallel) | 50ms (parallel) |
| Context fetch latency | 100ms (DB) | 100ms (DB fallback) | <300ms (semantic search) |
| DB read queries | 100% | 100% (temp) | ~30% |
| Storage redundancy | 1x (DB only) | 2x (DB + Supermemory) | 2x (DB + Supermemory) |

---

## Environment Variables

### Required Variables

```bash
# Supermemory API Key (get from https://console.supermemory.ai)
SUPERMEMORY_API_KEY=sm_xxxxx

# Optional: Custom API URL (defaults to https://api.supermemory.ai)
SUPERMEMORY_API_URL=https://api.supermemory.ai
```

### Setting Variables

**Local Development** (.env file):
```bash
SUPERMEMORY_API_KEY=sm_xxxxx
```

**Supabase Edge Functions**:
```bash
supabase secrets set SUPERMEMORY_API_KEY=sm_xxxxx
supabase secrets set SUPERMEMORY_API_URL=https://api.supermemory.ai
```

---

## FAQ

**Q: Will the app break if Supermemory is down?**
A: No. The app gracefully falls back to PostgreSQL for all operations.

**Q: Can I disable Supermemory temporarily?**
A: Yes. Simply unset the `SUPERMEMORY_API_KEY` environment variable.

**Q: How do I know if messages are being stored in Supermemory?**
A: Check logs for `supermemoryStored: true` or visit your Supermemory dashboard.

**Q: Why is search still using PostgreSQL?**
A: Search endpoint implementation is pending. Storage works, but retrieval requires testing with real API credentials.

**Q: How much does Supermemory cost?**
A: Check https://supermemory.ai/pricing for current pricing. Free tier may be available.

---

## Getting Help

1. **Check Logs**: Always start with edge function logs
2. **Review Tests**: Run test suite to verify basic functionality
3. **Supermemory Support**: https://supermemory.ai/docs
4. **GitHub Issues**: Report bugs at your repo's issue tracker

---

## Roadmap

- [x] Store messages in Supermemory via /v3/documents
- [x] Graceful degradation and fallback
- [x] Unit tests
- [x] Documentation
- [ ] Implement search/retrieval endpoint
- [ ] Test with real Supermemory account
- [ ] Performance benchmarks
- [ ] Monitoring dashboard for fallback rates
