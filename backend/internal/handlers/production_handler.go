package handlers

import (
	"encoding/json"
	"net/http"
	"vnc-crm/backend/internal/models"
)

var jobs = []models.ProductionJob{
	{ID: "J001", ProductID: "3", ProductName: "Standard Shipping Box A", CustomerID: "2", CustomerName: "Global Boxes Ltd", Quantity: 5000, Status: models.StatusPrinting, Priority: 1},
	{ID: "J002", ProductID: "1", ProductName: "Eco-Tissue 2-Ply", CustomerID: "1", CustomerName: "Eco-Packaging Solutions", Quantity: 10000, Status: models.StatusQueued, Priority: 2},
}

func GetProductionJobs(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(jobs)
}
