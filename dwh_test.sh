#!/bin/bash
PGPASSWORD=5324 psql -h 172.16.75.97 -U biusr -d dwh -c '
SELECT "No.", "Document Type", "Sell-to Customer No.", "Posting Date", "Currency Code", "Currency Factor"
FROM ss01.salesheader_v
WHERE "Document Type" = '\''Order'\'' AND "Posting Date" >= CURRENT_DATE - INTERVAL '\''12 month'\''
LIMIT 5;
'
