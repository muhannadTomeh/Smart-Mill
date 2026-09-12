# Product Recommendations

## A. Must have before delivery

1. **Tenant/RLS certification.** Problem: repository history mixes user-owned and mill-owned records. Solution: inspect deployed policies/functions and enforce active membership on all business data. Value: prevents data leaks; complexity L; risk P0.
2. **One financial read model.** Problem: cash, reports and source-table totals can disagree. Solution: retain operation records but derive financial reports/session expected cash from one append-only ledger with reversals. Value: trustworthy daily close; complexity L; risk P0.
3. **Complete stock and oil ownership.** Problem: product sales are not integrated with stock and oil ownership is ambiguous. Solution: invoice lines/stock OUT atomically; separate mill/customer oil movements. Value: prevents loss of stock/customer oil; complexity L; risk P1.
4. **Harden privileged credential reveal.** Problem: support requires Platform Admin to reveal current account passwords and Admin PINs, creating a sensitive decryption path. Solution: retain the Credential Vault; enforce AES-256-GCM only in Edge Functions with a secret-held key, server-side Platform Admin authorization, masked/explicit/time-limited reveal UI, rate limiting and audit records without secrets. Value: preserves required support while containing exposure; complexity M; risk P1.
5. **Reliable commands.** Problem: some cross-record actions occur in client sequence. Solution: RPC commands with locks/idempotency and explicit reversal policy. Value: avoids partial/duplicate records; complexity L; risk P1.

## B. Should have

- Make daily movement a read-only view from ledgers; retire manual synchronization. Complexity M, low risk.
- Present a plain-language owner overview: cash on hand, drawer expected, receivables, supplier payables, partner dues, product stock and mill oil. Complexity M.
- Archive rather than delete masters with historical use; show statement history for customer/supplier/partner/worker. Complexity M.
- Validate mobile critical flows with large numeric keypad targets and Arabic error messages. Complexity S–M.

## C. Nice to have

- Thermal receipt resilience, barcode-assisted product sale, export to accountant, notification/reminders and offline queue capture. These help operations but should follow correctness work.

## D. Do not build / overkill

- Full chart-of-accounts ERP, tax/payroll engine, owner account switching/multi-mill operational UI, automatic midnight drawer close, and treating oil as generic retail stock. Each adds complexity or contradicts the product’s simple operating model.
