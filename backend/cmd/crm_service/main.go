package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/mux"
	_ "github.com/lib/pq"
)

// jwtKey and dwhURL are loaded from the environment at startup (fail-closed).
var jwtKey []byte
var dwhURL string

// mustEnv returns the named environment variable, or exits the process if it is
// unset, so a missing secret fails the service at boot rather than silently
// falling back to a hardcoded credential.
func mustEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		log.Fatalf("FATAL: %s environment variable is required", key)
	}
	return v
}

type Customer struct {
	ID                           string  `json:"id"`
	Name                         string  `json:"name"`
	Email                        string  `json:"email"`
	City                         string  `json:"city"`
	Address                      string  `json:"address"`
	County                       string  `json:"county"`
	Contact                      string  `json:"contact"`
	Phone                        string  `json:"phone"`
	RegistrationNo               string  `json:"registration_no"`
	VatRegistrationNo            string  `json:"vat_registration_no"`
	PaymentTermsCode             string  `json:"payment_terms_code"`
	SalespersonCode              string  `json:"salesperson_code"`
	CustomerPriceGroup           string  `json:"customer_price_group"`
	CreditLimit                  float64 `json:"credit_limit"`
	Blocked                      string  `json:"blocked"`
	PostCode                     string  `json:"post_code"`
	CommerceTradeNo              string  `json:"commerce_trade_no"`
	TotalQuantityTons            float64 `json:"total_quantity_tons"`
	MainCompetitor               string  `json:"main_competitor"`
	MainCompetitorVolume         float64 `json:"main_competitor_volume"`
	Potential                    string  `json:"potential"`
	CardboardUtilizationCategory string  `json:"cardboard_utilization_category"`
}

type Quote struct {
	ID              int         `json:"id"`
	CustomerID      string      `json:"customer_id"`
	CustomerName    string      `json:"customer_name,omitempty"`
	SalespersonCode string      `json:"salesperson_code"`
	Status          string      `json:"status"`
	TotalAmount     float64     `json:"total_amount"`
	CreatedAt       time.Time   `json:"created_at"`
	UpdatedAt       time.Time   `json:"updated_at"`
	Items           []QuoteItem `json:"items,omitempty"`
}

type QuoteItem struct {
	ID           int     `json:"id"`
	QuoteID      int     `json:"quote_id"`
	ProductID    string  `json:"product_id"`
	Description  string  `json:"description"`
	Quantity     int     `json:"quantity"`
	UnitPrice    float64 `json:"unit_price"`
	TotalPrice   float64 `json:"total_price"`
	ConfigParams string  `json:"config_params"` // JSON string representation
}

type ProductionJob struct {
	NrCrt            int     `json:"nr_crt"`
	CustomerCode     string  `json:"customer_code"`
	CustomerName     string  `json:"customer_name"`
	ProductCode      string  `json:"product_code"`
	ProductName      string  `json:"product_name"`
	OrderNumber      string  `json:"order_number"`
	QuantityOrdered  int     `json:"quantity_ordered"`
	QuantityProduced float64 `json:"quantity_produced"`
	ScheduledDate    string  `json:"scheduled_date"`
	ProductionDate   string  `json:"production_date"`
	Status           int     `json:"status"`
	MachineCode      string  `json:"machine_code"`
}

var db *sql.DB
var productsDB *sql.DB

func initDB() {
	connStr := mustEnv("DATABASE_URL")
	var err error
	db, err = sql.Open("postgres", connStr)
	if err != nil {
		log.Printf("Warning: Failed to connect to crm_db: %v", err)
	} else if err = db.Ping(); err != nil {
		log.Printf("Warning: crm_db ping failed: %v", err)
	} else {
		log.Println("CRM Service database connection verified.")

		// Create quotes, quote_items, and quote_versions tables
		_, err = db.Exec(`
			CREATE TABLE IF NOT EXISTS quotes (
				id SERIAL PRIMARY KEY,
				customer_id VARCHAR(50) NOT NULL REFERENCES customers(id),
				salesperson_code VARCHAR(50),
				status VARCHAR(50) NOT NULL,
				total_amount NUMERIC(15, 2) DEFAULT 0.0,
				created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
				updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
			);
			CREATE TABLE IF NOT EXISTS quote_items (
				id SERIAL PRIMARY KEY,
				quote_id INT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
				product_id VARCHAR(50),
				description VARCHAR(255) NOT NULL,
				quantity INT NOT NULL,
				unit_price NUMERIC(15, 4) NOT NULL,
				total_price NUMERIC(15, 2) NOT NULL,
				config_params TEXT
			);
			CREATE TABLE IF NOT EXISTS quote_versions (
				id SERIAL PRIMARY KEY,
				quote_id INT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
				version INT NOT NULL,
				status VARCHAR(50) NOT NULL,
				total_amount NUMERIC(15, 2) NOT NULL,
				created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
				items TEXT,
				UNIQUE(quote_id, version)
			);
			CREATE TABLE IF NOT EXISTS leads (
				id SERIAL PRIMARY KEY,
				name VARCHAR(255) NOT NULL,
				company VARCHAR(255) NOT NULL,
				email VARCHAR(255),
				phone VARCHAR(50),
				status VARCHAR(50) DEFAULT 'New',
				salesperson_code VARCHAR(50),
				created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
				updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
			);
			CREATE TABLE IF NOT EXISTS opportunities (
				id SERIAL PRIMARY KEY,
				customer_id VARCHAR(50) REFERENCES customers(id),
				title VARCHAR(255) NOT NULL,
				stage VARCHAR(50) DEFAULT 'Qualification',
				expected_value NUMERIC(15, 2) DEFAULT 0.0,
				quote_id INT REFERENCES quotes(id) ON DELETE SET NULL,
				salesperson_code VARCHAR(50),
				created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
				updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
			);
			CREATE TABLE IF NOT EXISTS projects (
				id SERIAL PRIMARY KEY,
				customer_id VARCHAR(50) REFERENCES customers(id),
				name VARCHAR(255) NOT NULL,
				status VARCHAR(50) DEFAULT 'Planning',
				opportunity_id INT REFERENCES opportunities(id) ON DELETE SET NULL,
				delivery_date DATE,
				created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
				updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
			);

			CREATE TABLE IF NOT EXISTS lab_tests (
				id SERIAL PRIMARY KEY,
				batch_id VARCHAR(50) NOT NULL UNIQUE,
				production_line VARCHAR(50) NOT NULL,
				testing_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
				ect NUMERIC(10, 2) NOT NULL,
				bct NUMERIC(10, 2) NOT NULL,
				fct NUMERIC(10, 2) NOT NULL,
				bursting_strength NUMERIC(10, 2) NOT NULL,
				cobb_test NUMERIC(10, 2) NOT NULL,
				material_grade VARCHAR(50) NOT NULL,
				delivery_note_no VARCHAR(50)
			);

			CREATE TABLE IF NOT EXISTS claims (
				id SERIAL PRIMARY KEY,
				customer_id VARCHAR(50) NOT NULL REFERENCES customers(id),
				quote_id INT REFERENCES quotes(id) ON DELETE SET NULL,
				batch_id VARCHAR(50) REFERENCES lab_tests(batch_id) ON DELETE SET NULL,
				root_cause_category VARCHAR(50),
				root_cause_details VARCHAR(255),
				status VARCHAR(50) DEFAULT 'New',
				description TEXT NOT NULL,
				resolution_decision VARCHAR(50),
				credit_note_amount NUMERIC(15, 2) DEFAULT 0.0,
				replacement_quote_id INT,
				created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
				updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
			);

			CREATE TABLE IF NOT EXISTS quality_configs (
				key VARCHAR(50) PRIMARY KEY,
				value NUMERIC(10, 2) NOT NULL,
				updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
			);

			CREATE TABLE IF NOT EXISTS pallet_presets (
				id SERIAL PRIMARY KEY,
				name VARCHAR(50) NOT NULL UNIQUE,
				length_mm INT NOT NULL,
				width_mm INT NOT NULL,
				max_height_mm INT NOT NULL DEFAULT 2000,
				tare_weight_kg FLOAT NOT NULL DEFAULT 25.0
			);

			CREATE TABLE IF NOT EXISTS truck_presets (
				id SERIAL PRIMARY KEY,
				name VARCHAR(50) NOT NULL UNIQUE,
				type VARCHAR(20) NOT NULL,
				bed_length_mm INT NOT NULL,
				bed_width_mm INT NOT NULL,
				bed_height_mm INT NOT NULL,
				max_payload_kg FLOAT NOT NULL,
				is_tandem BOOLEAN NOT NULL DEFAULT FALSE,
				trailer_length_mm INT DEFAULT 0,
				trailer_payload_kg FLOAT DEFAULT 0.0
			);

			CREATE TABLE IF NOT EXISTS load_plans (
				id SERIAL PRIMARY KEY,
				title VARCHAR(100) NOT NULL,
				truck_preset_id INT REFERENCES truck_presets(id),
				total_pallets INT NOT NULL,
				utilization_percentage FLOAT NOT NULL,
				total_weight_kg FLOAT NOT NULL,
				payload_layout TEXT NOT NULL,
				created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
				updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
			);
		`)
		if err != nil {
			log.Printf("Error creating crm_db quotes/qa tables: %v", err)
		} else {
			log.Println("Quotes & QA database tables created/verified.")
			// Seed Cobb threshold default
			_, _ = db.Exec("INSERT INTO quality_configs (key, value) VALUES ('cobb_threshold', 150.00) ON CONFLICT (key) DO NOTHING;")
			// Seed mock lab tests
			_, _ = db.Exec(`
				INSERT INTO lab_tests (batch_id, production_line, ect, bct, fct, bursting_strength, cobb_test, material_grade, delivery_note_no) VALUES
				('BATCH-2026-001', 'Corrugator L1', 5.20, 2800.00, 310.00, 450.00, 125.00, 'Testliner', 'DN-99401'),
				('BATCH-2026-002', 'Corrugator L2', 3.80, 1900.00, 220.00, 320.00, 185.00, 'Schrenz', 'DN-99402'),
				('BATCH-2026-003', 'Corrugator L1', 4.50, 2400.00, 280.00, 400.00, 140.00, 'Wellenstoff', 'DN-99403')
				ON CONFLICT (batch_id) DO NOTHING;
			`)
			// Seed truck presets
			_, _ = db.Exec(`
				INSERT INTO truck_presets (name, type, bed_length_mm, bed_width_mm, bed_height_mm, max_payload_kg, is_tandem, trailer_length_mm, trailer_payload_kg) VALUES
				('Standard Semi-Trailer', 'Semi', 13600, 2450, 2700, 24000.0, FALSE, 0, 0.0),
				('Tandem Rig (Truck + Trailer)', 'Tandem', 7300, 2450, 3000, 12000.0, TRUE, 8200, 14000.0)
				ON CONFLICT (name) DO NOTHING;
			`)
			// Seed pallet presets
			_, _ = db.Exec(`
				INSERT INTO pallet_presets (name, length_mm, width_mm, max_height_mm, tare_weight_kg) VALUES
				('Euro Pallet (EPAL 1)', 1200, 800, 2000, 25.0),
				('Industrial Pallet (ISO)', 1200, 1000, 2000, 35.0),
				('Half Euro Pallet', 600, 800, 1500, 15.0)
				ON CONFLICT (name) DO NOTHING;
			`)
		}
	}

	prodConnStr := mustEnv("PRODUCTS_DATABASE_URL")
	productsDB, err = sql.Open("postgres", prodConnStr)
	if err != nil {
		log.Printf("Warning: Failed to connect to products_db: %v", err)
	} else if err = productsDB.Ping(); err != nil {
		log.Printf("Warning: products_db ping failed: %v", err)
	} else {
		log.Println("CRM Service products_db connection verified.")
	}
}

func claimsFromToken(r *http.Request) (jwt.MapClaims, error) {
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		return nil, fmt.Errorf("no authorization header")
	}

	parts := strings.Split(authHeader, " ")
	if len(parts) != 2 || parts[0] != "Bearer" {
		return nil, fmt.Errorf("invalid authorization header format")
	}

	tokenString := parts[1]
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
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

// Role sets aligned with the frontend access matrix (components/Sidebar.tsx).
// salesRoles: leads/opportunities/customers/sales/quotes write access.
var salesRoles = map[string]bool{"admin": true, "sales": true, "asm": true, "ai": true, "rsm": true, "sales_manager": true, "management": true}

// logisticsRoles: Load Optimizer access.
var logisticsRoles = map[string]bool{"admin": true, "sales": true, "asm": true, "ai": true, "rsm": true, "sales_manager": true, "management": true, "production": true, "quality": true}

// managerRoles may act across other salespeople's records (no ownership scoping).
var managerRoles = map[string]bool{"admin": true, "management": true, "sales_manager": true, "rsm": true}

// qaRoles: QA & Claims access (matches the Sidebar). Plus "external" customers see their own.
var qaRoles = map[string]bool{"admin": true, "quality": true, "management": true, "sales": true}

