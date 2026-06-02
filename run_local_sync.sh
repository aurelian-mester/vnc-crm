#!/bin/bash
export PATH=$PATH:/usr/local/go/bin:/usr/bin
cd ~/vnc-crm/backend
go run local_sync.go
rm local_sync.go
