package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gorilla/mux"
	_ "github.com/lib/pq"
)

type Product struct {
	ID          string  `json:"id"`
	Description string  `json:"description"`
	UnitPrice   float64 `json:"unit_price"`
	UnitCost    float64 `json:"unit_cost"`
}

type CalculationRequest struct {
	Length             float64 `json:"length"`
	Width              float64 `json:"width"`
	Height             float64 `json:"height"`
	Quantity           int     `json:"quantity"`
	Material           string  `json:"material"` // e.g., "Testliner", "Schrenz", or product ID
	Printing           bool    `json:"printing"`
	DieCutting         bool    `json:"dieCutting"`
	Gluing             bool    `json:"gluing"`
	Stapling           bool    `json:"stapling"`
	Discount           float64 `json:"discount"` // Percentage
	CustomerPriceGroup string  `json:"customer_price_group"`
	CustomerID         string  `json:"customer_id"`
}

type CalculationResponse struct {
	BaseCost      float64 `json:"baseCost"`
	OperationCost float64 `json:"operationCost"`
	TotalCost     float64 `json:"totalCost"`
	FinalPrice    float64 `json:"finalPrice"` // After discount
	UnitPrice     float64 `json:"unitPrice"`
}

var db *sql.DB

func initDB() {
	connStr := os.Getenv("PRODUCTS_DATABASE_URL")
	if connStr == "" {
		connStr = "postgres://vnc_user:vnc_pass_2026@localhost/products_db?sslmode=disable"
	}
	var err error
	db, err = sql.Open("postgres", connStr)
	if err != nil {
		log.Printf("Warning: Failed to connect to products_db: %v", err)
	} else if err = db.Ping(); err != nil {
		log.Printf("Warning: products_db ping failed: %v", err)
	} else {
		log.Println("Pricing Service database connection verified.")
	}
}

func main() {
	initDB()

	r := mux.NewRouter()

	r.HandleFunc("/calculate", handleCalculate).Methods("POST")
	r.HandleFunc("/products", handleGetProducts).Methods("GET")
	r.HandleFunc("/pricing/specs", handleGetSpecs).Methods("POST")

	log.Println("Pricing Service starting on :8083...")
	log.Fatal(http.ListenAndServe(":8083", r))
}

func handleGetProducts(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	search := r.URL.Query().Get("search")
	customerID := r.URL.Query().Get("customer_id")
	category := r.URL.Query().Get("category") // 'articles', 'board_grades', or 'all'

	if category == "" {
		category = "articles"
	}

	if customerID != "" {
		products, err := getCustomerProducts(customerID, search, category)
		if err == nil {
			if products == nil {
				products = []Product{}
			}
			json.NewEncoder(w).Encode(products)
			return
		}
		log.Printf("Warning: Failed to fetch products from DWH, using local fallback: %v", err)
		products, err = getLocalCustomerProducts(customerID, search, category)
		if err == nil {
			if products == nil {
				products = []Product{}
			}
			json.NewEncoder(w).Encode(products)
			return
		}
	}

	query := "SELECT id, description, unit_price, unit_cost FROM products"
	var args []interface{}
	var whereClauses []string

	if category == "board_grades" {
		whereClauses = append(whereClauses, "item_category_code = 'CO.STRUCTURI'")
	} else if category == "articles" {
		whereClauses = append(whereClauses, "item_category_code IN ('CO.PLACI', 'CO.CUTII', 'CO.TIP2', 'CO.VAL')")
	}

	if search != "" {
		whereClauses = append(whereClauses, fmt.Sprintf("(id ILIKE $%d OR description ILIKE $%d)", len(args)+1, len(args)+1))
		args = append(args, "%"+search+"%")
	}

	if len(whereClauses) > 0 {
		query += " WHERE " + strings.Join(whereClauses, " AND ")
	}
	query += " ORDER BY id LIMIT 100"

	if db == nil {
		mockProducts := []Product{
			{ID: "PROD001", Description: "Standard Cardboard Box 400x300x200", UnitPrice: 1.20, UnitCost: 0.80},
			{ID: "PROD002", Description: "Heavy Duty Cardboard Box 600x400x400", UnitPrice: 3.50, UnitCost: 2.10},
			{ID: "Testliner", Description: "Testliner 120g/sqm Paper Roll", UnitPrice: 0.85, UnitCost: 0.50},
			{ID: "Schrenz", Description: "Schrenz 100g/sqm Recycled Paper", UnitPrice: 0.65, UnitCost: 0.40},
		}
		json.NewEncoder(w).Encode(mockProducts)
		return
	}

	rows, err := db.Query(query, args...)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var products []Product
	for rows.Next() {
		var p Product
		if err := rows.Scan(&p.ID, &p.Description, &p.UnitPrice, &p.UnitCost); err == nil {
			products = append(products, p)
		}
	}

	if products == nil {
		products = []Product{}
	}

	json.NewEncoder(w).Encode(products)
}

