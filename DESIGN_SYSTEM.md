# Symbi-OS Design System

A design language for an industrial B2B scrap-materials marketplace. The people
using it are procurement managers and yard operators comparing tonnages and
prices, often on an Android phone, often in a hurry. Confidence comes from
typography, spacing, and one decisive action colour — not from ornament.

**No gradients, glassmorphism, neon, or trend-chasing.** If a surface needs to
feel important, it earns that with hierarchy and space.

Review the whole kit at [`/style-guide`](app/style-guide/page.tsx).

---

## Type

| Role | Face | CSS variable | Tailwind |
| --- | --- | --- | --- |
| Display, headings | Manrope | `--font-display` | `font-display` |
| Body, UI, tables | IBM Plex Sans | `--font-sans` | `font-sans` |

Both are loaded through `next/font/google` in `app/layout.tsx`, so they are
self-hosted and carry no layout shift.

`h1`–`h6` pick up the display face automatically via `globals.css`. Never set
`font-display` on body copy.

### Tabular figures are global

`body` sets `font-variant-numeric: tabular-nums` and `font-feature-settings:
"tnum"`. Every digit occupies the same width, so quantity and price columns
align and a value never changes width as it updates — which matters on a page
listing 24 quantities.

Opt out with `.prose-numerals` for long prose, where proportional figures read
better. `Textarea` already does this.

---

## Colour

Three ramps carry the product. Each has one job; using them interchangeably is
the fastest way to make the interface look generic.

### Copper — the commit action

`copper-700 #C2410C`, hover `copper-800 #9A3412`.

The only colour that means *"this button completes the transaction."* Submit,
accept an offer, publish a listing, pay. **One primary action per view.**

Never use copper decoratively — not for headers, icons, borders, illustrations,
or emphasis. Its authority comes entirely from being rare. The one exception is
`Badge tone="copper"`, which means "you owe an action here" and should stay
uncommon.

### Brand emerald — trust

`brand.DEFAULT #0F6E56`, ramp 50–900.

Verification, brand marks, and successful terminal states. It reassures; it
never asks for a click. A verified-seller badge is emerald. The button next to
it is copper.

### Ink (stone) — everything else

`ink-900 #1C1917` down to `ink-50`. Warm gray, chosen to sit with the paper
surface; a cool gray reads as cheap against `#F4F2ED`.

| Token | Use |
| --- | --- |
| `ink-900` | Primary text, headings |
| `ink-700` | Body text, secondary labels |
| `ink-500` | Hints, metadata, placeholders |
| `ink-300` | Dashed borders, disabled text |
| `ink-200` | **Every 1px border in the product** |
| `ink-100` / `ink-50` | Hover fills on ghost controls |

### Surface

| Token | Hex | Use |
| --- | --- | --- |
| `surface-page` | `#F4F2ED` | Page background |
| `surface-card` | `#FFFFFF` | Cards, inputs, modals |
| `surface-sunken` | `#EDEAE3` | Wells, summaries, footers, disabled inputs |

### Status

| Token | Hex | Meaning |
| --- | --- | --- |
| `success` | `#0F6E56` | Settled and good — active, paid, delivered |
| `warning` | `#D97706` | In flight — someone still owes an action |
| `danger` | `#DC2626` | Failed or contested — `INVENTORY_CONFLICT`, disputes |

Each has `-subtle` (fill), `-border`, and `-strong` (text) variants so a pill
never needs a hand-mixed opacity.

**Colour is never the only signal.** `StatusPill` always renders a text label
and a non-chromatic dot alongside the tone.

---

## Shape and elevation

| Token | Value | Use |
| --- | --- | --- |
| `rounded-control` | 8px | Buttons, inputs, selects, tags |
| `rounded-card` | 12px | Cards, modals |
| `rounded-full` | pill | Badges, status pills, avatars |

Borders are always `1px solid ink-200`. Elevation is a hairline plus a short
shadow — `shadow-card`, `shadow-raised`, `shadow-overlay`. Never a glow.

---

## Motion

Motion marks a **state change**. It never decorates, and it is never the only
way something is communicated.

| Token | Duration | Use |
| --- | --- | --- |
| `--motion-fast` | 120ms | Hover, colour transitions |
| `--motion-base` | 180ms | Modal, toast enter/exit |
| `--motion-slow` | 240ms | List reorder |

Easing is `cubic-bezier(0.16, 1, 0.3, 1)` throughout.

**`prefers-reduced-motion` is honoured two ways:** `globals.css` collapses all
animation and transition durations, and `Modal` and `Toast` additionally call
framer-motion's `useReducedMotion()` to drop transform-based entrances rather
than merely speeding them up. Because motion is never load-bearing, removing it
costs nothing.

---

## Accessibility contract

Every component in `components/ui/` meets these. Keep it that way.

- **Focus.** A copper `2px` ring at `2px` offset, set once in `globals.css` on
  `:focus-visible`. Never remove it — replace it if you must.
- **Icon-only buttons** use `IconButton`, where `label` is required and becomes
  the accessible name.
