# Tasks: Header Search Category Dropdown

## Frontend

- [x] 1. Add category state (`'cable' | 'equipment'`, default `'cable'`) and a `<select>` dropdown to the left of the input in `frontend/components/shared/SearchBox.tsx`
- [x] 2. Wire `handleSubmit` to route to `/cables?q=` when category is `cable` and `/equipment?q=` when category is `equipment`; update the input `placeholder` per category
- [x] 3. Adjust input left padding and add a visual separator between the dropdown and input so the layout matches the existing header aesthetic
- [ ] 4. Manual verification: on `/cables` and `/equipment` pages, confirm the header search box category dropdown selects and routes correctly, and the placeholder updates per category
