#!/bin/bash
PGPASSWORD=vnc_pass_2026 psql -h 127.0.0.1 -U vnc_user -d products_db -c "
SELECT id, description, unit_price FROM products WHERE id = '3300902';
"
