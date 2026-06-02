#!/bin/bash
echo "=== Sales Headers & Lines Diagnostics ==="
echo -n "Total dwh_sales_headers: "
PGPASSWORD=vnc_pass_2026 psql -h localhost -U vnc_user -d products_db -t -c "SELECT count(*) FROM dwh_sales_headers;"
echo -n "Total dwh_sales_lines: "
PGPASSWORD=vnc_pass_2026 psql -h localhost -U vnc_user -d products_db -t -c "SELECT count(*) FROM dwh_sales_lines;"

echo "=== Document Types in Headers ==="
PGPASSWORD=vnc_pass_2026 psql -h localhost -U vnc_user -d products_db -c "SELECT document_type, count(*), length(document_type) FROM dwh_sales_headers GROUP BY document_type;"

echo "=== Document Types in Lines ==="
PGPASSWORD=vnc_pass_2026 psql -h localhost -U vnc_user -d products_db -c "SELECT document_type, count(*), length(document_type) FROM dwh_sales_lines GROUP BY document_type;"

echo "=== Matches on Document No only ==="
PGPASSWORD=vnc_pass_2026 psql -h localhost -U vnc_user -d products_db -t -c "SELECT count(*) FROM dwh_sales_headers h JOIN dwh_sales_lines l ON h.no = l.document_no;"

echo "=== Matches on Document No and Type ==="
PGPASSWORD=vnc_pass_2026 psql -h localhost -U vnc_user -d products_db -t -c "SELECT count(*) FROM dwh_sales_headers h JOIN dwh_sales_lines l ON h.no = l.document_no AND h.document_type = l.document_type;"

echo "=== Sample Headers ==="
PGPASSWORD=vnc_pass_2026 psql -h localhost -U vnc_user -d products_db -c "SELECT no, document_type FROM dwh_sales_headers LIMIT 5;"

echo "=== Sample Lines ==="
PGPASSWORD=vnc_pass_2026 psql -h localhost -U vnc_user -d products_db -c "SELECT document_no, document_type FROM dwh_sales_lines LIMIT 5;"
