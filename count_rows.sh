#!/bin/bash
echo "=== Count of sales invoice headers in last 12 months ==="
PGPASSWORD=5324 psql -h 172.16.75.97 -U biusr -d dwh -c "
SELECT COUNT(*) FROM ss01.salesinvoiceheader_v WHERE \"Posting Date\" >= CURRENT_DATE - INTERVAL '12 month';
"

echo "=== Count of sales invoice lines in last 12 months ==="
PGPASSWORD=5324 psql -h 172.16.75.97 -U biusr -d dwh -c "
SELECT COUNT(*) 
FROM ss01.salesinvoiceline_v l 
JOIN ss01.salesinvoiceheader_v h ON l.\"Document No.\" = h.\"No.\" 
WHERE h.\"Posting Date\" >= CURRENT_DATE - INTERVAL '12 month';
"

echo "=== Count of sales headers in last 12 months ==="
PGPASSWORD=5324 psql -h 172.16.75.97 -U biusr -d dwh -c "
SELECT COUNT(*) FROM ss01.salesheader_v WHERE \"Document Type\" = 'Order' AND \"Posting Date\" >= CURRENT_DATE - INTERVAL '12 month';
"

echo "=== Count of sales lines in last 12 months ==="
PGPASSWORD=5324 psql -h 172.16.75.97 -U biusr -d dwh -c "
SELECT COUNT(*) 
FROM ss01.salesline_v l 
JOIN ss01.salesheader_v h ON l.\"Document No.\" = h.\"No.\" AND l.\"Document Type\" = h.\"Document Type\"
WHERE h.\"Document Type\" = 'Order' AND h.\"Posting Date\" >= CURRENT_DATE - INTERVAL '12 month';
"
