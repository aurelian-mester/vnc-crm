#!/bin/bash
echo "=== Manual Refresh ==="
PGPASSWORD=vnc_pass_2026 psql -h localhost -U vnc_user -d products_db -c "REFRESH MATERIALIZED VIEW mv_customer_order_metrics;"
echo -n "New count: "
PGPASSWORD=vnc_pass_2026 psql -h localhost -U vnc_user -d products_db -t -c "SELECT count(*) FROM mv_customer_order_metrics;"