// claimStr safely reads a string claim without panicking on a missing/non-string value.
func claimStr(claims jwt.MapClaims, key string) string {
	if v, ok := claims[key].(string); ok {
		return v
	}
	return ""
}

// authorize validates the request's JWT and, when allowed != nil, checks the
// caller's role is in the allowed set. On failure it writes 401/403 and returns
// ok=false so the handler can simply `return`. Pass allowed=nil to require only
// a valid (authenticated) token.
func authorize(w http.ResponseWriter, r *http.Request, allowed map[string]bool) (jwt.MapClaims, bool) {
	claims, err := claimsFromToken(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return nil, false
	}
	if allowed != nil && !allowed[claimStr(claims, "role")] {
		http.Error(w, "Forbidden: insufficient role", http.StatusForbidden)
		return nil, false
	}
	return claims, true
}

func main() {
	jwtKey = []byte(mustEnv("JWT_SECRET"))
	dwhURL = mustEnv("DWH_DATABASE_URL")
	initDB()

	r := mux.NewRouter()

	r.HandleFunc("/customers", handleGetCustomers).Methods("GET")
	r.HandleFunc("/customers/{id}/quotes", handleGetCustomerQuotes).Methods("GET")
	r.HandleFunc("/customers/{id}/metrics", handleGetCustomerMetrics).Methods("GET")
	
	r.HandleFunc("/quotes", handleGetQuotes).Methods("GET")
	r.HandleFunc("/quotes", handleCreateQuote).Methods("POST")
	r.HandleFunc("/quotes/{id}", handleGetQuoteDetails).Methods("GET")
	r.HandleFunc("/quotes/{id}", handleUpdateQuote).Methods("PUT")
	r.HandleFunc("/quotes/{id}", handleDeleteQuote).Methods("DELETE")
	r.HandleFunc("/quotes/{id}/versions", handleGetQuoteVersions).Methods("GET")
	r.HandleFunc("/quotes/{id}/versions/{version}/restore", handleRestoreQuoteVersion).Methods("POST")
	r.HandleFunc("/production/jobs", handleGetProductionJobs).Methods("GET")

	// Leads, Opportunities and Projects workflow endpoints
	r.HandleFunc("/leads", handleGetLeads).Methods("GET")
	r.HandleFunc("/leads", handleCreateLead).Methods("POST")
	r.HandleFunc("/leads/{id}", handleUpdateLead).Methods("PUT")
	r.HandleFunc("/opportunities", handleGetOpportunities).Methods("GET")
	r.HandleFunc("/opportunities", handleCreateOpportunity).Methods("POST")
	r.HandleFunc("/opportunities/{id}", handleUpdateOpportunity).Methods("PUT")
	r.HandleFunc("/projects", handleGetProjects).Methods("GET")
	r.HandleFunc("/projects", handleCreateProject).Methods("POST")
	r.HandleFunc("/projects/{id}", handleUpdateProject).Methods("PUT")
	
	// QA and Claims routes
	r.HandleFunc("/lab-tests", handleGetLabTests).Methods("GET")
	r.HandleFunc("/lab-tests/{batch_id}", handleGetLabTestDetails).Methods("GET")
	r.HandleFunc("/lab-tests", handleCreateLabTest).Methods("POST")
	r.HandleFunc("/claims", handleGetClaims).Methods("GET")
	r.HandleFunc("/claims/{id}", handleGetClaimDetails).Methods("GET")
	r.HandleFunc("/claims", handleCreateClaim).Methods("POST")
	r.HandleFunc("/claims/{id}/status", handleUpdateClaimStatus).Methods("PUT")
	r.HandleFunc("/claims/{id}/resolve", handleResolveClaim).Methods("PUT")
	r.HandleFunc("/quality-config", handleGetQualityConfig).Methods("GET")
	r.HandleFunc("/quality-config", handleUpdateQualityConfig).Methods("PUT")

	// Logistics and Truck Loading routes
	r.HandleFunc("/logistics/presets", handleGetLogisticsPresets).Methods("GET")
	r.HandleFunc("/logistics/load-plans", handleGetLoadPlans).Methods("GET")
	r.HandleFunc("/logistics/load-plans", handleCreateLoadPlan).Methods("POST")
	r.HandleFunc("/logistics/optimize", handleOptimizeLoad).Methods("POST")

	log.Println("CRM Service starting on :8082...")
	log.Fatal(http.ListenAndServe(":8082", r))
}

func handleGetCustomers(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	claims, err := claimsFromToken(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnauthorized)
		return
	}

	role := claims["role"].(string)
	customerID, _ := claims["customer_id"].(string)

	if db != nil {
		var rows *sql.Rows
		var err error
		if role == "external" {
			if customerID == "" {
				http.Error(w, "Forbidden: No customer profile associated", http.StatusForbidden)
				return
			}
			rows, err = db.Query(`
				SELECT id, name, email, city, address, county, contact, phone, registration_no, 
				       vat_registration_no, payment_terms_code, salesperson_code, customer_price_group, 
				       credit_limit, blocked, post_code, commerce_trade_no, total_quantity_tons, 
				       main_competitor, main_competitor_volume, potential, cardboard_utilization_category 
				FROM customers WHERE id = $1`, customerID)
		} else {
			rows, err = db.Query(`
				SELECT id, name, email, city, address, county, contact, phone, registration_no, 
				       vat_registration_no, payment_terms_code, salesperson_code, customer_price_group, 
				       credit_limit, blocked, post_code, commerce_trade_no, total_quantity_tons, 
				       main_competitor, main_competitor_volume, potential, cardboard_utilization_category 
				FROM customers ORDER BY name`)
		}
		if err == nil {
			defer rows.Close()
			var customers []Customer
			for rows.Next() {
				var c Customer
				var email, city, address, county, contact, phone, regNo, vatRegNo, payTerms, salesCode, priceGroup, blocked, postCode, commTradeNo, potential, category sql.NullString
				var creditLimit, totalQty, mainCompVol sql.NullFloat64
				var mainCompetitor sql.NullString
				if err := rows.Scan(
					&c.ID, &c.Name, &email, &city, &address, &county, &contact, &phone, &regNo, &vatRegNo, &payTerms, &salesCode, &priceGroup, &creditLimit, &blocked, &postCode, &commTradeNo, &totalQty, &mainCompetitor, &mainCompVol, &potential, &category,
				); err == nil {
					c.Email = email.String
					c.City = city.String
					c.Address = address.String
					c.County = county.String
					c.Contact = contact.String
					c.Phone = phone.String
					c.RegistrationNo = regNo.String
					c.VatRegistrationNo = vatRegNo.String
					c.PaymentTermsCode = payTerms.String
					c.SalespersonCode = salesCode.String
					c.CustomerPriceGroup = priceGroup.String
					c.CreditLimit = creditLimit.Float64
					c.Blocked = blocked.String
					c.PostCode = postCode.String
					c.CommerceTradeNo = commTradeNo.String
					c.TotalQuantityTons = totalQty.Float64
					c.MainCompetitor = mainCompetitor.String
					c.MainCompetitorVolume = mainCompVol.Float64
					c.Potential = potential.String
					c.CardboardUtilizationCategory = category.String
					customers = append(customers, c)
				} else {
					log.Printf("Scan failed: %v", err)
				}
			}
			if len(customers) > 0 {
				json.NewEncoder(w).Encode(customers)
				return
			}
		} else {
			log.Printf("DB query failed: %v, falling back to mock", err)
		}
	}

	// Fallback mock list
	mockCustomers := []Customer{
		{ID: "CUST001", Name: "EcoPackaging Solutions (Mock)", Email: "contact@ecopack.com", City: "Bucharest", Address: "12 Industrial Ave", County: "Ilfov", Contact: "Andrei Popa", Phone: "0722123456", RegistrationNo: "RO1234567", VatRegistrationNo: "RO1234567", PaymentTermsCode: "30D", SalespersonCode: "AM", CustomerPriceGroup: "BASE", CreditLimit: 150000, Blocked: " ", PostCode: "077120", CommerceTradeNo: "J40/123/2020", TotalQuantityTons: 25.5, MainCompetitor: "Dunapack", MainCompetitorVolume: 50.0, Potential: "High", CardboardUtilizationCategory: "Boxes & RSC"},
		{ID: "CUST002", Name: "Vrancart Distribution South (Mock)", Email: "sales@vrancart-south.ro", City: "Adjud", Address: "45 Ecaterina Teodoroiu", County: "Vrancea", Contact: "Mihai Ene", Phone: "0237640800", RegistrationNo: "RO9876543", VatRegistrationNo: "RO9876543", PaymentTermsCode: "60D", SalespersonCode: "AM", CustomerPriceGroup: "VIP", CreditLimit: 500000, Blocked: " ", PostCode: "625100", CommerceTradeNo: "J39/456/2005", TotalQuantityTons: 120.0, MainCompetitor: "Rondocarton", MainCompetitorVolume: 100.0, Potential: "Key Account", CardboardUtilizationCategory: "Corrugated Rolls"},
	}
	json.NewEncoder(w).Encode(mockCustomers)
}

func handleGetQuotes(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	claims, err := claimsFromToken(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnauthorized)
		return
	}

	role, _ := claims["role"].(string)
	salesCode, _ := claims["salesperson_code"].(string)
	customerID, _ := claims["customer_id"].(string)

	query := `
		SELECT q.id, q.customer_id, c.name as customer_name, q.salesperson_code, q.status, q.total_amount, q.created_at, q.updated_at 
		FROM quotes q 
		JOIN customers c ON q.customer_id = c.id`
	
	var args []interface{}
	// Secure routing:
	if role == "external" {
		if customerID == "" {
			http.Error(w, "Forbidden: No customer profile associated", http.StatusForbidden)
			return
		}
		query += " WHERE q.customer_id = $1"
		args = append(args, customerID)
	} else if role != "admin" && role != "viewer" && role != "production" && role != "management" && salesCode != "" {
		query += " WHERE q.salesperson_code = $1"
		args = append(args, salesCode)
	}
	query += " ORDER BY q.updated_at DESC"

	if db == nil {
		// Mock response if database isn't connected
		mockQuotes := []Quote{
			{ID: 101, CustomerID: "CUST001", CustomerName: "EcoPackaging Solutions (Mock)", SalespersonCode: "AM", Status: "Draft", TotalAmount: 1850.0, CreatedAt: time.Now(), UpdatedAt: time.Now()},
			{ID: 102, CustomerID: "CUST002", CustomerName: "Vrancart Distribution South (Mock)", SalespersonCode: "AM", Status: "Approved", TotalAmount: 43200.0, CreatedAt: time.Now().Add(-24 * time.Hour), UpdatedAt: time.Now()},
		}
		json.NewEncoder(w).Encode(mockQuotes)
		return
	}

	rows, err := db.Query(query, args...)
	if err != nil {
		http.Error(w, fmt.Sprintf("Query error: %v", err), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var quotes []Quote
	for rows.Next() {
		var q Quote
		if err := rows.Scan(&q.ID, &q.CustomerID, &q.CustomerName, &q.SalespersonCode, &q.Status, &q.TotalAmount, &q.CreatedAt, &q.UpdatedAt); err != nil {
			log.Printf("Scan quote failed: %v", err)
			continue
		}
		quotes = append(quotes, q)
	}

	if quotes == nil {
		quotes = []Quote{}
	}

	json.NewEncoder(w).Encode(quotes)
}

func handleGetQuoteDetails(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	claims, err := claimsFromToken(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnauthorized)
		return
	}

	role := claims["role"].(string)
	customerID, _ := claims["customer_id"].(string)
	salespersonCode, _ := claims["salesperson_code"].(string)

	vars := mux.Vars(r)
	quoteID, err := strconv.Atoi(vars["id"])
	if err != nil {
		http.Error(w, "Invalid quote ID", http.StatusBadRequest)
		return
	}

	if db == nil {
		http.Error(w, "Database unavailable", http.StatusInternalServerError)
		return
	}

	var q Quote
	err = db.QueryRow(`
		SELECT q.id, q.customer_id, c.name, q.salesperson_code, q.status, q.total_amount, q.created_at, q.updated_at 
		FROM quotes q 
		JOIN customers c ON q.customer_id = c.id 
		WHERE q.id = $1`, quoteID).Scan(&q.ID, &q.CustomerID, &q.CustomerName, &q.SalespersonCode, &q.Status, &q.TotalAmount, &q.CreatedAt, &q.UpdatedAt)
	if err == sql.ErrNoRows {
		http.Error(w, "Quote not found", http.StatusNotFound)
		return
	} else if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Security validation: external users can only view their own quotes
	if role == "external" && q.CustomerID != customerID {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	// Sales agents can only view their assigned quotes
	if role != "admin" && role != "viewer" && role != "production" && role != "management" && role != "external" && salespersonCode != "" && q.SalespersonCode != salespersonCode {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	rows, err := db.Query("SELECT id, quote_id, product_id, description, quantity, unit_price, total_price, config_params FROM quote_items WHERE quote_id = $1", quoteID)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var qi QuoteItem
			var prodID, configParams sql.NullString
			if err := rows.Scan(&qi.ID, &qi.QuoteID, &prodID, &qi.Description, &qi.Quantity, &qi.UnitPrice, &qi.TotalPrice, &configParams); err == nil {
				qi.ProductID = prodID.String
				qi.ConfigParams = configParams.String
				q.Items = append(q.Items, qi)
			}
		}
	}

	if q.Items == nil {
		q.Items = []QuoteItem{}
	}

	json.NewEncoder(w).Encode(q)
}

