# v0 sandbox and external-dependency boundary

- Seller verification uses real validation, encrypted fields, private documents,
  audit history, and approval states. `SYMBIOS_SANDBOX` does not contact GST,
  PAN, identity, bank, or warehouse providers.
- Transactions use an internal sandbox payment record. No funds, escrow,
  settlement, tax filing, or provider webhook is represented.
- The v0 fee policy is versioned as `fees-v1.0`: buyer platform fee 1% and seller
  platform fee 2%. Tax is deliberately zero in sandbox and carries an explicit
  “not calculated” note.
- Generated PDFs are sandbox commercial documents, not legally valid GST tax
  invoices.
- Real GST/PAN/KYC/bank verification, an Indian B2B payment/escrow provider,
  signed webhooks, settlement, GST/TDS logic, invoice/legal review, and
  regulatory counsel remain external launch dependencies.
- Onboarding PDFs are private, active-content screened, and assigned a configurable
  retention deadline. `npm run onboarding:cleanup-documents` removes expired
  documents only from rejected/corrections-required records.
