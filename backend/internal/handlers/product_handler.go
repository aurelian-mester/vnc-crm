package handlers

import (
	"encoding/json"
	"net/http"
	"vnc-crm/backend/internal/models"
)

var products = []models.Product{
	{ID: "1", Name: "Eco-Tissue 2-Ply", Type: models.TypeTissue, Material: "Recycled Paper", Grammage: 35},
	{ID: "2", Name: "Testliner 125g", Type: models.TypePaperGrade, Material: "Recycled Fiber", Grammage: 125},
	{ID: "3", Name: "Standard Shipping Box A", Type: models.TypeCardboardBox, Material: "Wellenstoff", Dimensions: "400x300x200"},
}

func GetProducts(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(products)
}
