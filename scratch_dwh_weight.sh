#!/bin/bash
PGPASSWORD=5324 psql -h 172.16.75.97 -U biusr -d dwh -c "
SELECT \"No.\", \"Quantity\", \"Net Weight\", \"Gross Weight\", \"Amount\"
FROM ss01.salesinvoiceline_v
WHERE \"Quantity\" > 0 AND \"Net Weight\" > 0
LIMIT 5;
"