func validateQuoteMargins(role string, items []QuoteItem) error {
	if db == nil || productsDB == nil {
		return nil // skip validation if databases are unavailable
	}

	var minMargin, maxMargin float64
	err := db.QueryRow("SELECT min_margin, max_margin FROM role_margins WHERE role = $1", role).Scan(&minMargin, &maxMargin)
	if err == sql.ErrNoRows {
		// Default fallback
		minMargin, maxMargin = 10.0, 20.0
		if role == "admin" || role == "management" {
			minMargin, maxMargin = -100.0, 100.0
		}
	} else if err != nil {
		return fmt.Errorf("failed to fetch role margin limits: %v", err)
	}

	// Skip validation for admin/management if they have unlimited range
	if minMargin <= -99.9 && maxMargin >= 99.9 {
		return nil
	}

	for _, item := range items {
		var length, width, height float64
		var quantity int
		var material string
		var printing, dieCutting, gluing, stapling bool
		var toolingPrintingPlatesCost, toolingDieCutMoldsCost float64
		var toolingAmortizationVolume int
		var amortizeTooling bool

		// Check if config_params is populated
		if item.ConfigParams != "" {
			var params struct {
				Length                    float64 `json:"length"`
				Width                     float64 `json:"width"`
				Height                    float64 `json:"height"`
				Quantity                  int     `json:"quantity"`
				Material                  string  `json:"material"`
				Printing                  bool    `json:"printing"`
				DieCutting                bool    `json:"dieCutting"`
				Gluing                    bool    `json:"gluing"`
				Stapling                  bool    `json:"stapling"`
				ToolingPrintingPlatesCost float64 `json:"tooling_printing_plates_cost"`
				ToolingDieCutMoldsCost    float64 `json:"tooling_die_cut_molds_cost"`
				ToolingAmortizationVolume int     `json:"tooling_amortization_volume"`
				AmortizeTooling           bool    `json:"amortize_tooling"`
			}
			if err := json.Unmarshal([]byte(item.ConfigParams), &params); err == nil {
				length = params.Length
				width = params.Width
				height = params.Height
				quantity = params.Quantity
				material = params.Material
				printing = params.Printing
				dieCutting = params.DieCutting
				gluing = params.Gluing
				stapling = params.Stapling
				toolingPrintingPlatesCost = params.ToolingPrintingPlatesCost
				toolingDieCutMoldsCost = params.ToolingDieCutMoldsCost
				toolingAmortizationVolume = params.ToolingAmortizationVolume
				amortizeTooling = params.AmortizeTooling
			}
		}

		if quantity <= 0 {
			quantity = item.Quantity
		}
		if quantity <= 0 {
			quantity = 1
		}

		var unitCost float64
		isStandard := length == 0 && width == 0 && height == 0

		if isStandard {
			prodID := item.ProductID
			if prodID == "" {
				prodID = material
			}
			err := productsDB.QueryRow("SELECT unit_cost FROM products WHERE id = $1", prodID).Scan(&unitCost)
			if err != nil {
				// Fallback to unit cost if not found in db
				unitCost = item.UnitPrice * 0.7
			}
		} else {
			// Custom box pricing cost logic matching pricing_service
			surfaceArea := 2.0 * (length*width + length*height + width*height) / 1000000.0
			
			var materialPricePerSQM float64
			err := productsDB.QueryRow("SELECT unit_price FROM products WHERE id = $1", material).Scan(&materialPricePerSQM)
			if err != nil {
				switch material {
				case "Testliner":
					materialPricePerSQM = 0.80
				case "Schrenz":
					materialPricePerSQM = 0.60
				case "Wellenstoff":
					materialPricePerSQM = 0.70
				default:
					materialPricePerSQM = 0.80
				}
			}

			// Trim factor
			trimFactor := 0.05
			grossSheetArea := surfaceArea * (1.0 + trimFactor)

			// Machine Speeds
			runSpeed := 6000.0
			if printing {
				runSpeed *= 0.85
			}
			if dieCutting {
				runSpeed *= 0.80
			}
			if gluing || stapling {
				runSpeed *= 0.90
			}

			// Waste Sheets
			wasteQty := 50
			runningWaste := 0.015 * float64(quantity)
			if printing {
				runningWaste += 0.010 * float64(quantity)
			}
			if dieCutting {
				runningWaste += 0.010 * float64(quantity)
			}
			totalWaste := wasteQty + int(runningWaste)

			// Material Price including setup waste and running waste sheets
			totalSheetsNeeded := float64(quantity) + float64(totalWaste)
			materialPrice := totalSheetsNeeded * grossSheetArea * materialPricePerSQM

			// Setup times & costs
			corrugatorSetupTime := 15.0
			printingSetupTime := 0.0
			if printing {
				printingSetupTime = 15.0
			}
			dieCuttingSetupTime := 0.0
			if dieCutting {
				dieCuttingSetupTime = 20.0
			}
			gluingSetupTime := 0.0
			if gluing {
				gluingSetupTime = 15.0
			}
			staplingSetupTime := 0.0
			if stapling {
				staplingSetupTime = 10.0
			}

			corrugatorSetupRate := 300.0
			printerSetupRate := 150.0
			dieCutterSetupRate := 150.0
			gluerStaplerSetupRate := 100.0

			setupCost := (corrugatorSetupTime*corrugatorSetupRate +
				printingSetupTime*printerSetupRate +
				dieCuttingSetupTime*dieCutterSetupRate +
				(gluingSetupTime+staplingSetupTime)*gluerStaplerSetupRate) / 60.0

			// Running costs
			corrugatorRunRate := 600.0
			printerRunRate := 300.0
			dieCutterRunRate := 300.0
			gluerStaplerRunRate := 200.0

			corrugatorRunTimeHours := float64(quantity) / 6000.0
			convertingRunTimeHours := float64(quantity) / runSpeed

			printingRunCost := 0.0
			if printing {
				printingRunCost = convertingRunTimeHours * printerRunRate
			}
			dieCuttingRunCost := 0.0
			if dieCutting {
				dieCuttingRunCost = convertingRunTimeHours * dieCutterRunRate
			}
			gluingRunCost := 0.0
			if gluing {
				gluingRunCost = convertingRunTimeHours * gluerStaplerRunRate
			}
			staplingRunCost := 0.0
			if stapling {
				staplingRunCost = convertingRunTimeHours * gluerStaplerRunRate
			}

			runCost := (corrugatorRunTimeHours * corrugatorRunRate) +
				printingRunCost +
				dieCuttingRunCost +
				gluingRunCost +
				staplingRunCost

			// Tooling cost allocation
			totalTooling := toolingPrintingPlatesCost + toolingDieCutMoldsCost
			var toolingCost float64
			if amortizeTooling && toolingAmortizationVolume > 0 {
				toolingCost = float64(quantity) * (totalTooling / float64(toolingAmortizationVolume))
			} else if !amortizeTooling {
				toolingCost = totalTooling
			} else {
				toolingCost = 0.0
			}

			totalPrice := materialPrice + setupCost + runCost + toolingCost
			estProductionCost := totalPrice * 0.7
			unitCost = estProductionCost / float64(quantity)
		}

		if item.UnitPrice <= 0 {
			continue // skip empty items
		}

		margin := ((item.UnitPrice - unitCost) / item.UnitPrice) * 100.0
		if margin < minMargin || margin > maxMargin {
			return fmt.Errorf("Sales margin violation for item '%s': role '%s' allowed range is %.1f%% to %.1f%%, item margin is %.1f%% (price: %.4f, production cost: %.4f)",
				item.Description, role, minMargin, maxMargin, margin, item.UnitPrice, unitCost)
		}
	}

	return nil
}

func handleCreateQuote(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	claims, err := claimsFromToken(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnauthorized)
		return
	}

	role := claims["role"].(string)
	salesCode := claims["salesperson_code"].(string)

	var req Quote
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid payload", http.StatusBadRequest)
		return
	}

	if err := validateQuoteMargins(role, req.Items); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if req.CustomerID == "" {
		http.Error(w, "customer_id is required", http.StatusBadRequest)
		return
	}

	// Auto-assign salesperson code if user is sales
	if role != "admin" && role != "management" && salesCode != "" {
		req.SalespersonCode = salesCode
	} else if req.SalespersonCode == "" {
		req.SalespersonCode = "AM" // Fallback administrator
	}

	if req.Status == "" {
		req.Status = "Draft"
	}

	if db == nil {
		http.Error(w, "Database unavailable", http.StatusInternalServerError)
		return
	}

	tx, err := db.Begin()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	var quoteID int
	err = tx.QueryRow(`
		INSERT INTO quotes (customer_id, salesperson_code, status, total_amount) 
		VALUES ($1, $2, $3, $4) RETURNING id`, 
		req.CustomerID, req.SalespersonCode, req.Status, 0.0,
	).Scan(&quoteID)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to insert quote: %v", err), http.StatusInternalServerError)
		return
	}

	var totalAmount float64
	for _, item := range req.Items {
		itemTotal := float64(item.Quantity) * item.UnitPrice
		totalAmount += itemTotal

		_, err = tx.Exec(`
			INSERT INTO quote_items (quote_id, product_id, description, quantity, unit_price, total_price, config_params) 
			VALUES ($1, NULLIF($2, ''), $3, $4, $5, $6, $7)`,
			quoteID, item.ProductID, item.Description, item.Quantity, item.UnitPrice, itemTotal, item.ConfigParams,
		)
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to insert item: %v", err), http.StatusInternalServerError)
			return
		}
	}

	// Update the total amount in header
	_, err = tx.Exec("UPDATE quotes SET total_amount = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2", totalAmount, quoteID)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to update quote total: %v", err), http.StatusInternalServerError)
		return
	}

	err = tx.Commit()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	req.ID = quoteID
	req.TotalAmount = totalAmount
	req.CreatedAt = time.Now()
	req.UpdatedAt = time.Now()

	json.NewEncoder(w).Encode(req)
}

