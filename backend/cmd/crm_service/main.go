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

var jwtKey = []byte("vnc-crm-secret-key-2026")

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
	connStr := os.Getenv("DATABASE_URL")
	if connStr == "" {
		connStr = "postgres://vnc_user:vnc_pass_2026@localhost/crm_db?sslmode=disable"
	}
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
		`)
		if err != nil {
			log.Printf("Error creating crm_db quotes tables: %v", err)
		} else {
			log.Println("Quotes database tables created/verified.")
		}
	}

	prodConnStr := os.Getenv("PRODUCTS_DATABASE_URL")
	if prodConnStr == "" {
		prodConnStr = "postgres://vnc_user:vnc_pass_2026@localhost/products_db?sslmode=disable"
	}
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
	})
	if err != nil || !token.Valid {
		return nil, fmt.Errorf("invalid token: %v", err)
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return nil, fmt.Errorf("invalid token claims")
	}

	return claims, nil
}

func main() {
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
	} else if role != "admin" && role != "viewer" && role != "production" && salesCode != "" {
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
	if role != "admin" && role != "viewer" && role != "production" && role != "external" && salespersonCode != "" && q.SalespersonCode != salespersonCode {
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

	if req.CustomerID == "" {
		http.Error(w, "customer_id is required", http.StatusBadRequest)
		return
	}

	// Auto-assign salesperson code if user is sales
	if role != "admin" && salesCode != "" {
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

	_, err = db.Exec("DELETE FROM quotes WHERE id = $1", quoteID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Write([]byte(`{"status":"success"}`))
}

func handleGetCustomerQuotes(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	vars := mux.Vars(r)
	customerID := vars["id"]

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

	dwhConnStr := os.Getenv("DWH_DATABASE_URL")
	if dwhConnStr == "" {
		dwhConnStr = "postgres://biusr:5324@172.16.75.97/dwh?sslmode=disable"
	}
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

// Leads handlers
func handleGetLeads(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
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

