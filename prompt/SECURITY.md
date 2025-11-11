# Security Policy

## Supported Versions

We take security seriously in the Conceive-Do project. This document outlines our security practices and how to report vulnerabilities.

| Version | Supported          |
| ------- | ------------------ |
| Latest  | :white_check_mark: |
| Older   | :x:                |

---

## Reporting a Vulnerability

If you discover a security vulnerability, please report it by emailing the maintainers directly. **Do not open a public issue** for security vulnerabilities.

### What to include in your report:

- Description of the vulnerability
- Steps to reproduce the issue
- Potential impact
- Suggested fix (if any)

We will respond to your report within 48 hours and work with you to address the issue.

---

## Security Best Practices

### Environment Variables

**NEVER commit sensitive credentials to Git!**

All sensitive configuration must be stored in environment variables:

- `SUPABASE_SERVICE_ROLE_KEY` - Full admin access (backend only!)
- `OPENAI_API_KEY` - OpenAI API credentials
- `EVOLUTION_API_KEY` - Evolution API credentials
- `WEBHOOK_SECRET` - Webhook HMAC validation secret

See [.env.example](.env.example) for the complete list of required environment variables.

### Supabase Security

1. **Row Level Security (RLS)**
   - All tables MUST have RLS policies enabled
   - Never disable RLS in production
   - Test policies thoroughly before deployment

2. **API Keys**
   - `SUPABASE_ANON_KEY` - Safe for frontend (respects RLS)
   - `SUPABASE_SERVICE_ROLE_KEY` - **Never expose in frontend!** Backend/Edge Functions only

3. **Edge Functions**
   - Use `Deno.env.get()` for all secrets
   - Configure secrets via: `supabase secrets set KEY=value`
   - Enable JWT verification for sensitive functions (see `supabase/config.toml`)

### Webhook Security

Our webhook handlers implement multiple security layers:

1. **HMAC Signature Validation**
   - All webhooks verify HMAC signatures using `WEBHOOK_SECRET`
   - See: `supabase/functions/_shared/webhook-security.ts`

2. **Rate Limiting**
   - Prevents DoS attacks
   - Configurable limits per endpoint

3. **Payload Validation**
   - Input validation on all webhook payloads
   - Size limits enforced

4. **HTTPS Only**
   - All webhooks must use HTTPS
   - SSRF prevention (no localhost/internal IPs)

### AI Auto-Reply Security

The AI auto-reply functionality (`supabase/functions/ai-auto-reply/`) implements:

1. **Prompt Injection Prevention**
   - Strict input sanitization
   - Context validation before sending to AI

2. **Data Privacy (RGPD/GDPR)**
   - No PII (Personally Identifiable Information) in prompts
   - Data minimization principles
   - Right to be forgotten compliance

3. **Rate Limiting**
   - Per-user quotas to prevent API abuse
   - Cost management for OpenAI API

4. **Error Handling**
   - Graceful fallbacks if AI API unavailable
   - No sensitive data leaked in error messages

### Authentication Security

1. **Password Security**
   - Supabase handles password hashing (bcrypt)
   - Password strength requirements enforced

2. **CSRF Protection**
   - Implemented via Supabase Auth

3. **Session Management**
   - JWT tokens with expiration
   - Secure token storage

4. **Password Reset**
   - One-time use tokens
   - Time-limited (15-60 minutes)
   - No user enumeration

### Frontend Security

1. **XSS Prevention**
   - All user input sanitized before rendering
   - No `dangerouslySetInnerHTML` without sanitization

2. **HTTPS Only**
   - Production must use HTTPS
   - Configured in Vercel/deployment platform

3. **Content Security Policy**
   - Restrictive CSP headers recommended
   - Configure in Vercel headers

### Database Security

1. **Connection Security**
   - Use Supabase client library (not direct PostgreSQL connections)
   - Connection pooling managed by Supabase

2. **SQL Injection Prevention**
   - Use parameterized queries
   - Supabase client handles escaping

3. **Backup Strategy**
   - Regular automated backups via Supabase
   - Test restoration procedures

---

## Deployment Security Checklist

Before deploying to production:

### Environment & Configuration
- [ ] All environment variables configured in deployment platform
- [ ] No secrets in source code
- [ ] `.env` files in `.gitignore`
- [ ] Production URLs updated (no localhost)
- [ ] HTTPS enforced

### Supabase
- [ ] RLS enabled on all tables
- [ ] RLS policies tested and validated
- [ ] Service role key never exposed to frontend
- [ ] Edge Functions secrets configured via Supabase CLI
- [ ] JWT verification enabled for sensitive functions
- [ ] Rate limiting configured

### API & Webhooks
- [ ] Webhook secrets configured and strong (32+ characters)
- [ ] HMAC validation active
- [ ] HTTPS-only webhooks
- [ ] Rate limiting active
- [ ] CORS properly configured
- [ ] API timeouts configured

### Monitoring & Logging
- [ ] Error tracking configured (Sentry, etc.)
- [ ] No sensitive data in logs
- [ ] Access logs enabled
- [ ] Alerting configured for suspicious activity

### Dependencies
- [ ] `npm audit` run and vulnerabilities fixed
- [ ] Dependencies up to date
- [ ] Dependabot enabled for security updates

---

## Security Tools

We use the following tools for security:

- **ESLint** - Code linting with security rules
- **SonarCloud** - Static code analysis
- **CodeRabbit** - AI-powered code review (when public)
- **GitHub Secret Scanning** - Automatic secret detection
- **Supabase RLS** - Row-level security policies
- **HMAC Signatures** - Webhook validation

---

## Compliance

### GDPR/RGPD Compliance

This application handles personal data and implements:

1. **Data Minimization**
   - Only collect necessary data
   - No unnecessary PII storage

2. **Right to Access**
   - Users can view their data

3. **Right to Deletion**
   - Account deletion functionality
   - Cascade deletion of personal data
   - See: `supabase/functions/delete-account/`

4. **Data Encryption**
   - HTTPS for all communications
   - Database encryption at rest (Supabase)

5. **Data Processing**
   - Limited processing of personal data
   - AI auto-reply processes messages (with user consent)

---

## Known Security Considerations

### Third-Party Services

This application integrates with:

1. **Supabase** - Backend-as-a-Service
   - Managed security by Supabase
   - Regular security audits by Supabase team

2. **OpenAI** - AI API
   - Data sent to OpenAI for AI responses
   - Review OpenAI's data usage policies

3. **Evolution API** - WhatsApp Integration
   - External service for WhatsApp messaging
   - Ensure Evolution API instance is secured

### Recommendations

- Review all third-party service security policies
- Ensure compliance with your jurisdiction's data laws
- Implement additional encryption if handling sensitive data
- Regular security audits recommended

---

## Updates

This security policy is updated regularly. Check back for the latest version.

**Last Updated**: 2025-11-03

---

## Contact

For security concerns, please contact the maintainers directly (do not open public issues for vulnerabilities).
