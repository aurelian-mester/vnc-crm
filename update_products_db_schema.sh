#!/bin/bash
echo "Updating products_db schema..."
PGPASSWORD=vnc_pass_2026 psql -h localhost -U vnc_user -d products_db -c "
ALTER TABLE price_lists ADD COLUMN IF NOT EXISTS assign_to_type VARCHAR(50);
ALTER TABLE price_lists ADD COLUMN IF NOT EXISTS assign_to_no VARCHAR(50);
"
echo "Schema updated."