func handleCalculate(w http.ResponseWriter, r *http.Request) {
	var req CalculationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	// Check if this is a standard product (dimensions are 0)
	isStandardProduct := req.Length == 0 && req.Width == 0 && req.Height == 0

	if isStandardProduct {
		unitPrice := 0.0
		priceFound := false

		// 1. Check custom price list for the customer
		if db != nil && req.CustomerID != "" {
			err := db.QueryRow(`
				SELECT pll.unit_price 
				FROM price_list_lines pll
				JOIN price_lists pl ON pll.price_list_code = pl.code
				WHERE ((pl.assign_to_no = $1 AND pl.assign_to_type = 'Customer') OR pl.assign_to_type = 'All Customers')
				  AND pll.product_no = $2
				  AND (pl.starting_date IS NULL OR pl.starting_date <= CURRENT_DATE)
				  AND (pl.ending_date IS NULL OR pl.ending_date >= CURRENT_DATE)
				ORDER BY (CASE WHEN pl.assign_to_type = 'Customer' THEN 1 ELSE 2 END), pll.min_quantity DESC
				LIMIT 1`, req.CustomerID, req.Material).Scan(&unitPrice)
			if err == nil && unitPrice > 0 {
				priceFound = true
				log.Printf("Applied custom price for customer %s and standard product %s: %f", req.CustomerID, req.Material, unitPrice)
			}
		}

		// 2. Fallback to default product price in catalog
		if !priceFound && db != nil {
			err := db.QueryRow("SELECT unit_price FROM products WHERE id = $1", req.Material).Scan(&unitPrice)
			if err == nil && unitPrice > 0 {
				priceFound = true
			}
		}

		// 3. Fallback to legacy/static pricing rules
		if !priceFound {
			switch req.Material {
			case "Testliner":
				unitPrice = 0.80
			case "Schrenz":
				unitPrice = 0.60
			case "Wellenstoff":
				unitPrice = 0.70
			}
		}

		totalCost := unitPrice * float64(req.Quantity)
		discountAmount := totalCost * (req.Discount / 100.0)
		finalPrice := totalCost - discountAmount

		resp := CalculationResponse{
			BaseCost:      totalCost,
			OperationCost: 0.0,
			TotalCost:     totalCost,
			FinalPrice:    finalPrice,
			UnitPrice:     finalPrice / float64(req.Quantity),
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
		return
	}

	// Surface Area in square meters (approx for a box: 2*(L*W + L*H + W*H))
	surfaceArea := 2 * (req.Length*req.Width + req.Length*req.Height + req.Width*req.Height) / 1000000.0
	
	materialPricePerSQM := 0.50 // Default fallback
	priceFound := false

	// Attempt to get price from price list lines if customer_id is set
	if db != nil && req.CustomerID != "" {
		var customPrice float64
		// Query price list lines for custom price matching the customer code (priority) or all customers
		err := db.QueryRow(`
			SELECT pll.unit_price 
			FROM price_list_lines pll
			JOIN price_lists pl ON pll.price_list_code = pl.code
			WHERE ((pl.assign_to_no = $1 AND pl.assign_to_type = 'Customer') OR pl.assign_to_type = 'All Customers')
			  AND pll.product_no = $2
			  AND (pl.starting_date IS NULL OR pl.starting_date <= CURRENT_DATE)
			  AND (pl.ending_date IS NULL OR pl.ending_date >= CURRENT_DATE)
			ORDER BY (CASE WHEN pl.assign_to_type = 'Customer' THEN 1 ELSE 2 END), pll.min_quantity DESC
			LIMIT 1`, req.CustomerID, req.Material).Scan(&customPrice)
		if err == nil && customPrice > 0 {
			materialPricePerSQM = customPrice
			priceFound = true
			log.Printf("Applied custom price for customer %s and product %s: %f", req.CustomerID, req.Material, customPrice)
		}
	}

	// Attempt to get price from price list lines if customer price group is set (legacy fallback)
	if !priceFound && db != nil && req.CustomerPriceGroup != "" {
		var customPrice float64
		// Query price list lines for custom price matching the material code
		err := db.QueryRow(`
			SELECT unit_price 
			FROM price_list_lines 
			WHERE price_list_code = $1 AND product_no = $2 
			LIMIT 1`, req.CustomerPriceGroup, req.Material).Scan(&customPrice)
		if err == nil && customPrice > 0 {
			materialPricePerSQM = customPrice
			priceFound = true
			log.Printf("Applied legacy custom price list %s for product %s: %f", req.CustomerPriceGroup, req.Material, customPrice)
		}
	}

	if !priceFound && db != nil {
		var dbPrice float64
		// Match by exact ID or description from products table
		err := db.QueryRow("SELECT unit_price FROM products WHERE id = $1 OR description = $1", req.Material).Scan(&dbPrice)
		if err == nil && dbPrice > 0 {
			materialPricePerSQM = dbPrice
			priceFound = true
		}
	}

	if !priceFound {
		// Switch-case fallback to static default pricing rules
		switch req.Material {
		case "Testliner":
			materialPricePerSQM = 0.80
		case "Schrenz":
			materialPricePerSQM = 0.60
		case "Wellenstoff":
			materialPricePerSQM = 0.70
		}
	}

	baseCost := surfaceArea * materialPricePerSQM * float64(req.Quantity)
	
	operationCost := 0.0
	if req.Printing {
		operationCost += 0.10 * float64(req.Quantity)
	}
	if req.DieCutting {
		operationCost += 0.05 * float64(req.Quantity)
	}
	if req.Gluing {
		operationCost += 0.03 * float64(req.Quantity)
	}
	if req.Stapling {
		operationCost += 0.02 * float64(req.Quantity)
	}

	totalCost := baseCost + operationCost
	discountAmount := totalCost * (req.Discount / 100.0)
	finalPrice := totalCost - discountAmount
	
	resp := CalculationResponse{
		BaseCost:      baseCost,
		OperationCost: operationCost,
		TotalCost:     totalCost,
		FinalPrice:    finalPrice,
		UnitPrice:     finalPrice / float64(req.Quantity),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func getCustomerProducts(customerID, search, category string) ([]Product, error) {
	dwhConnStr := os.Getenv("DWH_DATABASE_URL")
	if dwhConnStr == "" {
		dwhConnStr = "postgres://biusr:5324@172.16.75.97/dwh?sslmode=disable"
	}
	dwhDB, err := sql.Open("postgres", dwhConnStr)
	if err != nil {
		return nil, err
	}
	defer dwhDB.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	categoryFilter := "i.\"Item Category Code\" IN ('CO.PLACI', 'CO.CUTII', 'CO.TIP2', 'CO.VAL')"
	if category == "board_grades" {
		categoryFilter = "i.\"Item Category Code\" = 'CO.STRUCTURI'"
	} else if category == "all" {
		categoryFilter = "1=1"
	}

	query := fmt.Sprintf(`
		SELECT No, Description, PretUnitar 
		FROM (
			SELECT
				i."No." AS No,
				i."Description" AS Description,
				p."Unit Price" AS PretUnitar,
				row_number() over (partition by i."No." order by i."Modified At" desc) as rn
			FROM
				ss01."item_mv" i
			LEFT JOIN
				ss01."pricelistline_v" p
				ON i."No." = p."Product No."
			WHERE
				p."Assign-to No." Like $1
				AND p."VAT Prod. Posting Group" LIKE 'BUNURI%'
				AND p."Product No." NOT LIKE 'MS%'
				AND p."Product No." NOT LIKE 'S%'
				AND i."Unit Price" IS NOT NULL
				AND %s
		) a 
		WHERE rn = 1`, categoryFilter)

	var args []interface{}
	args = append(args, customerID)

	if search != "" {
		query += " AND (No ILIKE $2 OR Description ILIKE $2)"
		args = append(args, "%"+search+"%")
	}

	query += " ORDER BY No ASC LIMIT 100"

	rows, err := dwhDB.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var products []Product
	for rows.Next() {
		var p Product
		var unitPrice sql.NullFloat64
		if err := rows.Scan(&p.ID, &p.Description, &unitPrice); err == nil {
			p.UnitPrice = unitPrice.Float64
			p.UnitCost = p.UnitPrice * 0.7
			products = append(products, p)
		}
	}
	return products, nil
}

func getLocalCustomerProducts(customerID, search, category string) ([]Product, error) {
	if db == nil {
		return nil, fmt.Errorf("local database not connected")
	}

	categoryFilter := "p.item_category_code IN ('CO.PLACI', 'CO.CUTII', 'CO.TIP2', 'CO.VAL')"
	if category == "board_grades" {
		categoryFilter = "p.item_category_code = 'CO.STRUCTURI'"
	} else if category == "all" {
		categoryFilter = "1=1"
	}

	query := fmt.Sprintf(`
		SELECT p.id, p.description, pll.unit_price 
		FROM products p
		JOIN price_list_lines pll ON p.id = pll.product_no
		JOIN price_lists pl ON pll.price_list_code = pl.code
		WHERE (pl.assign_to_no = $1 AND pl.assign_to_type = 'Customer')
		  AND %s`, categoryFilter)

	var args []interface{}
	args = append(args, customerID)

	if search != "" {
		query += " AND (p.id ILIKE $2 OR p.description ILIKE $2)"
		args = append(args, "%"+search+"%")
	}

	query += " ORDER BY p.id LIMIT 100"

	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var products []Product
	for rows.Next() {
		var p Product
		if err := rows.Scan(&p.ID, &p.Description, &p.UnitPrice); err == nil {
			p.UnitCost = p.UnitPrice * 0.7
			products = append(products, p)
		}
	}
	return products, nil
}

type SpecsRequest struct {
	Length     float64 `json:"length"`
	Width      float64 `json:"width"`
	Height     float64 `json:"height"`
	Quantity   int     `json:"quantity"`
	Material   string  `json:"material"`
	FluteType  string  `json:"fluteType"`
	Printing   bool    `json:"printing"`
	DieCutting bool    `json:"dieCutting"`
	Gluing     bool    `json:"gluing"`
	Stapling   bool    `json:"stapling"`
}

type SpecsResponse struct {
	Caliper          float64 `json:"caliper"`
	Grammage         float64 `json:"grammage"`
	BurstingStrength float64 `json:"burstingStrength"`
	ECT              float64 `json:"ect"`
	SetupTime        float64 `json:"setupTime"`
	RunSpeed         float64 `json:"runSpeed"`
	WasteQty         int     `json:"wasteQty"`
	SteamUsage       float64 `json:"steamUsage"`
	ElectricityUsage float64 `json:"electricityUsage"`
	StarchGlueUsage  float64 `json:"starchGlueUsage"`
}

func handleGetSpecs(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	var req SpecsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid payload", http.StatusBadRequest)
		return
	}

	// 1. Board Caliper (Thickness)
	flute := req.FluteType
	if flute == "" {
		flute = "B"
	}
	
	caliper := 3.0 // default B flute
	takeup := 1.32
	
	switch flute {
	case "F":
		caliper = 0.8
		takeup = 1.18
	case "E":
		caliper = 1.5
		takeup = 1.25
	case "B":
		caliper = 3.0
		takeup = 1.32
	case "C":
		caliper = 4.0
		takeup = 1.43
	case "CO2": // single face
		caliper = 3.0 // default B
		takeup = 1.32
	case "CO3": // single wall
		caliper = 3.4 // flute + liners approx
		takeup = 1.32
	case "CO4":
		caliper = 4.0
		takeup = 1.35
	case "CO5": // double wall (default BC)
		caliper = 7.6 // B (3.0) + C (4.0) + liners approx
		takeup = 1.38
	case "BC":
		caliper = 7.6
		takeup = 1.38
	case "EB":
		caliper = 5.1
		takeup = 1.29
	case "EE":
		caliper = 3.6
		takeup = 1.25
	}

	// 2. Paper recipe configuration and Grammage/Burst/ECT calculations
	// Default paper params per material selection
	outerLiner := 125.0 // g/sqm
	innerLiner := 125.0
	fluting := 100.0
	middleLiner := 0.0 // only for double wall
	
	outerLinerRCT := 0.012 // Testliner
	innerLinerRCT := 0.012
	flutingRCT := 0.011    // Wellenstoff
	middleLinerRCT := 0.0
	
	outerLinerBurst := 2.5
	innerLinerBurst := 2.5

	switch req.Material {
	case "Schrenz":
		outerLiner = 100.0
		innerLiner = 100.0
		fluting = 90.0
		outerLinerRCT = 0.008
		innerLinerRCT = 0.008
		flutingRCT = 0.008
		outerLinerBurst = 1.2
		innerLinerBurst = 1.2
	case "Wellenstoff":
		outerLiner = 125.0
		innerLiner = 120.0
		fluting = 120.0
		outerLinerRCT = 0.012
		innerLinerRCT = 0.011
		flutingRCT = 0.011
		outerLinerBurst = 2.5
		innerLinerBurst = 2.3
	default: // Testliner
		outerLiner = 125.0
		innerLiner = 125.0
		fluting = 100.0
		outerLinerRCT = 0.012
		innerLinerRCT = 0.012
		flutingRCT = 0.011
		outerLinerBurst = 2.5
		innerLinerBurst = 2.5
	}

	// Double-wall settings
	isDoubleWall := flute == "CO5" || flute == "BC" || flute == "EB" || flute == "EE"
	var takeup1, takeup2 float64
	if isDoubleWall {
		middleLiner = 100.0 // Schrenz standard core
		middleLinerRCT = 0.008
		if flute == "EB" {
			takeup1 = 1.25 // E
			takeup2 = 1.32 // B
		} else if flute == "EE" {
			takeup1 = 1.25
			takeup2 = 1.25
		} else { // BC
			takeup1 = 1.32 // B
			takeup2 = 1.43 // C
		}
	}

	// Board Grammage (g/sqm)
	var grammage float64
	var ect float64
	var burstingStrength float64

	if isDoubleWall {
		grammage = outerLiner + (fluting * takeup1) + middleLiner + (fluting * takeup2) + innerLiner
		ect = 0.85 * (outerLiner*outerLinerRCT + middleLiner*middleLinerRCT + innerLiner*innerLinerRCT + (fluting*takeup1+fluting*takeup2)*flutingRCT)
		burstingStrength = outerLiner*outerLinerBurst/100.0 + innerLiner*innerLinerBurst/100.0
	} else {
		grammage = outerLiner + (fluting * takeup) + innerLiner
		ect = 0.85 * (outerLiner*outerLinerRCT + innerLiner*innerLinerRCT + fluting*takeup*flutingRCT)
		burstingStrength = outerLiner*outerLinerBurst/100.0 + innerLiner*innerLinerBurst/100.0
	}

	// 3. Converting & Machine Metrics
	// Setup Time
	setupTime := 15.0 // Base setup time (mins)
	if req.Printing {
		setupTime += 15.0 // +15 mins for flexo print plate alignment
	}
	if req.DieCutting {
		setupTime += 20.0 // +20 mins for rotary die mold
	}
	if req.Gluing {
		setupTime += 15.0 // +15 mins glue guide
	}
	if req.Stapling {
		setupTime += 10.0 // +10 mins staple alignment
	}

	// Machine Speed
	runSpeed := 6000.0 // Base boxes/hour
	if req.Printing {
		runSpeed *= 0.85
	}
	if req.DieCutting {
		runSpeed *= 0.80
	}
	if req.Gluing || req.Stapling {
		runSpeed *= 0.90
	}

	// Waste factor
	wasteQty := 50 // Setup sheets
	runningWaste := 0.015 * float64(req.Quantity)
	if req.Printing {
		runningWaste += 0.010 * float64(req.Quantity)
	}
	if req.DieCutting {
		runningWaste += 0.010 * float64(req.Quantity)
	}
	totalWaste := wasteQty + int(runningWaste)

	// Utilities
	// Sheet size calculation for standard box: 2*(Length + Width) + 40mm joint, and Width + Height height
	sheetLength := (2*(req.Length + req.Width) + 40.0) / 1000.0
	sheetWidth := (req.Width + req.Height) / 1000.0
	if sheetLength < 0.2 { sheetLength = 0.5 }
	if sheetWidth < 0.2 { sheetWidth = 0.4 }
	sheetArea := sheetLength * sheetWidth
	totalArea := sheetArea * float64(req.Quantity)

	// Board weight in kg
	totalWeightKg := totalArea * grammage / 1000.0

	steamUsage := 0.5 * totalWeightKg
	electricityUsage := 0.1 * totalArea
	
	starchGlueUsage := 10.0 * totalArea // 10g dry weight per square meter
	if isDoubleWall {
		starchGlueUsage = 20.0 * totalArea // 2 glue lines for double wall
	}

	resp := SpecsResponse{
		Caliper:          caliper,
		Grammage:         grammage,
		BurstingStrength: burstingStrength * 100.0, // Convert to kPa (approximate scaling)
		ECT:              ect,
		SetupTime:        setupTime,
		RunSpeed:         runSpeed,
		WasteQty:         totalWaste,
		SteamUsage:       steamUsage,
		ElectricityUsage: electricityUsage,
		StarchGlueUsage:  starchGlueUsage,
	}

	json.NewEncoder(w).Encode(resp)
}
