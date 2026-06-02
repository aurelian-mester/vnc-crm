#!/bin/bash
cd ~/vnc-crm/backend

cat << 'EOF' > test_helper.go
package main
import (
	"fmt"
	"time"
	"github.com/golang-jwt/jwt/v5"
)
func main() {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"email": "aurelian.mester@vrancart.com",
		"name":  "Aurelian Mester",
		"role":  "admin",
		"exp":   time.Now().Add(time.Hour * 2).Unix(),
	})
	tokenString, _ := token.SignedString([]byte("vnc-crm-secret-key-2026"))
	fmt.Println(tokenString)
}
EOF

export PATH=$PATH:/usr/local/go/bin:/usr/bin
TOKEN=$(go run test_helper.go)
rm test_helper.go

echo "=== FIRST 200 CHARACTERS ==="
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8080/customers | head -c 200
echo ""
