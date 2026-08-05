# DESIGN.md

Design system reference for the monorepo UI template. This document is the source of truth for any agent generating or modifying UI code in this repo. Follow it exactly — do not invent new tokens, spacing values, or component patterns without updating this file first.

---

## 1. Stack

- **Styling**: Tailwind CSS (utility classes) + CSS custom properties for theme values. No CSS-in-JS.
- **Components**: unstyled/copy-paste headless architecture (shadcn/ui pattern). Components live in the app, not in a black-box package — agents should expect to read and edit component source directly.
- **Fonts**: `Inter` (UI text), `JetBrains Mono` (data, labels, code-adjacent content).
- **Icons**: inline SVG, `stroke-width="2"`, `stroke="currentColor"`, no icon font.

---

## 2. Design direction: "Structured Console"

The product is developer-facing tooling (admin/config surfaces for a monorepo starter), not a consumer SaaS. Visual language should read as a **console, not a marketing app**:

- Visible borders over soft shadows.
- Monospace for anything that is data, an identifier, a status, or a count.
- Sans-serif (Inter) for prose, labels, and navigation.
- Sharp-ish corners (`rounded` / `rounded-md`, 4–6px). Never use `rounded-2xl`/`rounded-3xl` in this direction — that belongs to a different, softer variant not used here.
- Density is tighter than a typical consumer dashboard: prefer `px-4 py-2` / `py-1.5` over `p-6`.

Do not drift toward "soft/elevated" (large radii, drop shadows, gradients) or "generic SaaS" (marketing-style hero cards, illustration-heavy empty states) — those were explicitly rejected in favor of this direction.

---

## 3. Color tokens

All colors are CSS variables on `:root`, overridden under `.dark`. **Never hardcode hex values in components** — always reference the variable.

```css
:root {
  --bg: #f4f4f5; /* page background */
  --card: #ffffff; /* surface background: cards, table, header, dropdowns */
  --border: #d4d4d8; /* all borders, dividers */
  --muted: #71717a; /* secondary text */
  --fg: #18181b; /* primary text */
  --sidebar: #ffffff; /* sidebar background */
  --primary: #4f46e5; /* accent: buttons, links, active states, focus rings */
  --primary-fg: #ffffff; /* text/icon color on top of --primary */
  --hover: #f4f4f5; /* row/item hover background */
  --active: #eef2ff; /* active nav item background */
}
.dark {
  --bg: #101012;
  --card: #18181b;
  --border: #3f3f46;
  --muted: #a1a1aa;
  --fg: #fafafa;
  --sidebar: #0a0a0b;
  --primary: #818cf8;
  --primary-fg: #0a0a0b;
  --hover: #232327;
  --active: #232327;
}
```

Utility classes used throughout components:

```css
.bg-card {
  background: var(--card);
}
.bg-sidebar {
  background: var(--sidebar);
}
.border-c {
  border-color: var(--border);
}
.text-muted {
  color: var(--muted);
}
.bg-primary {
  background: var(--primary);
}
.text-primary {
  color: var(--primary);
}
.text-primary-fg {
  color: var(--primary-fg);
}
.hover-bg:hover {
  background: var(--hover);
}
.active-bg {
  background: var(--active);
  color: var(--primary);
  border-left: 2px solid var(--primary);
}
```

Neutral scale is Tailwind **Zinc**. Accent is **Indigo**. Do not substitute Slate/Gray/Neutral for the neutral scale, and do not substitute Blue/Violet for the accent — this is a locked decision from the base theme.

### Status colors (badges, indicators)

Use Tailwind's semantic palette directly (not custom variables), always paired light/dark:

| Meaning                      | Light                         | Dark                                       |
| ---------------------------- | ----------------------------- | ------------------------------------------ |
| Success / Active / Live      | `bg-green-100 text-green-700` | `dark:bg-green-900/30 dark:text-green-400` |
| Warning / Pending / Building | `bg-amber-100 text-amber-700` | `dark:bg-amber-900/30 dark:text-amber-400` |
| Error / Failed / Inactive    | `bg-red-100 text-red-700`     | `dark:bg-red-900/30 dark:text-red-400`     |

Dark mode is native and toggled by adding/removing the `.dark` class on `<html>`. Never rely on `prefers-color-scheme` alone — the explicit toggle must work.

---

## 4. Typography

- Body/UI: `Inter`, weights 400/500/600/700.
- Data/mono: `JetBrains Mono`, weights 400/500. Apply via `.mono` class.

**Use mono for**: table cell values that are identifiers, counts, statuses, timestamps, code, file paths, version numbers, nav "workspace / project" breadcrumbs.
**Use Inter for**: headings, body copy, button labels, form labels, descriptions.

