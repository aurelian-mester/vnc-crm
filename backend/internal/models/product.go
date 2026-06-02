package models

type ProductType string

const (
	TypeTissue         ProductType = "Tissue"
	TypePaperGrade     ProductType = "PaperGrade"
	TypeCardboardSheet ProductType = "CardboardSheet"
	TypeCardboardBox   ProductType = "CardboardBox"
)

type Product struct {
	ID          string      `json:"id"`
	Name        string      `json:"name"`
	Type        ProductType `json:"type"`
	Material    string      `json:"material"`    // e.g., Recycled Paper, Testliner, Schrenz
	Grammage    int         `json:"grammage"`    // g/m2
	Dimensions  string      `json:"dimensions"`  // e.g., "1200x800x400" or "Width: 2000mm"
	Description string      `json:"description"`
}