- **Form controls** are wired to their label, hint, and error by `id` through
  `Field`, so the association survives any layout change. Errors carry
  `role="alert"` and `aria-invalid`.
- **Modal** traps Tab, closes on Escape, locks body scroll, and restores focus
  to the trigger on close.
- **Toast** is `aria-live="polite"` — it never interrupts. Errors that must
  interrupt belong inline on the control that failed.
- **Keyboard.** Everything interactive is reachable and operable by keyboard.

---

## Component API

Import from the barrel: `import { Button, Card } from "@/components/ui";`

### Button / IconButton

```tsx
<Button variant="primary" size="md" loading={false}>Accept offer</Button>
<IconButton icon={<Filter />} label="Filter results" variant="ghost" />
```

| Prop | Values | Default |
| --- | --- | --- |
| `variant` | `primary` \| `secondary` \| `ghost` \| `danger` | `secondary` |
| `size` | `sm` \| `md` \| `lg` | `md` |
| `loading` | swaps in a spinner, blocks interaction, sets `aria-busy` | `false` |
| `leadingIcon` / `trailingIcon` | `ReactNode` | — |
| `fullWidth` | stretches to container | `false` |

`variant` defaults to `secondary` deliberately: primary must be a conscious
choice, not what you get by forgetting.

### Input / Select / Textarea

All three share `label`, `hint`, `error`, `required`, and `containerClassName`,
and forward refs to the native element. `error` replaces `hint` when present.

```tsx
<Input label="Quantity" type="number" suffix="ton" hint="Minimum order 5 ton." />
<Input label="Search" leadingIcon={<Search />} />
<Select label="Category"><option value="metal">Metal Scrap</option></Select>
<Textarea label="Description" rows={4} />
```

`Select` is a native `<select>` — correct for keyboard and screen readers for
free, and it renders as the platform picker on Android.

### Card

```tsx
<Card tone="card" interactive={false}>
  <CardHeader title="…" description="…" action={<StatusPill status="ACTIVE" />} />
  <CardBody>…</CardBody>
  <CardFooter>…</CardFooter>
</Card>
```

`tone="sunken"` for wells and summaries. Set `interactive` only when the card
itself is a link or button.

### StatusPill

```tsx
<StatusPill status="AWAITING_BUYER_CONFIRMATION" />  // → "Awaiting buyer confirmation"
```

The single source of truth for lifecycle colour across listings, offers,
orders, payments, and onboarding. Lookup is case-insensitive, so legacy
lowercase `active` rows still map correctly; unknown statuses fall back to
neutral.

**Add new statuses to the map in `StatusPill.tsx`, never colour them at a call
site** — otherwise the same status ends up two colours in two places.
`statusTone()` and `statusLabel()` are exported for tables that need the tone
without the pill.

### Badge vs Tag

- **`Badge`** — system-authored, read-only fact. "Verified seller", "54
  listings". Tones: `neutral`, `brand`, `success`, `warning`, `danger`,
  `copper`.
- **`Tag`** — user-controlled token. An applied filter or selected category.
  Pass `onRemove` and `label` for a dismissible chip.

For lifecycle state use `StatusPill`, not `Badge`.

### Modal

```tsx
<Modal open={open} onClose={close} title="Place a bid" description="…"
       size="md" dismissible footer={<><Button variant="ghost">Cancel</Button>
       <Button variant="primary">Place bid</Button></>}>
  …
</Modal>
```

Put the primary commit action **last** in `footer`. Set `dismissible={false}`
for destructive confirmations that need a deliberate choice — it removes the
close button and disables Escape and backdrop dismissal.

### Toast

```tsx
const { toast } = useToast();
toast({ tone: "success", title: "Listing published", description: "…" });
```

Requires `<ToastProvider>` above it. Tones: `info`, `success`, `warning`,
`danger`. Auto-dismisses after 5s — **except `danger`, which persists**, because
a failed action must not vanish before it is read.

> Not yet mounted globally. Wrap `components/Providers.tsx` with
> `<ToastProvider>` during the surface migration; `/style-guide` mounts its own
> for now.

### Skeleton / EmptyState / Spinner

```tsx
<Skeleton className="h-4 w-32" />        <SkeletonCard />
<SkeletonRows rows={5} columns={4} />    <Spinner size="md" />

<EmptyState icon={<PackageSearch />} title="No listings match these filters"
            description="Widening the radius usually helps."
            action={<Button variant="primary" size="sm">Clear filters</Button>} />
```

A skeleton must have the same footprint as the content it replaces, or the
layout jumps on load. `SkeletonRows` should get the real column count.

`EmptyState` descriptions say **why** it is empty and **what to do next** —
never just "No results".

`Spinner` takes `label={null}` when a parent already provides the accessible
name; otherwise it announces "Loading".

---

## Conventions

- `cn()` from `@/lib/cn` (clsx + tailwind-merge) is the only class utility, so
  consumer overrides win over defaults.
- Components forward refs and spread the rest of their props to the underlying
  element.
- `"use client"` only where interactivity or motion requires it — `Card`,
  `Badge`, `Skeleton`, `EmptyState`, and `Spinner` stay server-renderable.
