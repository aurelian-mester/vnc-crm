package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/mux"
	_ "github.com/lib/pq"
)

var jwtKey = []byte("vnc-crm-secret-key-2026")

// claimsFromToken validates the request's Bearer JWT (HS256 + signature + expiry).
func claimsFromToken(r *http.Request) (jwt.MapClaims, error) {
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		return nil, fmt.Errorf("no authorization header")
	}
	parts := strings.Split(authHeader, " ")
	if len(parts) != 2 || parts[0] != "Bearer" {
		return nil, fmt.Errorf("invalid authorization header format")
	}
	token, err := jwt.Parse(parts[1], func(token *jwt.Token) (interface{}, error) {
		return jwtKey, nil
	}, jwt.WithValidMethods([]string{"HS256"}))
	if err != nil || !token.Valid {
		return nil, fmt.Errorf("invalid token: %v", err)
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return nil, fmt.Errorf("invalid token claims")
	}
	return claims, nil
}

func claimStr(claims jwt.MapClaims, key string) string {
	if v, ok := claims[key].(string); ok {
		return v
	}
	return ""
}

// authorize requires a valid JWT (any authenticated user) and returns its claims.
// On failure it writes 401 and returns ok=false.
func authorize(w http.ResponseWriter, r *http.Request) (jwt.MapClaims, bool) {
	claims, err := claimsFromToken(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return nil, false
	}
	return claims, true
}

type Product struct {
	ID          string  `json:"id"`
	Description string  `json:"description"`
	UnitPrice   float64 `json:"unit_price"`
	UnitCost    float64 `json:"unit_cost"`
}

type CalculationRequest struct {
	Length                    float64 `json:"length"`
	Width                     float64 `json:"width"`
	Height                    float64 `json:"height"`
	Quantity                  int     `json:"quantity"`
	Material                  string  `json:"material"` // e.g., "Testliner", "Schrenz", or product ID
	Printing                  bool    `json:"printing"`
	DieCutting                bool    `json:"dieCutting"`
	Gluing                    bool    `json:"gluing"`
	Stapling                  bool    `json:"stapling"`
	Discount                  float64 `json:"discount"` // Percentage
	CustomerPriceGroup        string  `json:"customer_price_group"`
	CustomerID                string  `json:"customer_id"`
	ToolingPrintingPlatesCost float64 `json:"tooling_printing_plates_cost"`
	ToolingDieCutMoldsCost    float64 `json:"tooling_die_cut_molds_cost"`
	ToolingAmortizationVolume int     `json:"tooling_amortization_volume"`
	AmortizeTooling           bool    `json:"amortize_tooling"`
}

type PriceTier struct {
	Quantity    int     `json:"quantity"`
	BaseCost    float64 `json:"baseCost"`    // Material + Waste
	SetupCost   float64 `json:"setupCost"`   // Makeready machine costs
	RunCost     float64 `json:"runCost"`     // Running machine costs
	ToolingCost float64 `json:"toolingCost"` // Allocated tooling cost
	TotalCost   float64 `json:"totalCost"`   // Sum of costs
	FinalPrice  float64 `json:"finalPrice"`  // Sales price after markup & discount
	UnitPrice   float64 `json:"unitPrice"`   // Per unit price
}

