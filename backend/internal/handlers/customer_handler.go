package handlers

import (
	"encoding/json"
	"net/http"
	"vnc-crm/backend/internal/models"
)

var customers = []models.Customer{
	{ID: "1", Name: "Eco-Packaging Solutions", Contact: "John Doe", Email: "john@eco-pack.com", Phone: "+123456789"},
	{ID: "2", Name: "Global Boxes Ltd", Contact: "Jane Smith", Email: "jane@globalboxes.com", Phone: "+987654321"},
}

func GetCustomers(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(customers)
}
