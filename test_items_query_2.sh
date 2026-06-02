#!/bin/bash
echo "=== ITEM 3300902 DETAIL ==="
PGPASSWORD=5324 psql -h 172.16.75.97 -U biusr -d dwh -c "
SELECT \"No.\", \"Description\", \"Item Category Code\", \"Unit Price\" 
FROM ss01.item 
WHERE \"No.\" = '3300902';
"

echo "=== PRICELISTLINES FOR 3300902 ==="
PGPASSWORD=5324 psql -h 172.16.75.97 -U biusr -d dwh -c "
SELECT \"Price List Code\", \"Product No.\", \"Assign-to No.\", \"VAT Prod. Posting Group\", \"Unit Price\" 
FROM ss01.pricelistline_v 
WHERE \"Product No.\" = '3300902' 
LIMIT 5;
"