type CalculationResponse struct {
	BaseCost      float64     `json:"baseCost"`
	OperationCost float64     `json:"operationCost"`
	TotalCost     float64     `json:"totalCost"`
	FinalPrice    float64     `json:"finalPrice"` // After discount
	UnitPrice     float64     `json:"unitPrice"`
	SetupCost     float64     `json:"setupCost"`
	RunCost       float64     `json:"runCost"`
	Tiers         []PriceTier `json:"tiers"`
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
	claims, ok := authorize(w, r)
	if !ok {
		return
	}
	search := r.URL.Query().Get("search")
	customerID := r.URL.Query().Get("customer_id")
	category := r.URL.Query().Get("category") // 'articles', 'board_grades', or 'all'

	// External (B2B) users may only see their own customer's negotiated pricing.
	if claimStr(claims, "role") == "external" {
		customerID = claimStr(claims, "customer_id")
	}

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

func getQuantityTiers(q int) []int {
	var tiers []int
	
	// 1. Between 0 and 1000 in 100 pcs steps
	for i := 100; i <= 1000; i += 100 {
		tiers = append(tiers, i)
	}
	
	// 2. Between 1000 and 10000 in 1000 pcs steps
	for i := 2000; i <= 10000; i += 1000 {
		tiers = append(tiers, i)
	}
	
	// 3. Between 10000 and 200000 in 5000 pcs steps
	for i := 15000; i <= 200000; i += 5000 {
		tiers = append(tiers, i)
	}
	
	// 4. Ensure the requested quantity q is in the list
	found := false
	for _, val := range tiers {
		if val == q {
			found = true
			break
		}
	}
	if !found && q > 0 {
		tiers = append(tiers, q)
	}
	
	// Sort tiers and ensure unique values
	sort.Ints(tiers)
	
	// Deduplicate
	var uniqueTiers []int
	for idx, val := range tiers {
		if idx == 0 || val != tiers[idx-1] {
			uniqueTiers = append(uniqueTiers, val)
		}
	}
	
	return uniqueTiers
}

func calculateStandardProductUnitPrice(req CalculationRequest, q int) float64 {
	unitPrice := 0.0
	priceFound := false

	// 1. Check custom price list for the customer matching quantity break
	if db != nil && req.CustomerID != "" {
		err := db.QueryRow(`
			SELECT pll.unit_price 
			FROM price_list_lines pll
			JOIN price_lists pl ON pll.price_list_code = pl.code
			WHERE ((pl.assign_to_no = $1 AND pl.assign_to_type = 'Customer') OR pl.assign_to_type = 'All Customers')
			  AND pll.product_no = $2
			  AND pll.min_quantity <= $3
			  AND (pl.starting_date IS NULL OR pl.starting_date <= CURRENT_DATE)
			  AND (pl.ending_date IS NULL OR pl.ending_date >= CURRENT_DATE)
			ORDER BY (CASE WHEN pl.assign_to_type = 'Customer' THEN 1 ELSE 2 END), pll.min_quantity DESC
			LIMIT 1`, req.CustomerID, req.Material, q).Scan(&unitPrice)
		if err == nil && unitPrice > 0 {
			priceFound = true
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

	return unitPrice
}

func calculatePricingDetails(req CalculationRequest, q int) (materialPrice, setupCost, runCost, toolingCost, totalPrice, finalPrice, unitPrice float64) {
	if q <= 0 {
		return 0, 0, 0, 0, 0, 0, 0
	}

	// Surface Area in square meters (approx for a box: 2*(L*W + L*H + W*H))
	surfaceArea := 2 * (req.Length*req.Width + req.Length*req.Height + req.Width*req.Height) / 1000000.0

	materialPricePerSQM := 0.50
	priceFound := false

	// Attempt to get price from price list lines if customer_id is set
	if db != nil && req.CustomerID != "" {
		var customPrice float64
		err := db.QueryRow(`
			SELECT pll.unit_price 
			FROM price_list_lines pll
			JOIN price_lists pl ON pll.price_list_code = pl.code
			WHERE ((pl.assign_to_no = $1 AND pl.assign_to_type = 'Customer') OR pl.assign_to_type = 'All Customers')
			  AND pll.product_no = $2
			  AND pll.min_quantity <= $3
			  AND (pl.starting_date IS NULL OR pl.starting_date <= CURRENT_DATE)
			  AND (pl.ending_date IS NULL OR pl.ending_date >= CURRENT_DATE)
			ORDER BY (CASE WHEN pl.assign_to_type = 'Customer' THEN 1 ELSE 2 END), pll.min_quantity DESC
			LIMIT 1`, req.CustomerID, req.Material, q).Scan(&customPrice)
		if err == nil && customPrice > 0 {
			materialPricePerSQM = customPrice
			priceFound = true
		}
	}

	// Attempt to get price from price list lines if customer price group is set (legacy fallback)
	if !priceFound && db != nil && req.CustomerPriceGroup != "" {
		var customPrice float64
		err := db.QueryRow(`
			SELECT unit_price 
			FROM price_list_lines 
			WHERE price_list_code = $1 AND product_no = $2 AND min_quantity <= $3
			ORDER BY min_quantity DESC LIMIT 1`, req.CustomerPriceGroup, req.Material, q).Scan(&customPrice)
		if err == nil && customPrice > 0 {
			materialPricePerSQM = customPrice
			priceFound = true
		}
	}

	if !priceFound && db != nil {
		var dbPrice float64
		err := db.QueryRow("SELECT unit_price FROM products WHERE id = $1 OR description = $1", req.Material).Scan(&dbPrice)
		if err == nil && dbPrice > 0 {
			materialPricePerSQM = dbPrice
			priceFound = true
		}
	}

	if !priceFound {
		switch req.Material {
		case "Testliner":
			materialPricePerSQM = 0.80
		case "Schrenz":
			materialPricePerSQM = 0.60
		case "Wellenstoff":
			materialPricePerSQM = 0.70
		}
	}

	// Trim factor
	trimFactor := 0.05
	grossSheetArea := surfaceArea * (1.0 + trimFactor)

	// Machine Speed Run Speeds (synced with handleGetSpecs logic)
	runSpeed := 6000.0
	if req.Printing {
		runSpeed *= 0.85
	}
	if req.DieCutting {
		runSpeed *= 0.80
	}
	if req.Gluing || req.Stapling {
		runSpeed *= 0.90
	}

	// Setup and Running Waste Sheets
	wasteQty := 50
	runningWaste := 0.015 * float64(q)
	if req.Printing {
		runningWaste += 0.010 * float64(q)
	}
	if req.DieCutting {
		runningWaste += 0.010 * float64(q)
	}
	totalWaste := wasteQty + int(runningWaste)

	// Material Price including setup waste and running waste sheets
	totalSheetsNeeded := float64(q) + float64(totalWaste)
	materialPrice = totalSheetsNeeded * grossSheetArea * materialPricePerSQM

	// Setup times & costs
	corrugatorSetupTime := 15.0
	printingSetupTime := 0.0
	if req.Printing {
		printingSetupTime = 15.0
	}
	dieCuttingSetupTime := 0.0
	if req.DieCutting {
		dieCuttingSetupTime = 20.0
	}
	gluingSetupTime := 0.0
	if req.Gluing {
		gluingSetupTime = 15.0
	}
	staplingSetupTime := 0.0
	if req.Stapling {
		staplingSetupTime = 10.0
	}

	corrugatorSetupRate := 300.0
	printerSetupRate := 150.0
	dieCutterSetupRate := 150.0
	gluerStaplerSetupRate := 100.0

	setupCost = (corrugatorSetupTime*corrugatorSetupRate +
		printingSetupTime*printerSetupRate +
		dieCuttingSetupTime*dieCutterSetupRate +
		(gluingSetupTime+staplingSetupTime)*gluerStaplerSetupRate) / 60.0

	// Running costs
	corrugatorRunRate := 600.0
	printerRunRate := 300.0
	dieCutterRunRate := 300.0
	gluerStaplerRunRate := 200.0

	corrugatorRunTimeHours := float64(q) / 6000.0 // Corrugator fixed 6000/hr
	convertingRunTimeHours := float64(q) / runSpeed

	printingRunCost := 0.0
	if req.Printing {
		printingRunCost = convertingRunTimeHours * printerRunRate
	}
	dieCuttingRunCost := 0.0
	if req.DieCutting {
		dieCuttingRunCost = convertingRunTimeHours * dieCutterRunRate
	}
	gluingRunCost := 0.0
	if req.Gluing {
		gluingRunCost = convertingRunTimeHours * gluerStaplerRunRate
	}
	staplingRunCost := 0.0
	if req.Stapling {
		staplingRunCost = convertingRunTimeHours * gluerStaplerRunRate
	}

	runCost = (corrugatorRunTimeHours * corrugatorRunRate) +
		printingRunCost +
		dieCuttingRunCost +
		gluingRunCost +
		staplingRunCost

	// Tooling cost allocation
	totalTooling := req.ToolingPrintingPlatesCost + req.ToolingDieCutMoldsCost
	if req.AmortizeTooling && req.ToolingAmortizationVolume > 0 {
		toolingCost = float64(q) * (totalTooling / float64(req.ToolingAmortizationVolume))
	} else if !req.AmortizeTooling {
		toolingCost = totalTooling
	} else {
		toolingCost = 0.0
	}

	totalPrice = materialPrice + setupCost + runCost + toolingCost
	discountAmount := totalPrice * (req.Discount / 100.0)
	finalPrice = totalPrice - discountAmount
	unitPrice = finalPrice / float64(q)

	return materialPrice, setupCost, runCost, toolingCost, totalPrice, finalPrice, unitPrice
}

func handleCalculate(w http.ResponseWriter, r *http.Request) {
	if _, ok := authorize(w, r); !ok {
		return
	}
	var req CalculationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	isStandardProduct := req.Length == 0 && req.Width == 0 && req.Height == 0

	if isStandardProduct {
		unitPrice := calculateStandardProductUnitPrice(req, req.Quantity)
		totalCost := unitPrice * float64(req.Quantity)
		discountAmount := totalCost * (req.Discount / 100.0)
		finalPrice := totalCost - discountAmount

		// Generate tiers
		quantityTiers := getQuantityTiers(req.Quantity)
		tiers := make([]PriceTier, len(quantityTiers))
		for i, q := range quantityTiers {
			tPrice := calculateStandardProductUnitPrice(req, q)
			subTotal := tPrice * float64(q)
			discAmt := subTotal * (req.Discount / 100.0)
			fPrice := subTotal - discAmt
			tiers[i] = PriceTier{
				Quantity:    q,
				BaseCost:    subTotal,
				SetupCost:   0.0,
				RunCost:     0.0,
				ToolingCost: 0.0,
				TotalCost:   subTotal,
				FinalPrice:  fPrice,
				UnitPrice:   fPrice / float64(q),
			}
		}

		resp := CalculationResponse{
			BaseCost:      totalCost,
			OperationCost: 0.0,
			TotalCost:     totalCost,
			FinalPrice:    finalPrice,
			UnitPrice:     finalPrice / float64(req.Quantity),
			SetupCost:     0.0,
			RunCost:       0.0,
			Tiers:         tiers,
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
		return
	}

	// For Custom Box visualizer configuration:
	materialPrice, setupCost, runCost, _, totalPrice, finalPrice, unitPrice := calculatePricingDetails(req, req.Quantity)

	// Generate tiers
	quantityTiers := getQuantityTiers(req.Quantity)
	tiers := make([]PriceTier, len(quantityTiers))
	for i, q := range quantityTiers {
		mPrice, sCost, rCost, tCost, tPrice, fPrice, uPrice := calculatePricingDetails(req, q)
		tiers[i] = PriceTier{
			Quantity:    q,
			BaseCost:    mPrice,
			SetupCost:   sCost,
			RunCost:     rCost,
			ToolingCost: tCost,
			TotalCost:   tPrice * 0.7, // 70% production cost
			FinalPrice:  fPrice,
			UnitPrice:   uPrice,
		}
	}

	resp := CalculationResponse{
		BaseCost:      materialPrice,
		OperationCost: setupCost + runCost,
		SetupCost:     setupCost,
		RunCost:       runCost,
		TotalCost:     totalPrice * 0.7, // 70% production cost (for margins validation)
		FinalPrice:    finalPrice,
		UnitPrice:     unitPrice,
		Tiers:         tiers,
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
	if _, ok := authorize(w, r); !ok {
		return
	}
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