func handleUpdateQuote(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	claims, err := claimsFromToken(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnauthorized)
		return
	}

	role := claims["role"].(string)
	salespersonCode, _ := claims["salesperson_code"].(string)
	customerID, _ := claims["customer_id"].(string)

	vars := mux.Vars(r)
	quoteID, err := strconv.Atoi(vars["id"])
	if err != nil {
		http.Error(w, "Invalid quote ID", http.StatusBadRequest)
		return
	}

	var req Quote
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid payload", http.StatusBadRequest)
		return
	}

	if db == nil {
		http.Error(w, "Database unavailable", http.StatusInternalServerError)
		return
	}

	// Fetch existing quote to check owner
	var existingSalesCode, existingCustomerID string
	err = db.QueryRow("SELECT salesperson_code, customer_id FROM quotes WHERE id = $1", quoteID).Scan(&existingSalesCode, &existingCustomerID)
	if err == sql.ErrNoRows {
		http.Error(w, "Quote not found", http.StatusNotFound)
		return
	} else if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Security validation: external users can only update their own quotes
	if role == "external" && existingCustomerID != customerID {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	// Sales agents can only update their assigned quotes (unless admin, viewer, production, or management)
	if role != "admin" && role != "viewer" && role != "production" && role != "management" && role != "external" && salespersonCode != "" && existingSalesCode != salespersonCode {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	// Validate margins if updating items
	if len(req.Items) > 0 {
		if err := validateQuoteMargins(role, req.Items); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
	}

	tx, err := db.Begin()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	// Archive the current active state as a history version before modifying
	if err := saveQuoteVersionSnapshot(tx, quoteID); err != nil {
		log.Printf("Error saving quote version snapshot for quote %d: %v", quoteID, err)
		http.Error(w, fmt.Sprintf("Failed to save quote history: %v", err), http.StatusInternalServerError)
		return
	}

	// Update Quote Header (only updating mutable status or total amount)
	_, err = tx.Exec(`
		UPDATE quotes 
		SET status = $1, updated_at = CURRENT_TIMESTAMP 
		WHERE id = $2`, 
		req.Status, quoteID,
	)
	if err != nil {
		http.Error(w, fmt.Sprintf("Update failed: %v", err), http.StatusInternalServerError)
		return
	}

	// If items are provided in update payload, overwrite existing ones
	if len(req.Items) > 0 {
		_, err = tx.Exec("DELETE FROM quote_items WHERE quote_id = $1", quoteID)
		if err != nil {
			http.Error(w, fmt.Sprintf("Clean items failed: %v", err), http.StatusInternalServerError)
			return
		}

		var totalAmount float64
		for _, item := range req.Items {
			itemTotal := float64(item.Quantity) * item.UnitPrice
			totalAmount += itemTotal

			_, err = tx.Exec(`
				INSERT INTO quote_items (quote_id, product_id, description, quantity, unit_price, total_price, config_params) 
				VALUES ($1, NULLIF($2, ''), $3, $4, $5, $6, $7)`,
				quoteID, item.ProductID, item.Description, item.Quantity, item.UnitPrice, itemTotal, item.ConfigParams,
			)
			if err != nil {
				http.Error(w, fmt.Sprintf("Re-insert item failed: %v", err), http.StatusInternalServerError)
				return
			}
		}

		_, err = tx.Exec("UPDATE quotes SET total_amount = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2", totalAmount, quoteID)
		if err != nil {
			http.Error(w, fmt.Sprintf("Re-update total failed: %v", err), http.StatusInternalServerError)
			return
		}
	}

	err = tx.Commit()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Write([]byte(`{"status":"success"}`))
}

func handleDeleteQuote(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	claims, ok := authorize(w, r, salesRoles)
	if !ok {
		return
	}
	vars := mux.Vars(r)
	quoteID, err := strconv.Atoi(vars["id"])
	if err != nil {
		http.Error(w, "Invalid quote ID", http.StatusBadRequest)
		return
	}

	if db == nil {
		http.Error(w, "Database unavailable", http.StatusInternalServerError)
		return
	}

	// Non-manager roles may only delete their own quotes.
	if !managerRoles[claimStr(claims, "role")] {
		salesCode := claimStr(claims, "salesperson_code")
		var owner string
		if err := db.QueryRow("SELECT salesperson_code FROM quotes WHERE id = $1", quoteID).Scan(&owner); err != nil {
			http.Error(w, "Quote not found", http.StatusNotFound)
			return
		}
		if salesCode == "" || owner != salesCode {
			http.Error(w, "Forbidden: not your quote", http.StatusForbidden)
			return
		}
	}

	_, err = db.Exec("DELETE FROM quotes WHERE id = $1", quoteID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Write([]byte(`{"status":"success"}`))
}

func handleGetCustomerQuotes(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	claims, ok := authorize(w, r, nil)
	if !ok {
		return
	}
	vars := mux.Vars(r)
	customerID := vars["id"]

	// External (B2B) users may only read their own customer's quotes.
	if claimStr(claims, "role") == "external" {
		if cid := claimStr(claims, "customer_id"); cid == "" || cid != customerID {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
	}

	if db == nil {
		// Mock response if database isn't connected
		mockQuotes := []Quote{
			{ID: 101, CustomerID: customerID, SalespersonCode: "AM", Status: "Draft", TotalAmount: 1850.0, CreatedAt: time.Now(), UpdatedAt: time.Now()},
		}
		json.NewEncoder(w).Encode(mockQuotes)
		return
	}

	rows, err := db.Query(`
		SELECT q.id, q.customer_id, c.name, q.salesperson_code, q.status, q.total_amount, q.created_at, q.updated_at 
		FROM quotes q 
		JOIN customers c ON q.customer_id = c.id 
		WHERE q.customer_id = $1 
		ORDER BY q.updated_at DESC`, customerID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var quotes []Quote
	for rows.Next() {
		var q Quote
		if err := rows.Scan(&q.ID, &q.CustomerID, &q.CustomerName, &q.SalespersonCode, &q.Status, &q.TotalAmount, &q.CreatedAt, &q.UpdatedAt); err == nil {
			quotes = append(quotes, q)
		}
	}

	if quotes == nil {
		quotes = []Quote{}
	}

	json.NewEncoder(w).Encode(quotes)
}

func handleGetProductionJobs(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	claims, err := claimsFromToken(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnauthorized)
		return
	}

	role := claims["role"].(string)
	customerIDClaim, _ := claims["customer_id"].(string)

	customerID := r.URL.Query().Get("customer_id")
	if role == "external" {
		if customerIDClaim == "" {
			http.Error(w, "Forbidden: No customer profile associated", http.StatusForbidden)
			return
		}
		customerID = customerIDClaim
	}

	dwhConnStr := dwhURL
	dwhDB, err := sql.Open("postgres", dwhConnStr)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to connect to DWH: %v", err), http.StatusInternalServerError)
		return
	}
	defer dwhDB.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	query := `
		SELECT
			c."Code" as CustomerCode,
			c."Name" as CustomerName,
			COALESCE(a."Number", '') AS CodArticol,
			COALESCE(a."Description", '') as NumeArticol,
			COALESCE(o."OrderNumber", '') || ' ' || COALESCE(o."PartNumber", '') AS NumarComanda,
			COALESCE(o."OrderedQuantity", 0) as Cantitate,
			CASE
				WHEN m."MachineType" > 1
					THEN op."TotalQuantity"
				ELSE SUM(FLOOR(
					(CASE WHEN cb."RunMeters" IS NOT NULL AND cb."RunMeters" > 0 THEN cb."RunMeters" ELSE 0 END) * 1000.0 /
					(CASE WHEN o."GivenSheetLength" IS NOT NULL THEN o."GivenSheetLength" ELSE a."SheetLength" END))
					* co."Outs" * op."M0Divisor")
			END AS CantitateProdusa,
			cast(op."ScheduleDate" as text) as DataPlanificata,
			CASE
				WHEN op."Status" = 2
					THEN CASE
						WHEN m."MachineType" > 1 THEN cast(op."EndRun" as text)
						ELSE cast(MAX(cb."EndRun") as text)
					END
				ELSE NULL
			END AS DataProductie,
			op."Status" as Status,
			COALESCE(m."MachineCode", '') as MachineCode
		FROM ss02."operations_v" op
		INNER JOIN ss02."orders_v" o ON o."ID" = op."OrderID"
		INNER JOIN ss02."customers_v" c ON c."ID" = o."CustomerID"
		INNER JOIN ss02."articles_v" a ON a."ID" = o."ArticleID"
		INNER JOIN ss02."boardgrades_v" bg ON bg."ID" = a."BoardGradeID"
		INNER JOIN ss02."machines_v" m ON m."ID" = op."MachineID"
		LEFT OUTER JOIN ss02."combinationorders_v" co ON co."OperationID" = op."ID"
		LEFT OUTER JOIN ss02."combinations_v" cb ON cb."ID" = co."CombinationID"
		WHERE 
			o."CreationDate" > cast((current_timestamp - INTERVAL '18 months') as date)
			AND op."IsLastReal" = True
			AND LEFT(c."Code",1) like 'C%'`

	var args []interface{}
	if customerID != "" {
		query += ` AND c."Code" = $1`
		args = append(args, customerID)
	}

	query += `
		GROUP BY
			c."Code", c."Name", a."Number", a."Description", a."SheetLength",
			a."SheetWidth", bg."Code", bg."Weight", o."OrderedQuantity",
			o."OrderNumber", o."PartNumber", o."OrderedQuantity",
			o."CreationDate", m."MachineCode", m."MachineType", op."Status",
			op."ScheduleDate", op."EndRun", op."ScheduleQuantity", op."TotalQuantity", 
			op."WasteQuantity", op."M0Divisor"
		ORDER BY op."ScheduleDate" DESC`

	if customerID == "" {
		query += " LIMIT 500"
	}

	rows, err := dwhDB.QueryContext(ctx, query, args...)
	if err != nil {
		log.Printf("DWH query failed: %v, using mock fallback", err)
		mockJobs := []ProductionJob{
			{NrCrt: 1, CustomerCode: "C000605", CustomerName: "IMPAR SRL O. SECUIESC (Fallback)", ProductCode: "3300902", ProductName: "IMPAR CUTIE EXT_420x180x270", OrderNumber: "CPO0046070", QuantityOrdered: 3135, QuantityProduced: 3319, ScheduledDate: "2026-04-20 12:30:20", ProductionDate: "2026-04-20 13:29:23", Status: 2, MachineCode: "FOSBER"},
			{NrCrt: 2, CustomerCode: "C000605", CustomerName: "IMPAR SRL O. SECUIESC (Fallback)", ProductCode: "3308185", ProductName: "IMPAR 201 CO3 E 220X170X90", OrderNumber: "CPO0040811", QuantityOrdered: 5000, QuantityProduced: 1200, ScheduledDate: "2026-03-09 15:55:42", Status: 1, MachineCode: "BOBST"},
			{NrCrt: 3, CustomerCode: "C005937", CustomerName: "KLAUSEN EXIM CLUJ (Fallback)", ProductCode: "3304992", ProductName: "KLAUSEN BOX", OrderNumber: "CPO0040999", QuantityOrdered: 2000, QuantityProduced: 0, ScheduledDate: "2026-05-15 08:00:00", Status: 0, MachineCode: "MARTIN"},
		}
		json.NewEncoder(w).Encode(mockJobs)
		return
	}
	defer rows.Close()

	var jobs []ProductionJob
	nrCrt := 1
	for rows.Next() {
		var j ProductionJob
		var prodDate sql.NullString
		var qtyProd sql.NullFloat64
		if err := rows.Scan(
			&j.CustomerCode, &j.CustomerName, &j.ProductCode, &j.ProductName,
			&j.OrderNumber, &j.QuantityOrdered, &qtyProd, &j.ScheduledDate,
			&prodDate, &j.Status, &j.MachineCode,
		); err == nil {
			j.NrCrt = nrCrt
			j.QuantityProduced = qtyProd.Float64
			j.ProductionDate = prodDate.String
			jobs = append(jobs, j)
			nrCrt++
		}
	}

	if jobs == nil {
		jobs = []ProductionJob{}
	}

	json.NewEncoder(w).Encode(jobs)
}

type QuoteVersionInfo struct {
	Version     int       `json:"version"`
	Status      string    `json:"status"`
	TotalAmount float64   `json:"total_amount"`
	CreatedAt   time.Time `json:"created_at"`
}

func saveQuoteVersionSnapshot(tx *sql.Tx, quoteID int) error {
	var status string
	var totalAmount float64
	err := tx.QueryRow("SELECT status, total_amount FROM quotes WHERE id = $1", quoteID).Scan(&status, &totalAmount)
	if err != nil {
		return err
	}

	rows, err := tx.Query("SELECT product_id, description, quantity, unit_price, total_price, config_params FROM quote_items WHERE quote_id = $1", quoteID)
	if err != nil {
		return err
	}
	defer rows.Close()

	var items []QuoteItem
	for rows.Next() {
		var qi QuoteItem
		var prodID, configParams sql.NullString
		if err := rows.Scan(&prodID, &qi.Description, &qi.Quantity, &qi.UnitPrice, &qi.TotalPrice, &configParams); err == nil {
			qi.ProductID = prodID.String
			qi.ConfigParams = configParams.String
			items = append(items, qi)
		}
	}

	itemsJSON, err := json.Marshal(items)
	if err != nil {
		return err
	}

	var nextVersion int
	err = tx.QueryRow("SELECT COALESCE(MAX(version), 0) + 1 FROM quote_versions WHERE quote_id = $1", quoteID).Scan(&nextVersion)
	if err != nil {
		return err
	}

	_, err = tx.Exec(`
		INSERT INTO quote_versions (quote_id, version, status, total_amount, items) 
		VALUES ($1, $2, $3, $4, $5)`,
		quoteID, nextVersion, status, totalAmount, string(itemsJSON),
	)
	return err
}

func handleGetQuoteVersions(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	vars := mux.Vars(r)
	quoteID, err := strconv.Atoi(vars["id"])
	if err != nil {
		http.Error(w, "Invalid quote ID", http.StatusBadRequest)
		return
	}

	if db == nil {
		http.Error(w, "Database unavailable", http.StatusInternalServerError)
		return
	}

	rows, err := db.Query("SELECT version, status, total_amount, created_at FROM quote_versions WHERE quote_id = $1 ORDER BY version DESC", quoteID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	versions := []QuoteVersionInfo{}
	for rows.Next() {
		var vi QuoteVersionInfo
		if err := rows.Scan(&vi.Version, &vi.Status, &vi.TotalAmount, &vi.CreatedAt); err == nil {
			versions = append(versions, vi)
		}
	}

	json.NewEncoder(w).Encode(versions)
}

func handleRestoreQuoteVersion(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	vars := mux.Vars(r)
	quoteID, err := strconv.Atoi(vars["id"])
	version, err2 := strconv.Atoi(vars["version"])
	if err != nil || err2 != nil {
		http.Error(w, "Invalid parameters", http.StatusBadRequest)
		return
	}

	if db == nil {
		http.Error(w, "Database unavailable", http.StatusInternalServerError)
		return
	}

	tx, err := db.Begin()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	// 1. Snapshot the CURRENT active state as a new version first, so the user doesn't lose current work
	err = saveQuoteVersionSnapshot(tx, quoteID)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to archive current state: %v", err), http.StatusInternalServerError)
		return
	}

	// 2. Fetch the target version details from quote_versions
	var status string
	var totalAmount float64
	var itemsJSON string
	err = tx.QueryRow("SELECT status, total_amount, items FROM quote_versions WHERE quote_id = $1 AND version = $2", quoteID, version).Scan(&status, &totalAmount, &itemsJSON)
	if err == sql.ErrNoRows {
		http.Error(w, "Target version not found", http.StatusNotFound)
		return
	} else if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// 3. Clear existing active items
	_, err = tx.Exec("DELETE FROM quote_items WHERE quote_id = $1", quoteID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// 4. Unmarshal items from JSON and insert into active quote_items
	var items []QuoteItem
	err = json.Unmarshal([]byte(itemsJSON), &items)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to parse archived items: %v", err), http.StatusInternalServerError)
		return
	}

	for _, item := range items {
		_, err = tx.Exec(`
			INSERT INTO quote_items (quote_id, product_id, description, quantity, unit_price, total_price, config_params) 
			VALUES ($1, NULLIF($2, ''), $3, $4, $5, $6, $7)`,
			quoteID, item.ProductID, item.Description, item.Quantity, item.UnitPrice, item.TotalPrice, item.ConfigParams,
		)
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to restore item: %v", err), http.StatusInternalServerError)
			return
		}
	}

	// 5. Update quote header to match restored state
	_, err = tx.Exec("UPDATE quotes SET status = $1, total_amount = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3", status, totalAmount, quoteID)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to restore header: %v", err), http.StatusInternalServerError)
		return
	}

	// 6. Delete the restored version from quote_versions (since it is now the active state)
	_, err = tx.Exec("DELETE FROM quote_versions WHERE quote_id = $1 AND version = $2", quoteID, version)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	err = tx.Commit()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Write([]byte(`{"status":"success"}`))
}

