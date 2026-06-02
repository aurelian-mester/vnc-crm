#!/bin/bash
cd ~/vnc-crm/backend

# Create sync_helper.go
cat << 'EOF' > sync_helper.go
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

# Run to get the token (ensure go is in PATH)
export PATH=$PATH:/usr/local/go/bin:/usr/bin
TOKEN=$(go run sync_helper.go)

echo "Triggering sync with token..."
curl -X POST -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8080/auth/sync
echo ""

# Clean up
rm sync_helper.go
