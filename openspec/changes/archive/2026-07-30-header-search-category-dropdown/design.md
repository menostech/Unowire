# Design: Header Search Category Dropdown

## Approach

Extend the existing `SearchBox` component with a category selector positioned to the left of the text input, inside the same `<form>`. Use a native `<select>` for accessibility and simplicity, styled to blend with the existing rounded input.

## Changes

### `frontend/components/shared/SearchBox.tsx`

1. Add a `category` state (`'cable' | 'equipment'`), defaulting to `'cable'`.
2. Add a `<select>` element positioned at the left inside the form, before the `<input>`. Use absolute positioning or a flex layout so the input's left padding accommodates the select width.
3. Update `handleSubmit` to route based on `category`:
   - `cable` → `/cables?q=` (existing behavior)
   - `equipment` → `/equipment?q=`
4. Update the `placeholder` based on `category`:
   - `cable` → "Search cable model, spec..." (existing)
   - `equipment` → "Search equipment model, brand..."
5. Adjust input left padding (`pl-28` or similar) to make room for the absolutely-positioned select, and add a right border separator between select and input.

### Layout details

- Form remains `relative`.
- `<select>` positioned absolutely at left (`absolute left-1 top-1/2 -translate-y-1/2`) with a small width (`w-24`), borderless, text-sm.
- Input gets increased left padding (`pl-28`) to avoid overlap.
- A thin vertical divider (`border-r border-gray-200`) separates the select from the input area.

## Alternatives considered

- **Tabs above input:** Rejected — takes more vertical space in the already compact header.
- **Separate search boxes:** Rejected — clutters the header and breaks the single-search mental model.
