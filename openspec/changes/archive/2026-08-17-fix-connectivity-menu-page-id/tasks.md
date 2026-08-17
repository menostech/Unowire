# Tasks: Fix connectivity menu page_id

- [x] T1: Add 13 missing page_ids to `ALLOWED_PAGE_IDS` in `backend/app/crud/menu.py`
- [x] T2: Create Alembic migration to rename terminal→connectivity menu rows in `admin_menu_items`
- [x] T3: Run migration + seed locally to verify connectivity menu appears and manual add works
- [x] T4: Run existing admin menu tests to confirm no regression
