#!/bin/bash
set -e

cd ~/vnc-crm

echo "=== Verification Script: Role-Based Sales Margin Pyramid ==="

# Set sales@vrancart.com role to 'ai'
echo "1. Setting sales@vrancart.com user role to 'ai'..."
PGPASSWORD=vnc_pass_2026 psql -w -h localhost -U vnc_user -d crm_db -c "UPDATE users SET role = 'ai' WHERE email = 'sales@vrancart.com';"

# Reset margins config to defaults
echo "2. Resetting margins config to default pyramid limits..."
PGPASSWORD=vnc_pass_2026 psql -w -h localhost -U vnc_user -d crm_db -c "UPDATE role_margins SET min_margin = 10.0, max_margin = 20.0 WHERE role = 'ai';"

# Create token generator program
cat << 'EOF' > backend/gen_tokens.go
package main

import (
	"fmt"
	"time"
	"github.com/golang-jwt/jwt/v5"
)

func main() {
	// 1. AI token
	aiToken := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"email":            "sales@vrancart.com",
		"name":             "Test Sales Agent",
		"role":             "ai",
		"salesperson_code": "AM",
		"exp":              time.Now().Add(time.Hour * 2).Unix(),
	})
	aiTokenStr, _ := aiToken.SignedString([]byte("vnc-crm-secret-key-2026"))

	// 2. Admin token
	adminToken := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"email":            "aurelian.mester@vrancart.com",
		"name":             "Aurelian Mester",
		"role":             "admin",
		"salesperson_code": "AM",
		"exp":              time.Now().Add(time.Hour * 2).Unix(),
	})
	adminTokenStr, _ := adminToken.SignedString([]byte("vnc-crm-secret-key-2026"))

	fmt.Printf("%s\n%s\n", aiTokenStr, adminTokenStr)
}
EOF

export PATH=$PATH:/usr/local/go/bin:/usr/bin
TOKENS=$(cd backend && go run gen_tokens.go && rm gen_tokens.go)

AI_TOKEN=$(echo "$TOKENS" | sed -n '1p')
ADMIN_TOKEN=$(echo "$TOKENS" | sed -n '2p')

# Define custom box items for quote submission
# Custom item with 5% margin (price = 0.3287, cost = 0.3122)
QUOTE_5_PCT='{
  "customer_id": "C000803",
  "status": "Draft",
  "items": [
    {
      "product_id": "",
      "description": "Custom Box 5% Margin",
      "quantity": 1000,
      "unit_price": 0.3287,
      "config_params": "{\"length\":400,\"width\":300,\"height\":200,\"quantity\":1000,\"material\":\"Testliner\",\"printing\":false,\"dieCutting\":false,\"gluing\":true,\"stapling\":false}"
    }
  ]
}'

# Custom item with 15% margin (price = 0.3673, cost = 0.3122)
QUOTE_15_PCT='{
  "customer_id": "C000803",
  "status": "Draft",
  "items": [
    {
      "product_id": "",
      "description": "Custom Box 15% Margin",
      "quantity": 1000,
      "unit_price": 0.3673,
      "config_params": "{\"length\":400,\"width\":300,\"height\":200,\"quantity\":1000,\"material\":\"Testliner\",\"printing\":false,\"dieCutting\":false,\"gluing\":true,\"stapling\":false}"
    }
  ]
}'

echo "3. Attempting to submit a quote with 5% margin (should FAIL)..."
HTTP_STATUS=$(curl -s -o response.json -w "%{http_code}" -X POST -H "Authorization: Bearer $AI_TOKEN" -H "Content-Type: application/json" -d "$QUOTE_5_PCT" http://127.0.0.1:8080/quotes)

echo "Response code: $HTTP_STATUS"
cat response.json
echo ""
if [ "$HTTP_STATUS" -ne 400 ]; then
  echo "ERROR: Expected 400 Bad Request, got $HTTP_STATUS"
  exit 1
fi
echo "Result: Success (Failed as expected)"

echo "4. Attempting to submit a quote with 15% margin (should SUCCEED)..."
HTTP_STATUS=$(curl -s -o response.json -w "%{http_code}" -X POST -H "Authorization: Bearer $AI_TOKEN" -H "Content-Type: application/json" -d "$QUOTE_15_PCT" http://127.0.0.1:8080/quotes)

echo "Response code: $HTTP_STATUS"
cat response.json
echo ""
if [ "$HTTP_STATUS" -ne 200 ]; then
  echo "ERROR: Expected 200 OK, got $HTTP_STATUS"
  exit 1
fi
echo "Result: Success (Created successfully)"

echo "5. Updating 'ai' role margins limit to 5.0% - 25.0% as Admin..."
UPDATE_BODY='{"role": "ai", "min_margin": 5.0, "max_margin": 25.0}'
HTTP_STATUS=$(curl -s -o response.json -w "%{http_code}" -X PUT -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" -d "$UPDATE_BODY" http://127.0.0.1:8080/auth/margins)

echo "Response code: $HTTP_STATUS"
cat response.json
echo ""
if [ "$HTTP_STATUS" -ne 200 ]; then
  echo "ERROR: Expected 200 OK, got $HTTP_STATUS"
  exit 1
fi
echo "Result: Success (Limits updated)"

echo "6. Retrying the 5% margin quote submission as 'ai' (should now SUCCEED)..."
HTTP_STATUS=$(curl -s -o response.json -w "%{http_code}" -X POST -H "Authorization: Bearer $AI_TOKEN" -H "Content-Type: application/json" -d "$QUOTE_5_PCT" http://127.0.0.1:8080/quotes)

echo "Response code: $HTTP_STATUS"
cat response.json
echo ""
if [ "$HTTP_STATUS" -ne 200 ]; then
  echo "ERROR: Expected 200 OK, got $HTTP_STATUS"
  exit 1
fi
echo "Result: Success (Created successfully after limits adjustment)"

# Restore sales@vrancart.com role to 'sales'
echo "7. Restoring sales@vrancart.com user role to 'sales'..."
PGPASSWORD=vnc_pass_2026 psql -w -h localhost -U vnc_user -d crm_db -c "UPDATE users SET role = 'sales' WHERE email = 'sales@vrancart.com';"

echo "=== All checks passed successfully! Verification completed. ==="
rm response.json