Type scale (Tailwind classes, don't introduce new sizes):

- Page title: `text-lg font-semibold` (dashboard) / `text-xl font-semibold` (auth screens)
- Section/card header: `font-medium text-sm`
- Body/table: `text-sm` default, `text-xs` for dense data tables
- Muted/meta text: `text-xs text-muted`

---

## 5. Layout architecture

### Desktop

- **Sidebar**: fixed width `w-60` (240px) expanded, `64px` collapsed. Collapse toggled via JS, animates `width` over `.2s ease`. Labels (`.nav-label`) are hidden via `display:none` when collapsed, not unmounted.
- **Header**: `h-14` (56px), `sticky top-0 z-20`, border-bottom, contains: mobile menu button (hidden on desktop), breadcrumb/workspace context, search input, right-aligned icon buttons + theme toggle + avatar.
- **Content**: scrollable independently of sidebar/header (`flex-1 overflow-y-auto`), padded `p-4 md:p-5`.

### Mobile (< md breakpoint)

- Sidebar is `hidden`. A slide-over (`#slideover`) mounts at `fixed top-0 left-0 h-full w-64`, starts `-translate-x-full`, and translates in on open. Backed by a click-to-close overlay (`bg-black/40`).
- Header shows a hamburger button that calls `openMobile()`.

Do not build a bottom tab bar or a right-side drawer for mobile nav — left slide-over is the locked pattern.

---

## 6. Component patterns

### Buttons

- Primary: `bg-primary text-primary-fg`, `rounded` (not pill), `text-xs` or `text-sm font-medium`, `px-3 py-1.5` (dense) or `px-4 py-2` (forms).
- Secondary/outline: `border border-c`, transparent background, same padding as primary.
- Always include a visible focus ring: `outline:2px solid var(--primary); outline-offset:1-2px` on `:focus-visible`.

### Cards / panels

`bg-card border border-c rounded` — that's it. No shadow by default. A card is a header row (`px-4 py-3 border-b border-c`) plus body content.

### Data tables

- Wrapped in a card. Header row: `text-left text-muted border-b border-c uppercase tracking-wide text-xs` (or `text-[10px]`).
- Sortable columns get a `↕` suffix in the header label — this is a static visual affordance in the template; wire up real sort handlers when integrating.
- Row: `border-b border-c hover-bg`, last row has no bottom border.
- Row actions: single `⋯` button, right-aligned, opens an absolutely-positioned dropdown (`hidden` by default, toggled via `toggleMenu()`), closed by clicking anywhere outside a `<td>`.
- Status is always a pill badge (see status colors above), never plain colored text.
- Footer: `px-4 py-2.5 border-t border-c flex items-center justify-between text-xs text-muted` with page indicator + Previous/Next buttons (`border border-c rounded`).
- Tables must be horizontally scrollable on mobile: wrap in a `div.overflow-x-auto`, never let the table force page-level horizontal scroll.

### Forms

- Stacked layout: `label` above `input`, always.
- `label`: `text-sm font-medium mb-1.5` (or `text-xs mono uppercase tracking-wide` for the console/mono variant).
- `input`: `w-full px-3 py-2 rounded border border-c bg-transparent text-sm`.
- Inline validation errors render directly below the relevant input (not implemented in the static template — reserve space below the input when wiring real forms).

### Overlays

- **Sheets (slide-overs)**: right-aligned, for create/edit forms. Not yet built in the reference files — when built, mirror the mobile-nav slide-over mechanics but anchored right and triggered from row/page actions.
- **Dialogs (modals)**: centered, reserved strictly for destructive/high-stakes confirmations. Do not use a modal for a create/edit form — that's a sheet's job.

### Feedback & states

- **Toasts**: global, for success/failure after an action. Not present in static template — add a fixed-position toast container when wiring real interactions.
- **Loading**: skeleton loaders (`.skeleton` shimmer class) for initial page/data load; spinner + disabled state on the button itself for in-flight actions.
- **Empty states**: muted icon + one line of text + a single primary CTA. No illustrations.

---

## 7. Spacing & density

- Base density is "comfortable" per the original brief, but this direction (Structured Console) runs tighter than that baseline: `py-1.5`–`py-2` for nav/table rows, `p-4`–`p-5` for card padding, not `p-6`+.
- Reserve `p-6`+ for auth screens and one-off empty-space contexts, not for dashboard chrome.

---

## 8. Content rules (for template/scaffold screens)

This is a **template**, not a finished product screen. Keep placeholder content generic and swappable:

- Nav labels: generic business-app nouns (Dashboard, Analytics, Customers, Orders, Settings) — not tied to any specific product narrative.
- Stat cards: `Metric one/two/three/four` style labels with a plausible number and a trend delta, not real KPIs.
- Table rows: `Item one/two/three…` with generic Status/Assignee/Date columns.
- Never hardcode a fictional product story (e.g. invented internal tools, fake ticket numbers, fake team members tied to a narrative) into the template — that content should come from whoever integrates the template, not from the template itself.

---

## 9. What NOT to do

- Don't mix in the "Soft Elevated" tokens (large radii, `shadow-xl`, gradient blobs) into Structured Console screens.
- Don't introduce a new neutral or accent color outside Zinc/Indigo.
- Don't use `localStorage`/`sessionStorage` for theme or UI state inside artifacts/sandboxed previews — use in-memory JS state or a class toggle only.
- Don't build new nav/layout patterns (top tab bars, right-side nav, bottom nav) without updating this file first.
