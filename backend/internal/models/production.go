package models

type ProductionStatus string

const (
	StatusQueued      ProductionStatus = "Queued"
	StatusPrinting    ProductionStatus = "Printing"
	StatusDieCutting  ProductionStatus = "DieCutting"
	StatusFolding     ProductionStatus = "Folding"
	StatusGluing      ProductionStatus = "Gluing"
	StatusStapling    ProductionStatus = "Stapling"
	StatusCompleted   ProductionStatus = "Completed"
)

type ProductionJob struct {
	ID           string           `json:"id"`
	ProductID    string           `json:"product_id"`
	ProductName  string           `json:"product_name"`
	CustomerID   string           `json:"customer_id"`
	CustomerName string           `json:"customer_name"`
	Quantity     int              `json:"quantity"`
	Status       ProductionStatus `json:"status"`
	Priority     int              `json:"priority"` // 1-5
}
