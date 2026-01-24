# Security Policy

This document outlines security practices and requirements for the Ganymede SDK.

## Dependencies

### Version Pinning
All dependencies use exact versions (no `^` or `~`) to ensure reproducible builds and prevent supply chain attacks. When updating dependencies:

1. Run `pnpm security:audit` to check for vulnerabilities
2. Review changelogs for breaking changes
3. Test thoroughly before updating
4. Update to exact version (remove `^`/`~`)

### Dependency Updates
- Regular audits: Run `pnpm security:audit` weekly
- Critical vulnerabilities: Update immediately
- Minor/patch updates: Review and update monthly

## npm Security

### Publisher Verification
- All npm publishers use 2FA
- Package updates reviewed before publishing
- Monitor for suspicious publishes

### Supply Chain Protection
- Avoid `latest` tag in CI
- Use `pnpm dedupe` to reduce duplicate packages
- Review `pnpm audit` output before deployments

## Development Security

### Local Development
- Never commit `.env` files with secrets
- Use environment variables for API keys
- Rotate RPC URLs and API keys regularly

### Production
- Use production RPC endpoints (not devnet for main operations)
- Validate all inputs server-side
- Implement rate limiting on API endpoints

## Reporting Vulnerabilities

To report a security vulnerability:
1. Do NOT open a public issue
2. Contact the maintainers directly
3. Provide detailed reproduction steps
4. Allow time for patch development before disclosure

## Best Practices

### Transaction Security
- Always use `skipPreflight: false` for production transactions
- Implement retry logic with exponential backoff
- Track `lastValidBlockHeight` for expiration handling
- Use ComputeBudgetProgram for predictable CU usage

### Payment Security
- Validate payment amounts against configurable limits
- Use idempotency keys to prevent duplicate payments
- Implement proper timeout handling
- Cache payment requirements when appropriate

### Wallet Security
- Validate wallet connection state before operations
- Check for required signing capabilities
- Never log private keys or seed phrases
- Use truncated addresses in logs for privacy
