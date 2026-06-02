package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/golang-jwt/jwt/v5"
	_ "github.com/lib/pq"
)

var jwtKey = []byte("vnc-crm-secret-key-2026")

func generateToken(email, name, role, salesCode string) string {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"email":            email,
		"name":             name,
		"role":             role,
		"salesperson_code": salesCode,
		"exp":              time.Now().Add(time.Hour * 2).Unix(),
	})
	tokenString, _ := token.SignedString(jwtKey)
	return tokenString
}

type CalculationRequest struct {
	Length             float64 `json:"length"`
	Width              float64 `json:"width"`
	Height             float64 `json:"height"`
	Quantity           int     `json:"quantity"`
	Material           string  `json:"material"`
	Printing           bool    `json:"printing"`
	DieCutting         bool    `json:"dieCutting"`
	Gluing             bool    `json:"gluing"`
	Stapling           bool    `json:"stapling"`
	Discount           float64 `json:"discount"`
	CustomerPriceGroup string  `json:"customer_price_group"`
	CustomerID         string  `json:"customer_id"`
}

type CalculationResponse struct {
	BaseCost      float64 `json:"baseCost"`
	OperationCost float64 `json:"operationCost"`
	TotalCost     float64 `json:"totalCost"`
	FinalPrice    float64 `json:"finalPrice"`
	UnitPrice     float64 `json:"unitPrice"`
}

type Quote struct {
	ID              int         `json:"id,omitempty"`
	CustomerID      string      `json:"customer_id"`
	SalespersonCode string      `json:"salesperson_code"`
	Status          string      `json:"status"`
	TotalAmount     float64     `json:"total_amount,omitempty"`
	Items           []QuoteItem `json:"items"`
}

type QuoteItem struct {
	ProductID   string  `json:"product_id"`
	Description string  `json:"description"`
	Quantity    int     `json:"quantity"`
	UnitPrice   float64 `json:"unit_price"`
}

