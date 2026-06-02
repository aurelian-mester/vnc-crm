#!/bin/bash
echo "=== Count of synced products by item_category_code ==="
PGPASSWORD=vnc_pass_2026 psql -h localhost -U vnc_user -d products_db -c "
SELECT item_category_code, count(*) 
FROM products 
GROUP BY item_category_code 
ORDER BY count(*) DESC;
"

echo "=== Total items count in local products table ==="
PGPASSWORD=vnc_pass_2026 psql -h localhost -U vnc_user -d products_db -c "
SELECT count(*) FROM products;
"

echo "=== Check if any board grades (CO.STRUCTURI) exist in products ==="
PGPASSWORD=vnc_pass_2026 psql -h localhost -U vnc_user -d products_db -c "
SELECT id, description, item_category_code 
FROM products 
WHERE item_category_code = 'CO.STRUCTURI' 
LIMIT 5;
"

echo "=== Check if any articles (CO.PLACI, CO.CUTII, CO.TIP2, CO.VAL) exist in products ==="
PGPASSWORD=vnc_pass_2026 psql -h localhost -U vnc_user -d products_db -c "
SELECT id, description, item_category_code 
FROM products 
WHERE item_category_code IN ('CO.PLACI', 'CO.CUTII', 'CO.TIP2', 'CO.VAL') 
LIMIT 5;
"
