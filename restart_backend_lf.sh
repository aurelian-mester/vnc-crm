#!/bin/bash
cd ~/vnc-crm/backend

echo "Building services..."
go build -o api-gateway ./cmd/api_gateway/main.go
go build -o auth-service ./cmd/auth_service/main.go
go build -o crm-service ./cmd/crm_service/main.go
go build -o pricing-service ./cmd/pricing_service/main.go

echo "Restarting services..."
pkill api-gateway || true
pkill auth-service || true
pkill crm-service || true
pkill pricing-service || true

nohup ./api-gateway > gateway.log 2>&1 &
nohup ./auth-service > auth.log 2>&1 &
nohup ./crm-service > crm.log 2>&1 &
nohup ./pricing-service > pricing.log 2>&1 &

echo "Services started."