type Lead struct {
	ID              int       `json:"id"`
	Name            string    `json:"name"`
	Company         string    `json:"company"`
	Email           string    `json:"email"`
	Phone           string    `json:"phone"`
	Status          string    `json:"status"`
	SalespersonCode string    `json:"salesperson_code"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

type Opportunity struct {
	ID              int       `json:"id"`
	CustomerID      string    `json:"customer_id"`
	CustomerName    string    `json:"customer_name,omitempty"`
	Title           string    `json:"title"`
	Stage           string    `json:"stage"`
	ExpectedValue   float64   `json:"expected_value"`
	QuoteID         *int      `json:"quote_id"`
	SalespersonCode string    `json:"salesperson_code"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

type Project struct {
	ID             int       `json:"id"`
	CustomerID     string    `json:"customer_id"`
	CustomerName   string    `json:"customer_name,omitempty"`
	Name           string    `json:"name"`
	Status         string    `json:"status"`
	OpportunityID  *int      `json:"opportunity_id"`
	DeliveryDate   string    `json:"delivery_date"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

type LabTest struct {
	ID               int       `json:"id"`
	BatchID          string    `json:"batch_id"`
	ProductionLine   string    `json:"production_line"`
	TestingTimestamp time.Time `json:"testing_timestamp"`
	ECT              float64   `json:"ect"`
	BCT              float64   `json:"bct"`
	FCT              float64   `json:"fct"`
	BurstingStrength float64   `json:"bursting_strength"`
	CobbTest         float64   `json:"cobb_test"`
	MaterialGrade    string    `json:"material_grade"`
	DeliveryNoteNo   string    `json:"delivery_note_no"`
}

type Claim struct {
	ID                 int        `json:"id"`
	CustomerID         string     `json:"customer_id"`
	CustomerName       string     `json:"customer_name,omitempty"`
	QuoteID            *int       `json:"quote_id"`
	BatchID            *string    `json:"batch_id"`
	RootCauseCategory  string     `json:"root_cause_category"`
	RootCauseDetails   string     `json:"root_cause_details"`
	Status             string     `json:"status"`
	Description        string     `json:"description"`
	ResolutionDecision *string    `json:"resolution_decision"`
	CreditNoteAmount   float64    `json:"credit_note_amount"`
	ReplacementQuoteID *int       `json:"replacement_quote_id"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
}

type QualityConfig struct {
	Key       string    `json:"key"`
	Value     float64   `json:"value"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Leads handlers
func handleGetLeads(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if _, ok := authorize(w, r, salesRoles); !ok {
		return
	}
	if db == nil {
		json.NewEncoder(w).Encode([]Lead{})
		return
	}
	rows, err := db.Query("SELECT id, name, company, email, phone, status, salesperson_code, created_at, updated_at FROM leads ORDER BY created_at DESC")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	var list []Lead
	for rows.Next() {
		var l Lead
		var email, phone, salesCode sql.NullString
		if err := rows.Scan(&l.ID, &l.Name, &l.Company, &email, &phone, &l.Status, &salesCode, &l.CreatedAt, &l.UpdatedAt); err == nil {
			l.Email = email.String
			l.Phone = phone.String
			l.SalespersonCode = salesCode.String
			list = append(list, l)
		}
	}
	if list == nil { list = []Lead{} }
	json.NewEncoder(w).Encode(list)
}

func handleCreateLead(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if _, ok := authorize(w, r, salesRoles); !ok {
		return
	}
	var req Lead
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid payload", http.StatusBadRequest)
		return
	}
	if db == nil {
		http.Error(w, "Database unavailable", http.StatusInternalServerError)
		return
	}
	err := db.QueryRow(`
		INSERT INTO leads (name, company, email, phone, status, salesperson_code) 
		VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, created_at, updated_at`,
		req.Name, req.Company, req.Email, req.Phone, req.Status, req.SalespersonCode,
	).Scan(&req.ID, &req.CreatedAt, &req.UpdatedAt)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(req)
}

func handleUpdateLead(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if _, ok := authorize(w, r, salesRoles); !ok {
		return
	}
	vars := mux.Vars(r)
	id, _ := strconv.Atoi(vars["id"])
	var req Lead
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid payload", http.StatusBadRequest)
		return
	}
	if db == nil {
		http.Error(w, "Database unavailable", http.StatusInternalServerError)
		return
	}
	_, err := db.Exec(`
		UPDATE leads 
		SET name = $1, company = $2, email = $3, phone = $4, status = $5, salesperson_code = $6, updated_at = CURRENT_TIMESTAMP 
		WHERE id = $7`,
		req.Name, req.Company, req.Email, req.Phone, req.Status, req.SalespersonCode, id,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Write([]byte(`{"status":"success"}`))
}

// Opportunities handlers
func handleGetOpportunities(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if _, ok := authorize(w, r, salesRoles); !ok {
		return
	}
	if db == nil {
		json.NewEncoder(w).Encode([]Opportunity{})
		return
	}
	rows, err := db.Query(`
		SELECT o.id, o.customer_id, c.name, o.title, o.stage, o.expected_value, o.quote_id, o.salesperson_code, o.created_at, o.updated_at 
		FROM opportunities o
		LEFT JOIN customers c ON o.customer_id = c.id
		ORDER BY o.created_at DESC`)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	var list []Opportunity
	for rows.Next() {
		var o Opportunity
		var custID, custName, salesCode sql.NullString
		var quoteID sql.NullInt64
		if err := rows.Scan(&o.ID, &custID, &custName, &o.Title, &o.Stage, &o.ExpectedValue, &quoteID, &salesCode, &o.CreatedAt, &o.UpdatedAt); err == nil {
			o.CustomerID = custID.String
			o.CustomerName = custName.String
			o.SalespersonCode = salesCode.String
			if quoteID.Valid {
				v := int(quoteID.Int64)
				o.QuoteID = &v
			}
			list = append(list, o)
		}
	}
	if list == nil { list = []Opportunity{} }
	json.NewEncoder(w).Encode(list)
}

func handleCreateOpportunity(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if _, ok := authorize(w, r, salesRoles); !ok {
		return
	}
	var req Opportunity
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid payload", http.StatusBadRequest)
		return
	}
	if db == nil {
		http.Error(w, "Database unavailable", http.StatusInternalServerError)
		return
	}
	
	var quoteIDVal interface{}
	if req.QuoteID != nil {
		quoteIDVal = *req.QuoteID
	} else {
		quoteIDVal = nil
	}

	err := db.QueryRow(`
		INSERT INTO opportunities (customer_id, title, stage, expected_value, quote_id, salesperson_code) 
		VALUES (NULLIF($1, ''), $2, $3, $4, $5, $6) RETURNING id, created_at, updated_at`,
		req.CustomerID, req.Title, req.Stage, req.ExpectedValue, quoteIDVal, req.SalespersonCode,
	).Scan(&req.ID, &req.CreatedAt, &req.UpdatedAt)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(req)
}

func handleUpdateOpportunity(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if _, ok := authorize(w, r, salesRoles); !ok {
		return
	}
	vars := mux.Vars(r)
	id, _ := strconv.Atoi(vars["id"])
	var req Opportunity
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid payload", http.StatusBadRequest)
		return
	}
	if db == nil {
		http.Error(w, "Database unavailable", http.StatusInternalServerError)
		return
	}

	var quoteIDVal interface{}
	if req.QuoteID != nil {
		quoteIDVal = *req.QuoteID
	} else {
		quoteIDVal = nil
	}

	_, err := db.Exec(`
		UPDATE opportunities 
		SET customer_id = NULLIF($1, ''), title = $2, stage = $3, expected_value = $4, quote_id = $5, salesperson_code = $6, updated_at = CURRENT_TIMESTAMP 
		WHERE id = $7`,
		req.CustomerID, req.Title, req.Stage, req.ExpectedValue, quoteIDVal, req.SalespersonCode, id,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Write([]byte(`{"status":"success"}`))
}

// Projects handlers
func handleGetProjects(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if _, ok := authorize(w, r, nil); !ok {
		return
	}
	if db == nil {
		json.NewEncoder(w).Encode([]Project{})
		return
	}
	rows, err := db.Query(`
		SELECT p.id, p.customer_id, c.name, p.name, p.status, p.opportunity_id, p.delivery_date, p.created_at, p.updated_at 
		FROM projects p
		LEFT JOIN customers c ON p.customer_id = c.id
		ORDER BY p.created_at DESC`)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	var list []Project
	for rows.Next() {
		var pr Project
		var custID, custName, delDate sql.NullString
		var oppID sql.NullInt64
		if err := rows.Scan(&pr.ID, &custID, &custName, &pr.Name, &pr.Status, &oppID, &delDate, &pr.CreatedAt, &pr.UpdatedAt); err == nil {
			pr.CustomerID = custID.String
			pr.CustomerName = custName.String
			pr.DeliveryDate = delDate.String
			if oppID.Valid {
				v := int(oppID.Int64)
				pr.OpportunityID = &v
			}
			list = append(list, pr)
		}
	}
	if list == nil { list = []Project{} }
	json.NewEncoder(w).Encode(list)
}

func handleCreateProject(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if _, ok := authorize(w, r, salesRoles); !ok {
		return
	}
	var req Project
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid payload", http.StatusBadRequest)
		return
	}
	if db == nil {
		http.Error(w, "Database unavailable", http.StatusInternalServerError)
		return
	}

	var oppIDVal interface{}
	if req.OpportunityID != nil {
		oppIDVal = *req.OpportunityID
	} else {
		oppIDVal = nil
	}

	err := db.QueryRow(`
		INSERT INTO projects (customer_id, name, status, opportunity_id, delivery_date) 
		VALUES (NULLIF($1, ''), $2, $3, $4, NULLIF($5, '')::DATE) RETURNING id, created_at, updated_at`,
		req.CustomerID, req.Name, req.Status, oppIDVal, req.DeliveryDate,
	).Scan(&req.ID, &req.CreatedAt, &req.UpdatedAt)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(req)
}

func handleUpdateProject(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if _, ok := authorize(w, r, salesRoles); !ok {
		return
	}
	vars := mux.Vars(r)
	id, _ := strconv.Atoi(vars["id"])
	var req Project
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid payload", http.StatusBadRequest)
		return
	}
	if db == nil {
		http.Error(w, "Database unavailable", http.StatusInternalServerError)
		return
	}

	var oppIDVal interface{}
	if req.OpportunityID != nil {
		oppIDVal = *req.OpportunityID
	} else {
		oppIDVal = nil
	}

	_, err := db.Exec(`
		UPDATE projects 
		SET customer_id = NULLIF($1, ''), name = $2, status = $3, opportunity_id = $4, delivery_date = NULLIF($5, '')::DATE, updated_at = CURRENT_TIMESTAMP 
		WHERE id = $6`,
		req.CustomerID, req.Name, req.Status, oppIDVal, req.DeliveryDate, id,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if strings.ToLower(req.Status) == "completed" {
		batchID := fmt.Sprintf("BATCH-PROJ-%d", id)
		_, errIns := db.Exec(`
			INSERT INTO lab_tests (batch_id, production_line, ect, bct, fct, bursting_strength, cobb_test, material_grade, delivery_note_no)
			VALUES ($1, 'Corrugator L1', 0.0, 0.0, 0.0, 0.0, 0.0, 'Draft', $2)
			ON CONFLICT (batch_id) DO NOTHING`,
			batchID, fmt.Sprintf("DN-PROJ-%d", id),
		)
		if errIns != nil {
			log.Printf("Error creating draft lab test for completed project: %v", errIns)
		}
	}

	w.Write([]byte(`{"status":"success"}`))
}

type CustomerMetricsResponse struct {
	Invoices  MetricSummary    `json:"invoices"`
	Orders    MetricSummary    `json:"orders"`
	Grades    []GradeMetric    `json:"grades"`
	ItemCosts []ItemCostMetric `json:"item_costs"`
}

type ItemCostMetric struct {
	ItemNo       string        `json:"item_no"`
	Description  string        `json:"description"`
	LastCost     float64       `json:"last_cost"`
	LastCostDate string        `json:"last_cost_date"`
	History      []MonthlyCost `json:"history"`
}

type MonthlyCost struct {
	Month string  `json:"month"`
	Cost  float64 `json:"cost"`
}

type MetricSummary struct {
	Val1m  float64 `json:"val_1m"`
	Qty1m  float64 `json:"qty_1m"`
	Kg1m   float64 `json:"kg_1m"`
	Val2m  float64 `json:"val_2m"`
	Qty2m  float64 `json:"qty_2m"`
	Kg2m   float64 `json:"kg_2m"`
	Val3m  float64 `json:"val_3m"`
	Qty3m  float64 `json:"qty_3m"`
	Kg3m   float64 `json:"kg_3m"`
	Val6m  float64 `json:"val_6m"`
	Qty6m  float64 `json:"qty_6m"`
	Kg6m   float64 `json:"kg_6m"`
	Val12m float64 `json:"val_12m"`
	Qty12m float64 `json:"qty_12m"`
	Kg12m  float64 `json:"kg_12m"`
}

type GradeMetric struct {
	BoardGrade string  `json:"board_grade"`
	TotalValue float64 `json:"total_value"`
	TotalQty   float64 `json:"total_qty"`
	TotalKg    float64 `json:"total_kg"`
}

func handleGetCustomerMetrics(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	claims, err := claimsFromToken(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnauthorized)
		return
	}

	role, _ := claims["role"].(string)
	customerIDClaim, _ := claims["customer_id"].(string)

	vars := mux.Vars(r)
	customerID := vars["id"]

	if role == "external" {
		if customerIDClaim == "" || customerIDClaim != customerID {
			http.Error(w, "Forbidden: Access restricted", http.StatusForbidden)
			return
		}
	} else if !salesRoles[role] {
		http.Error(w, "Forbidden: insufficient role", http.StatusForbidden)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var res CustomerMetricsResponse

	if productsDB == nil {
		http.Error(w, "Database unavailable", http.StatusInternalServerError)
		return
	}

	// 1. Invoices Metrics Query
	err = productsDB.QueryRowContext(ctx, `
		SELECT 
			val_1m, qty_1m, kg_1m,
			val_2m, qty_2m, kg_2m,
			val_3m, qty_3m, kg_3m,
			val_6m, qty_6m, kg_6m,
			val_12m, qty_12m, kg_12m
		FROM mv_customer_invoice_metrics
		WHERE customer_id = $1`, customerID).Scan(
		&res.Invoices.Val1m, &res.Invoices.Qty1m, &res.Invoices.Kg1m,
		&res.Invoices.Val2m, &res.Invoices.Qty2m, &res.Invoices.Kg2m,
		&res.Invoices.Val3m, &res.Invoices.Qty3m, &res.Invoices.Kg3m,
		&res.Invoices.Val6m, &res.Invoices.Qty6m, &res.Invoices.Kg6m,
		&res.Invoices.Val12m, &res.Invoices.Qty12m, &res.Invoices.Kg12m,
	)
	if err == sql.ErrNoRows {
		err = nil
	} else if err != nil {
		log.Printf("Failed to scan invoice metrics: %v", err)
	}

	// 2. Orders Metrics Query
	err = productsDB.QueryRowContext(ctx, `
		SELECT 
			val_1m, qty_1m, kg_1m,
			val_2m, qty_2m, kg_2m,
			val_3m, qty_3m, kg_3m,
			val_6m, qty_6m, kg_6m,
			val_12m, qty_12m, kg_12m
		FROM mv_customer_order_metrics
		WHERE customer_id = $1`, customerID).Scan(
		&res.Orders.Val1m, &res.Orders.Qty1m, &res.Orders.Kg1m,
		&res.Orders.Val2m, &res.Orders.Qty2m, &res.Orders.Kg2m,
		&res.Orders.Val3m, &res.Orders.Qty3m, &res.Orders.Kg3m,
		&res.Orders.Val6m, &res.Orders.Qty6m, &res.Orders.Kg6m,
		&res.Orders.Val12m, &res.Orders.Qty12m, &res.Orders.Kg12m,
	)
	if err == sql.ErrNoRows {
		err = nil
	} else if err != nil {
		log.Printf("Failed to scan order metrics: %v", err)
	}

	// 3. Cardboard Grades Breakdown Query
	gradesRows, err := productsDB.QueryContext(ctx, `
		SELECT 
			board_grade,
			total_value,
			total_pieces AS total_qty,
			total_kg
		FROM mv_customer_grades_metrics
		WHERE customer_id = $1
		ORDER BY total_value DESC
		LIMIT 10`, customerID)
	if err == nil {
		defer gradesRows.Close()
		res.Grades = []GradeMetric{}
		for gradesRows.Next() {
			var gm GradeMetric
			if err := gradesRows.Scan(&gm.BoardGrade, &gm.TotalValue, &gm.TotalQty, &gm.TotalKg); err == nil {
				res.Grades = append(res.Grades, gm)
			}
		}
	} else {
		log.Printf("Failed to query grades: %v", err)
	}

	if res.Grades == nil {
		res.Grades = []GradeMetric{}
	}

	// 4. Query local mv_customer_items for items purchased by this customer in the last 12 months
	itemsQuery := `
		SELECT item_no, description
		FROM mv_customer_items
		WHERE customer_id = $1
	`
	var itemNos []string
	itemDescMap := make(map[string]string)
	
	iRows, err := productsDB.QueryContext(ctx, itemsQuery, customerID)
	if err == nil {
		defer iRows.Close()
		for iRows.Next() {
			var ino, idesc string
			if err := iRows.Scan(&ino, &idesc); err == nil {
				itemNos = append(itemNos, ino)
				itemDescMap[ino] = idesc
			}
		}
	} else {
		log.Printf("Failed to query customer items: %v", err)
	}

	res.ItemCosts = []ItemCostMetric{}
	if len(itemNos) > 0 {
		// Build placeholders
		placeholders := make([]string, len(itemNos))
		args := make([]interface{}, len(itemNos))
		for i, id := range itemNos {
			placeholders[i] = fmt.Sprintf("$%d", i+1)
			args[i] = id
		}
		inClause := strings.Join(placeholders, ", ")

		// Fetch last production cost
		lastCostQuery := fmt.Sprintf(`
			SELECT cod_articol, luna_productie, cost_mediu 
			FROM mv_ultimul_cost_productie 
			WHERE cod_articol IN (%s)`, inClause)
		
		type LastCostInfo struct {
			LunaProductie string
			CostMediu     float64
		}
		lastCostMap := make(map[string]LastCostInfo)
		
		lcRows, err := productsDB.QueryContext(ctx, lastCostQuery, args...)
		if err == nil {
			defer lcRows.Close()
			for lcRows.Next() {
				var cod, luna string
				var cost float64
				if err := lcRows.Scan(&cod, &luna, &cost); err == nil {
					lastCostMap[cod] = LastCostInfo{LunaProductie: luna, CostMediu: cost}
				}
			}
		} else {
			log.Printf("Failed to query local mv_ultimul_cost_productie: %v", err)
		}

		// Fetch cost history
		historyQuery := fmt.Sprintf(`
			SELECT cod_articol, luna_productie, cost_mediu 
			FROM mv_istoric_costuri 
			WHERE cod_articol IN (%s)
			ORDER BY cod_articol, luna_productie DESC`, inClause)
		
		historyMap := make(map[string][]MonthlyCost)
		hRows, err := productsDB.QueryContext(ctx, historyQuery, args...)
		if err == nil {
			defer hRows.Close()
			for hRows.Next() {
				var cod, luna string
				var cost float64
				if err := hRows.Scan(&cod, &luna, &cost); err == nil {
					historyMap[cod] = append(historyMap[cod], MonthlyCost{Month: luna, Cost: cost})
				}
			}
		} else {
			log.Printf("Failed to query local mv_istoric_costuri: %v", err)
		}

		// Build response array
		for _, ino := range itemNos {
			lastInfo, exists := lastCostMap[ino]
			var lastCost float64
			var lastCostDate string
			if exists {
				lastCost = lastInfo.CostMediu
				lastCostDate = lastInfo.LunaProductie
			}
			
			hist, _ := historyMap[ino]
			if hist == nil {
				hist = []MonthlyCost{}
			}
			
			res.ItemCosts = append(res.ItemCosts, ItemCostMetric{
				ItemNo:       ino,
				Description:  itemDescMap[ino],
				LastCost:     lastCost,
				LastCostDate: lastCostDate,
				History:      hist,
			})
		}
	}

	if res.ItemCosts == nil {
		res.ItemCosts = []ItemCostMetric{}
	}

	json.NewEncoder(w).Encode(res)
}

// Lab Tests Handlers
func handleGetLabTests(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if _, ok := authorize(w, r, nil); !ok {
		return
	}
	if db == nil {
		json.NewEncoder(w).Encode([]LabTest{})
		return
	}

	rows, err := db.Query(`
		SELECT id, batch_id, production_line, testing_timestamp, ect, bct, fct, bursting_strength, cobb_test, material_grade, delivery_note_no 
		FROM lab_tests 
		ORDER BY testing_timestamp DESC
	`)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var list []LabTest
	for rows.Next() {
		var t LabTest
		var note sql.NullString
		err := rows.Scan(
			&t.ID, &t.BatchID, &t.ProductionLine, &t.TestingTimestamp,
			&t.ECT, &t.BCT, &t.FCT, &t.BurstingStrength, &t.CobbTest, &t.MaterialGrade,
			&note,
		)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if note.Valid {
			t.DeliveryNoteNo = note.String
		}
		list = append(list, t)
	}
	if list == nil {
		list = []LabTest{}
	}
	json.NewEncoder(w).Encode(list)
}

func handleGetLabTestDetails(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if _, ok := authorize(w, r, nil); !ok {
		return
	}
	vars := mux.Vars(r)
	batchID := vars["batch_id"]

	if db == nil {
		http.Error(w, "Database unavailable", http.StatusInternalServerError)
		return
	}

	var t LabTest
	var note sql.NullString
	err := db.QueryRow(`
		SELECT id, batch_id, production_line, testing_timestamp, ect, bct, fct, bursting_strength, cobb_test, material_grade, delivery_note_no 
		FROM lab_tests 
		WHERE batch_id = $1`,
		batchID,
	).Scan(
		&t.ID, &t.BatchID, &t.ProductionLine, &t.TestingTimestamp,
		&t.ECT, &t.BCT, &t.FCT, &t.BurstingStrength, &t.CobbTest, &t.MaterialGrade,
		&note,
	)
	if err == sql.ErrNoRows {
		http.Error(w, "Lab test not found", http.StatusNotFound)
		return
	} else if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if note.Valid {
		t.DeliveryNoteNo = note.String
	}

	json.NewEncoder(w).Encode(t)
}

func handleCreateLabTest(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	claims, err := claimsFromToken(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnauthorized)
		return
	}
	role := claims["role"].(string)
	if role != "admin" && role != "management" && role != "quality" {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	var req LabTest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid payload", http.StatusBadRequest)
		return
	}

	if req.BatchID == "" {
		http.Error(w, "batch_id is required", http.StatusBadRequest)
		return
	}

	if db == nil {
		http.Error(w, "Database unavailable", http.StatusInternalServerError)
		return
	}

	_, err = db.Exec(`
		INSERT INTO lab_tests (batch_id, production_line, ect, bct, fct, bursting_strength, cobb_test, material_grade, delivery_note_no)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		ON CONFLICT (batch_id) DO UPDATE SET 
			production_line = $2, ect = $3, bct = $4, fct = $5, bursting_strength = $6, cobb_test = $7, material_grade = $8, delivery_note_no = $9, testing_timestamp = CURRENT_TIMESTAMP`,
		req.BatchID, req.ProductionLine, req.ECT, req.BCT, req.FCT, req.BurstingStrength, req.CobbTest, req.MaterialGrade, req.DeliveryNoteNo,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(req)
}

// Claims (RMA) Handlers
func handleGetClaims(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	claims, err := claimsFromToken(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnauthorized)
		return
	}
	role := claims["role"].(string)
	customerIDClaim, _ := claims["customer_id"].(string)

	if role != "external" && !qaRoles[role] {
		http.Error(w, "Forbidden: insufficient role", http.StatusForbidden)
		return
	}

	query := `
		SELECT c.id, c.customer_id, cust.name as customer_name, c.quote_id, c.batch_id,
		       c.root_cause_category, c.root_cause_details, c.status, c.description,
		       c.resolution_decision, c.credit_note_amount, c.replacement_quote_id,
		       c.created_at, c.updated_at
		FROM claims c
		JOIN customers cust ON cust.id = c.customer_id
	`
	var args []interface{}
	if role == "external" {
		if customerIDClaim == "" {
			http.Error(w, "Forbidden: No customer profile associated", http.StatusForbidden)
			return
		}
		query += " WHERE c.customer_id = $1"
		args = append(args, customerIDClaim)
	} else {
		// Salesperson can see claims for their customers
		salespersonCode, _ := claims["salesperson_code"].(string)
		if role == "sales" && salespersonCode != "" {
			query += " WHERE cust.salesperson_code = $1"
			args = append(args, salespersonCode)
		}
	}

	query += " ORDER BY c.created_at DESC"

	if db == nil {
		json.NewEncoder(w).Encode([]Claim{})
		return
	}

	rows, err := db.Query(query, args...)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var list []Claim
	for rows.Next() {
		var c Claim
		var qID sql.NullInt32
		var bID sql.NullString
		var resDec sql.NullString
		var replQuoteID sql.NullInt32
		err := rows.Scan(
			&c.ID, &c.CustomerID, &c.CustomerName, &qID, &bID,
			&c.RootCauseCategory, &c.RootCauseDetails, &c.Status, &c.Description,
			&resDec, &c.CreditNoteAmount, &replQuoteID,
			&c.CreatedAt, &c.UpdatedAt,
		)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if qID.Valid {
			val := int(qID.Int32)
			c.QuoteID = &val
		}
		if bID.Valid {
			val := bID.String
			c.BatchID = &val
		}
		if resDec.Valid {
			val := resDec.String
			c.ResolutionDecision = &val
		}
		if replQuoteID.Valid {
			val := int(replQuoteID.Int32)
			c.ReplacementQuoteID = &val
		}
		list = append(list, c)
	}
	if list == nil {
		list = []Claim{}
	}
	json.NewEncoder(w).Encode(list)
}

func handleGetClaimDetails(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	claims, err := claimsFromToken(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnauthorized)
		return
	}
	role := claims["role"].(string)
	customerIDClaim, _ := claims["customer_id"].(string)

	if role != "external" && !qaRoles[role] {
		http.Error(w, "Forbidden: insufficient role", http.StatusForbidden)
		return
	}

	vars := mux.Vars(r)
	id, _ := strconv.Atoi(vars["id"])

	query := `
		SELECT c.id, c.customer_id, cust.name as customer_name, c.quote_id, c.batch_id, 
		       c.root_cause_category, c.root_cause_details, c.status, c.description, 
		       c.resolution_decision, c.credit_note_amount, c.replacement_quote_id, 
		       c.created_at, c.updated_at
		FROM claims c
		JOIN customers cust ON cust.id = c.customer_id
		WHERE c.id = $1
	`
	if db == nil {
		http.Error(w, "Database unavailable", http.StatusInternalServerError)
		return
	}

	var c Claim
	var qID sql.NullInt32
	var bID sql.NullString
	var resDec sql.NullString
	var replQuoteID sql.NullInt32

	err = db.QueryRow(query, id).Scan(
		&c.ID, &c.CustomerID, &c.CustomerName, &qID, &bID,
		&c.RootCauseCategory, &c.RootCauseDetails, &c.Status, &c.Description,
		&resDec, &c.CreditNoteAmount, &replQuoteID,
		&c.CreatedAt, &c.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		http.Error(w, "Claim not found", http.StatusNotFound)
		return
	} else if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if qID.Valid {
		val := int(qID.Int32)
		c.QuoteID = &val
	}
	if bID.Valid {
		val := bID.String
		c.BatchID = &val
	}
	if resDec.Valid {
		val := resDec.String
		c.ResolutionDecision = &val
	}
	if replQuoteID.Valid {
		val := int(replQuoteID.Int32)
		c.ReplacementQuoteID = &val
	}

	// Authorization Check: external users can only view their own claims
	if role == "external" && c.CustomerID != customerIDClaim {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	json.NewEncoder(w).Encode(c)
}

func handleCreateClaim(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	claims, err := claimsFromToken(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnauthorized)
		return
	}
	role := claims["role"].(string)
	customerIDClaim, _ := claims["customer_id"].(string)

	var req Claim
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid payload", http.StatusBadRequest)
		return
	}

	if role == "external" {
		if customerIDClaim == "" {
			http.Error(w, "Forbidden: No customer profile associated", http.StatusForbidden)
			return
		}
		req.CustomerID = customerIDClaim
	}

	if req.CustomerID == "" {
		http.Error(w, "customer_id is required", http.StatusBadRequest)
		return
	}

	if req.Description == "" {
		http.Error(w, "description is required", http.StatusBadRequest)
		return
	}

	if db == nil {
		http.Error(w, "Database unavailable", http.StatusInternalServerError)
		return
	}

	var claimID int
	err = db.QueryRow(`
		INSERT INTO claims (customer_id, quote_id, batch_id, root_cause_category, root_cause_details, status, description)
		VALUES ($1, $2, $3, $4, $5, 'New', $6)
		RETURNING id`,
		req.CustomerID, req.QuoteID, req.BatchID, req.RootCauseCategory, req.RootCauseDetails, req.Description,
	).Scan(&claimID)

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	req.ID = claimID
	req.Status = "New"
	req.CreatedAt = time.Now()
	req.UpdatedAt = time.Now()

	json.NewEncoder(w).Encode(req)
}

func handleUpdateClaimStatus(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	claims, err := claimsFromToken(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnauthorized)
		return
	}
	role := claims["role"].(string)
	if role != "admin" && role != "management" && role != "quality" && role != "sales" {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	vars := mux.Vars(r)
	id, _ := strconv.Atoi(vars["id"])

	type StatusReq struct {
		Status string `json:"status"`
	}
	var sReq StatusReq
	if err := json.NewDecoder(r.Body).Decode(&sReq); err != nil {
		http.Error(w, "Invalid payload", http.StatusBadRequest)
		return
	}

	if sReq.Status == "" {
		http.Error(w, "status is required", http.StatusBadRequest)
		return
	}

	if db == nil {
		http.Error(w, "Database unavailable", http.StatusInternalServerError)
		return
	}

	_, err = db.Exec(`
		UPDATE claims 
		SET status = $1, updated_at = CURRENT_TIMESTAMP 
		WHERE id = $2`,
		sReq.Status, id,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Write([]byte(`{"status":"success"}`))
}

func handleResolveClaim(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	claims, err := claimsFromToken(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnauthorized)
		return
	}
	role := claims["role"].(string)
	if role != "admin" && role != "management" && role != "quality" && role != "sales" {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	vars := mux.Vars(r)
	id, _ := strconv.Atoi(vars["id"])

	type ResolveReq struct {
		Decision         string  `json:"decision"`
		CreditNoteAmount float64 `json:"credit_note_amount"`
	}
	var resReq ResolveReq
	if err := json.NewDecoder(r.Body).Decode(&resReq); err != nil {
		http.Error(w, "Invalid payload", http.StatusBadRequest)
		return
	}

	if db == nil {
		http.Error(w, "Database unavailable", http.StatusInternalServerError)
		return
	}

	var customerID string
	var quoteID sql.NullInt32
	err = db.QueryRow("SELECT customer_id, quote_id FROM claims WHERE id = $1", id).Scan(&customerID, &quoteID)
	if err == sql.ErrNoRows {
		http.Error(w, "Claim not found", http.StatusNotFound)
		return
	} else if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	var replacementQuoteID *int = nil
	var finalStatus string = "Rejected"

	tx, err := db.Begin()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	if resReq.Decision == "Re-produce" {
		finalStatus = "Replacement Queued"
		if quoteID.Valid {
			var origSalespersonCode string
			err = tx.QueryRow("SELECT salesperson_code FROM quotes WHERE id = $1", quoteID.Int32).Scan(&origSalespersonCode)
			if err != nil {
				http.Error(w, fmt.Sprintf("Failed to query original quote: %v", err), http.StatusInternalServerError)
				return
			}

			var newQuoteID int
			err = tx.QueryRow(`
				INSERT INTO quotes (customer_id, salesperson_code, status, total_amount) 
				VALUES ($1, $2, 'Approved', 0.0) RETURNING id`, 
				customerID, origSalespersonCode,
			).Scan(&newQuoteID)
			if err != nil {
				http.Error(w, fmt.Sprintf("Failed to insert replacement quote: %v", err), http.StatusInternalServerError)
				return
			}

			rows, err := db.Query("SELECT product_id, description, quantity, config_params FROM quote_items WHERE quote_id = $1", quoteID.Int32)
			if err != nil {
				http.Error(w, fmt.Sprintf("Failed to query original items: %v", err), http.StatusInternalServerError)
				return
			}
			defer rows.Close()

			type ItemToInsert struct {
				ProductID    sql.NullString
				Description  string
				Quantity     int
				ConfigParams sql.NullString
			}
			var itemsToInsert []ItemToInsert
			for rows.Next() {
				var it ItemToInsert
				if err := rows.Scan(&it.ProductID, &it.Description, &it.Quantity, &it.ConfigParams); err == nil {
					itemsToInsert = append(itemsToInsert, it)
				}
			}

			for _, it := range itemsToInsert {
				desc := fmt.Sprintf("[RMA #%d Replacement] %s", id, it.Description)
				_, err = tx.Exec(`
					INSERT INTO quote_items (quote_id, product_id, description, quantity, unit_price, total_price, config_params) 
					VALUES ($1, $2, $3, $4, 0.0, 0.0, $5)`,
					newQuoteID, it.ProductID, desc, it.Quantity, it.ConfigParams,
				)
				if err != nil {
					http.Error(w, fmt.Sprintf("Failed to insert replacement item: %v", err), http.StatusInternalServerError)
					return
				}
			}

			replacementQuoteID = &newQuoteID
		}
	} else if resReq.Decision == "Credit Note" {
		finalStatus = "Credit Issued"
		if resReq.CreditNoteAmount > 0 {
			_, err = tx.Exec("UPDATE customers SET credit_limit = credit_limit + $1 WHERE id = $2", resReq.CreditNoteAmount, customerID)
			if err != nil {
				http.Error(w, fmt.Sprintf("Failed to update customer credit limit: %v", err), http.StatusInternalServerError)
				return
			}
		}
	}

	var repQVal interface{} = nil
	if replacementQuoteID != nil {
		repQVal = *replacementQuoteID
	}

	_, err = tx.Exec(`
		UPDATE claims 
		SET resolution_decision = $1, credit_note_amount = $2, replacement_quote_id = $3, status = $4, updated_at = CURRENT_TIMESTAMP 
		WHERE id = $5`,
		resReq.Decision, resReq.CreditNoteAmount, repQVal, finalStatus, id,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	err = tx.Commit()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Write([]byte(`{"status":"success"}`))
}

func handleGetQualityConfig(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if _, ok := authorize(w, r, nil); !ok {
		return
	}
	if db == nil {
		http.Error(w, "Database unavailable", http.StatusInternalServerError)
		return
	}

	rows, err := db.Query("SELECT key, value FROM quality_configs")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	configs := make(map[string]float64)
	for rows.Next() {
		var key string
		var val float64
		if err := rows.Scan(&key, &val); err == nil {
			configs[key] = val
		}
	}
	if _, exists := configs["cobb_threshold"]; !exists {
		configs["cobb_threshold"] = 150.0
	}

	json.NewEncoder(w).Encode(configs)
}

func handleUpdateQualityConfig(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	claims, err := claimsFromToken(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnauthorized)
		return
	}
	role := claims["role"].(string)
	if role != "admin" && role != "management" {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	var req map[string]float64
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid payload", http.StatusBadRequest)
		return
	}

	if db == nil {
		http.Error(w, "Database unavailable", http.StatusInternalServerError)
		return
	}

	for k, v := range req {
		_, err = db.Exec(`
			INSERT INTO quality_configs (key, value, updated_at) 
			VALUES ($1, $2, CURRENT_TIMESTAMP) 
			ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP`,
			k, v,
		)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}

	w.Write([]byte(`{"status":"success"}`))
}

// Logistics and Truck Loading types
type PalletPreset struct {
	ID           int     `json:"id"`
	Name         string  `json:"name"`
	LengthMM     int     `json:"length_mm"`
	WidthMM      int     `json:"width_mm"`
	MaxHeightMM  int     `json:"max_height_mm"`
	TareWeightKG float64 `json:"tare_weight_kg"`
}

type TruckPreset struct {
	ID               int     `json:"id"`
	Name             string  `json:"name"`
	Type             string  `json:"type"`
	BedLengthMM      int     `json:"bed_length_mm"`
	BedWidthMM       int     `json:"bed_width_mm"`
	BedHeightMM      int     `json:"bed_height_mm"`
	MaxPayloadKG     float64 `json:"max_payload_kg"`
	IsTandem         bool    `json:"is_tandem"`
	TrailerLengthMM  int     `json:"trailer_length_mm"`
	TrailerPayloadKG float64 `json:"trailer_payload_kg"`
}

type LoadPlan struct {
	ID                    int       `json:"id"`
	Title                 string    `json:"title"`
	TruckPresetID         int       `json:"truck_preset_id"`
	TotalPallets          int       `json:"total_pallets"`
	UtilizationPercentage float64   `json:"utilization_percentage"`
	TotalWeightKG         float64   `json:"total_weight_kg"`
	PayloadLayout         string    `json:"payload_layout"`
	CreatedAt             time.Time `json:"created_at"`
	UpdatedAt             time.Time `json:"updated_at"`
}

type OptimizeRequestItem struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	LengthMM  int     `json:"length_mm"`
	WidthMM   int     `json:"width_mm"`
	HeightMM  int     `json:"height_mm"`
	WeightKG  float64 `json:"weight_kg"`
	Quantity  int     `json:"quantity"`
	Stackable bool    `json:"stackable"`
	Color     string  `json:"color"`
}

type OptimizeRequest struct {
	TruckPresetID int                   `json:"truck_preset_id"`
	Items         []OptimizeRequestItem `json:"items"`
}

type PackedPallet struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	X         int     `json:"x"`
	Y         int     `json:"y"`
	Z         int     `json:"z"`
	Length    int     `json:"length"`
	Width     int     `json:"width"`
	Height    int     `json:"height"`
	Weight    float64 `json:"weight"`
	Rotated   bool    `json:"rotated"`
	Color     string  `json:"color"`
	IsTrailer bool    `json:"is_trailer"`
}

type OptimizeResponse struct {
	TruckPreset           TruckPreset    `json:"truck_preset"`
	PackedItems           []PackedPallet `json:"packed_items"`
	UnpackedItems         []PackedPallet `json:"unpacked_items"`
	FloorSpaceUtilization float64        `json:"floor_space_utilization"`
	VolumeUtilization     float64        `json:"volume_utilization"`
	TotalWeightKG         float64        `json:"total_weight_kg"`
	WeightUtilization     float64        `json:"weight_utilization"`
	AxleDistribution      string         `json:"axle_distribution"`
}

func handleGetLogisticsPresets(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if _, ok := authorize(w, r, logisticsRoles); !ok {
		return
	}
	if db == nil {
		http.Error(w, "Database unavailable", http.StatusInternalServerError)
		return
	}

	tRows, err := db.Query("SELECT id, name, type, bed_length_mm, bed_width_mm, bed_height_mm, max_payload_kg, is_tandem, trailer_length_mm, trailer_payload_kg FROM truck_presets")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer tRows.Close()

	var trucks []TruckPreset = []TruckPreset{}
	for tRows.Next() {
		var t TruckPreset
		if err := tRows.Scan(&t.ID, &t.Name, &t.Type, &t.BedLengthMM, &t.BedWidthMM, &t.BedHeightMM, &t.MaxPayloadKG, &t.IsTandem, &t.TrailerLengthMM, &t.TrailerPayloadKG); err == nil {
			trucks = append(trucks, t)
		}
	}

	pRows, err := db.Query("SELECT id, name, length_mm, width_mm, max_height_mm, tare_weight_kg FROM pallet_presets")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer pRows.Close()

	var pallets []PalletPreset = []PalletPreset{}
	for pRows.Next() {
		var p PalletPreset
		if err := pRows.Scan(&p.ID, &p.Name, &p.LengthMM, &p.WidthMM, &p.MaxHeightMM, &p.TareWeightKG); err == nil {
			pallets = append(pallets, p)
		}
	}

	resp := map[string]interface{}{
		"trucks":  trucks,
		"pallets": pallets,
	}
	json.NewEncoder(w).Encode(resp)
}

func handleGetLoadPlans(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if _, ok := authorize(w, r, logisticsRoles); !ok {
		return
	}
	if db == nil {
		http.Error(w, "Database unavailable", http.StatusInternalServerError)
		return
	}

	rows, err := db.Query("SELECT id, title, truck_preset_id, total_pallets, utilization_percentage, total_weight_kg, payload_layout, created_at, updated_at FROM load_plans ORDER BY created_at DESC")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var list []LoadPlan = []LoadPlan{}
	for rows.Next() {
		var lp LoadPlan
		if err := rows.Scan(&lp.ID, &lp.Title, &lp.TruckPresetID, &lp.TotalPallets, &lp.UtilizationPercentage, &lp.TotalWeightKG, &lp.PayloadLayout, &lp.CreatedAt, &lp.UpdatedAt); err == nil {
			list = append(list, lp)
		}
	}

	json.NewEncoder(w).Encode(list)
}

func handleCreateLoadPlan(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if _, ok := authorize(w, r, logisticsRoles); !ok {
		return
	}
	var lp LoadPlan
	if err := json.NewDecoder(r.Body).Decode(&lp); err != nil {
		http.Error(w, "Invalid payload", http.StatusBadRequest)
		return
	}

	if db == nil {
		http.Error(w, "Database unavailable", http.StatusInternalServerError)
		return
	}

	err := db.QueryRow(`
		INSERT INTO load_plans (title, truck_preset_id, total_pallets, utilization_percentage, total_weight_kg, payload_layout, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
		RETURNING id, created_at, updated_at`,
		lp.Title, lp.TruckPresetID, lp.TotalPallets, lp.UtilizationPercentage, lp.TotalWeightKG, lp.PayloadLayout,
	).Scan(&lp.ID, &lp.CreatedAt, &lp.UpdatedAt)

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(lp)
}

func handleOptimizeLoad(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if _, ok := authorize(w, r, logisticsRoles); !ok {
		return
	}
	var req OptimizeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request payload", http.StatusBadRequest)
		return
	}

	if db == nil {
		http.Error(w, "Database unavailable", http.StatusInternalServerError)
		return
	}

	var t TruckPreset
	err := db.QueryRow("SELECT id, name, type, bed_length_mm, bed_width_mm, bed_height_mm, max_payload_kg, is_tandem, trailer_length_mm, trailer_payload_kg FROM truck_presets WHERE id = $1", req.TruckPresetID).
		Scan(&t.ID, &t.Name, &t.Type, &t.BedLengthMM, &t.BedWidthMM, &t.BedHeightMM, &t.MaxPayloadKG, &t.IsTandem, &t.TrailerLengthMM, &t.TrailerPayloadKG)
	if err != nil {
		http.Error(w, "Truck preset not found", http.StatusNotFound)
		return
	}

	var rawPallets []PackedPallet = []PackedPallet{}
	for _, item := range req.Items {
		for qtyIdx := 0; qtyIdx < item.Quantity; qtyIdx++ {
			rawPallets = append(rawPallets, PackedPallet{
				ID:     fmt.Sprintf("%s-%d", item.ID, qtyIdx+1),
				Name:   item.Name,
				Length: item.LengthMM,
				Width:  item.WidthMM,
				Height: item.HeightMM,
				Weight: item.WeightKG,
				Color:  item.Color,
			})
		}
	}

	// Sort by area descending
	for i := 0; i < len(rawPallets); i++ {
		for j := i + 1; j < len(rawPallets); j++ {
			areaI := rawPallets[i].Length * rawPallets[i].Width
			areaJ := rawPallets[j].Length * rawPallets[j].Width
			if areaJ > areaI {
				rawPallets[i], rawPallets[j] = rawPallets[j], rawPallets[i]
			}
		}
	}

	var packed []PackedPallet = []PackedPallet{}
	var unpacked []PackedPallet = []PackedPallet{}

	if !t.IsTandem {
		packed, unpacked = packBed(rawPallets, t.BedLengthMM, t.BedWidthMM, t.BedHeightMM, false)
	} else {
		truckPacked, remaining := packBed(rawPallets, t.BedLengthMM, t.BedWidthMM, t.BedHeightMM, false)
		trailerPacked, stillRemaining := packBed(remaining, t.TrailerLengthMM, t.BedWidthMM, t.BedHeightMM, true)
		
		packed = append(packed, truckPacked...)
		packed = append(packed, trailerPacked...)
		unpacked = stillRemaining
	}

	totalFloorArea := float64(t.BedLengthMM * t.BedWidthMM)
	if t.IsTandem {
		totalFloorArea += float64(t.TrailerLengthMM * t.BedWidthMM)
	}

	var packedFloorArea float64 = 0
	var packedVolume float64 = 0
	var totalWeight float64 = 0

	for _, p := range packed {
		if p.Z == 0 {
			packedFloorArea += float64(p.Length * p.Width)
		}
		packedVolume += float64(p.Length * p.Width * p.Height)
		totalWeight += p.Weight
	}

	floorSpaceUtilization := 0.0
	if totalFloorArea > 0 {
		floorSpaceUtilization = (packedFloorArea / totalFloorArea) * 100.0
	}

	totalBedVolume := float64(t.BedLengthMM * t.BedWidthMM * t.BedHeightMM)
	if t.IsTandem {
		totalBedVolume += float64(t.TrailerLengthMM * t.BedWidthMM * t.BedHeightMM)
	}
	volumeUtilization := 0.0
	if totalBedVolume > 0 {
		volumeUtilization = (packedVolume / totalBedVolume) * 100.0
	}

	maxPayload := t.MaxPayloadKG
	if t.IsTandem {
		maxPayload += t.TrailerPayloadKG
	}
	weightUtilization := 0.0
	if maxPayload > 0 {
		weightUtilization = (totalWeight / maxPayload) * 100.0
	}

	axleDistribution := "Balanced"
	if len(packed) > 0 {
		var sumWeightTimesX float64 = 0
		var sumWeight float64 = 0
		for _, p := range packed {
			if !p.IsTrailer {
				sumWeightTimesX += p.Weight * (float64(p.X) + float64(p.Length)/2.0)
				sumWeight += p.Weight
			}
		}
		if sumWeight > 0 {
			cogPct := (sumWeightTimesX / float64(t.BedLengthMM)) / sumWeight * 100.0
			if cogPct < 40.0 {
				axleDistribution = "Front heavy"
			} else if cogPct > 60.0 {
				axleDistribution = "Rear heavy"
			}
		}
	}

	resp := OptimizeResponse{
		TruckPreset:           t,
		PackedItems:           packed,
		UnpackedItems:         unpacked,
		FloorSpaceUtilization: floorSpaceUtilization,
		VolumeUtilization:     volumeUtilization,
		TotalWeightKG:         totalWeight,
		WeightUtilization:     weightUtilization,
		AxleDistribution:      axleDistribution,
	}

	json.NewEncoder(w).Encode(resp)
}

func packBed(pallets []PackedPallet, bedLength, bedWidth, bedHeight int, isTrailer bool) ([]PackedPallet, []PackedPallet) {
	var packed []PackedPallet = []PackedPallet{}
	var unpacked []PackedPallet = []PackedPallet{}

	currentX := 0
	currentY := 0
	maxShelfH := 0

	for _, p := range pallets {
		w, l := p.Width, p.Length
		rotated := false
		
		if currentY + w <= bedWidth && currentX + l <= bedLength {
			// fits non-rotated
		} else if currentY + l <= bedWidth && currentX + w <= bedLength {
			w, l = l, w
			rotated = true
		} else {
			currentX += maxShelfH
			currentY = 0
			maxShelfH = 0
			
			if currentX + l <= bedLength && w <= bedWidth {
				// fits non-rotated
			} else if currentX + w <= bedLength && l <= bedWidth {
				w, l = l, w
				rotated = true
			} else {
				unpacked = append(unpacked, p)
				continue
			}
		}
		
		p.X = currentX
		p.Y = currentY
		p.Z = 0
		p.Length = l
		p.Width = w
		p.Rotated = rotated
		p.IsTrailer = isTrailer
		
		packed = append(packed, p)
		
		currentY += w
		if l > maxShelfH {
			maxShelfH = l
		}
	}

	var finalPacked []PackedPallet = []PackedPallet{}
	finalPacked = append(finalPacked, packed...)
	var stillUnpacked []PackedPallet = []PackedPallet{}

	stackIdx := 0
	for _, p := range unpacked {
		stacked := false
		for i := stackIdx; i < len(packed); i++ {
			bottom := packed[i]
			if bottom.Length == p.Length && bottom.Width == p.Width && bottom.Height + p.Height <= bedHeight {
				p.X = bottom.X
				p.Y = bottom.Y
				p.Z = bottom.Height
				p.Rotated = bottom.Rotated
				p.IsTrailer = isTrailer
				
				finalPacked = append(finalPacked, p)
				stacked = true
				stackIdx = i + 1
				break
			}
		}
		if !stacked {
			stillUnpacked = append(stillUnpacked, p)
		}
	}

	return finalPacked, stillUnpacked
}



