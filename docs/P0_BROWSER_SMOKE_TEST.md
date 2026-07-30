# P0 local browser smoke-test evidence

Date: 30 July 2026

Environment: local Next.js development server, migrated SQLite database, real
India public-provider listing records, sandbox verification/payment flags, and
the in-app Chromium browser.

Verified:

- Registration creates an authenticated buyer-and-seller account and routes to
  the live marketplace.
- The marketplace renders real imported supplier/listing data without console
  errors.
- Provider thumbnails retry the provider's legacy JPG format and fall back to a
  neutral local placeholder; the final rendered page had zero broken images.
- The marketplace has no document-level horizontal overflow at 360×740 or
  412×915.
- The seller listing page has no document-level horizontal overflow at
  360×740, 390×844, or 412×915.
- The seller listing form exposes the full material, price, quantity,
  availability, dispatch, photo, private-document, and declaration contract.
- Three native file inputs are present: listing photos, test reports, and
  certificates.
- At 360×740 and 412×915 the submit and save-draft controls remain inside the
  visible viewport.

Remaining device-specific verification: physical Android Chrome keyboard-open
behavior, native camera/gallery/file picker behavior, assistive technology, and
formal contrast/touch-target audit.