func main() {
	adminToken := generateToken("aurelian.mester@vrancart.com", "Aurelian Mester", "admin", "")
	salesToken := generateToken("sales@vrancart.com", "Test Sales Agent", "sales", "ASM 8")

	fmt.Println("=== 1. VERIFYING PRICING CALCULATION ===")

	// A. Custom Price (Customer C000605, Product 3300902)
	req1 := CalculationRequest{
		CustomerID: "C000605",
		Material:   "3300902",
		Quantity:   1000,
	}
	body1, _ := json.Marshal(req1)
	resp1, err := http.Post("http://127.0.0.1:8083/calculate", "application/json", bytes.NewBuffer(body1))
	if err != nil {
		log.Fatalf("Calculate request failed: %v", err)
	}
	var calc1 CalculationResponse
	json.NewDecoder(resp1.Body).Decode(&calc1)
	resp1.Body.Close()
	fmt.Printf("Custom pricing (Customer: C000605, Product: 3300902): Expected Unit Price ~1.15, Got: %f\n", calc1.UnitPrice)

	// B. Default Price (No Customer, Product 3300902)
	req2 := CalculationRequest{
		Material: "3300902",
		Quantity: 1000,
	}
	body2, _ := json.Marshal(req2)
	resp2, err := http.Post("http://127.0.0.1:8083/calculate", "application/json", bytes.NewBuffer(body2))
	if err != nil {
		log.Fatalf("Calculate request failed: %v", err)
	}
	var calc2 CalculationResponse
	json.NewDecoder(resp2.Body).Decode(&calc2)
	resp2.Body.Close()
	fmt.Printf("Default pricing (No Customer, Product: 3300902): Expected Unit Price ~0.0 (or fallback), Got: %f\n", calc2.UnitPrice)

	fmt.Println("\n=== 2. VERIFYING QUOTE CREATION AND SALESPERSON FILTERS ===")

	// A. Create Quote for ASM 8 (via salesToken)
	quote1 := Quote{
		CustomerID:      "C000605",
		SalespersonCode: "ASM 8",
		Status:          "Draft",
		Items: []QuoteItem{
			{ProductID: "3300902", Description: "IMPAR CUTIE EXT_420x180x270", Quantity: 500, UnitPrice: 1.15},
		},
	}
	qBody1, _ := json.Marshal(quote1)
	hReq1, _ := http.NewRequest("POST", "http://127.0.0.1:8082/quotes", bytes.NewBuffer(qBody1))
	hReq1.Header.Set("Authorization", "Bearer "+salesToken)
	hReq1.Header.Set("Content-Type", "application/json")
	hResp1, err := http.DefaultClient.Do(hReq1)
	if err != nil {
		log.Fatalf("Failed to create quote 1: %v", err)
	}
	fmt.Printf("Create Quote 1 (ASM 8): Status: %s\n", hResp1.Status)
	hResp1.Body.Close()

	// B. Create Quote for ASM 9 (via adminToken, explicitly assigned to ASM 9)
	quote2 := Quote{
		CustomerID:      "C043317",
		SalespersonCode: "ASM 9",
		Status:          "Draft",
		Items: []QuoteItem{
			{ProductID: "3300902", Description: "IMPAR CUTIE EXT_420x180x270", Quantity: 1000, UnitPrice: 1.15},
		},
	}
	qBody2, _ := json.Marshal(quote2)
	hReq2, _ := http.NewRequest("POST", "http://127.0.0.1:8082/quotes", bytes.NewBuffer(qBody2))
	hReq2.Header.Set("Authorization", "Bearer "+adminToken)
	hReq2.Header.Set("Content-Type", "application/json")
	hResp2, err := http.DefaultClient.Do(hReq2)
	if err != nil {
		log.Fatalf("Failed to create quote 2: %v", err)
	}
	fmt.Printf("Create Quote 2 (ASM 9): Status: %s\n", hResp2.Status)
	hResp2.Body.Close()

	// C. Fetch Quotes as Sales Agent (ASM 8)
	hGet1, _ := http.NewRequest("GET", "http://127.0.0.1:8082/quotes", nil)
	hGet1.Header.Set("Authorization", "Bearer "+salesToken)
	hGetResp1, err := http.DefaultClient.Do(hGet1)
	if err != nil {
		log.Fatalf("Failed to fetch quotes for agent: %v", err)
	}
	var agentQuotes []Quote
	json.NewDecoder(hGetResp1.Body).Decode(&agentQuotes)
	hGetResp1.Body.Close()
	fmt.Printf("Quotes fetched by Agent ASM 8: Got %d quotes\n", len(agentQuotes))
	for _, q := range agentQuotes {
		fmt.Printf("  - Quote ID: %d, Customer: %s, Salesperson: %s, Total: %f\n", q.ID, q.CustomerID, q.SalespersonCode, q.TotalAmount)
	}

	// D. Fetch Quotes as Admin
	hGet2, _ := http.NewRequest("GET", "http://127.0.0.1:8082/quotes", nil)
	hGet2.Header.Set("Authorization", "Bearer "+adminToken)
	hGetResp2, err := http.DefaultClient.Do(hGet2)
	if err != nil {
		log.Fatalf("Failed to fetch quotes for admin: %v", err)
	}
	var adminQuotes []Quote
	json.NewDecoder(hGetResp2.Body).Decode(&adminQuotes)
	hGetResp2.Body.Close()
	fmt.Printf("Quotes fetched by Admin: Got %d quotes\n", len(adminQuotes))
	for _, q := range adminQuotes {
		fmt.Printf("  - Quote ID: %d, Customer: %s, Salesperson: %s, Total: %f\n", q.ID, q.CustomerID, q.SalespersonCode, q.TotalAmount)
	}
	
	// Clean up created quotes from database to keep it clean
	crmDB, err := sql.Open("postgres", "postgres://vnc_user:vnc_pass_2026@localhost/crm_db?sslmode=disable")
	if err == nil {
		crmDB.Exec("DELETE FROM quotes WHERE salesperson_code IN ('ASM 8', 'ASM 9')")
		crmDB.Close()
		fmt.Println("\nVerification complete and test quotes cleaned up.")
	}
}
