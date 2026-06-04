package main

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/mux"
	_ "github.com/lib/pq"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/microsoft"
)

var (
	tenantID     = "a414e16c-f4d2-45b6-bf83-1b63a91d3ecb"
	clientID     = "780afb7e-5e51-4528-b7e7-2502793984dc"
	clientSecret string
	redirectURL  = os.Getenv("OAUTH_REDIRECT_URL")
	jwtKey       []byte
	dwhURL       string
	db           *sql.DB
	productsDB   *sql.DB
)

var oauthConfig *oauth2.Config

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

func init() {
	jwtKey = []byte(mustEnv("JWT_SECRET"))
	clientSecret = mustEnv("OAUTH_CLIENT_SECRET")
	dwhURL = mustEnv("DWH_DATABASE_URL")
	if redirectURL == "" {
		redirectURL = "https://192.168.72.20/vnc-crm/api/auth/callback"
	}
	oauthConfig = &oauth2.Config{
		ClientID:     clientID,
		ClientSecret: clientSecret,
		RedirectURL:  redirectURL,
		Scopes:       []string{"openid", "profile", "email", "User.Read"},
		Endpoint:     microsoft.AzureADEndpoint(tenantID),
	}
}

type MSGraphMe struct {
	DisplayName       string `json:"displayName"`
	Mail              string `json:"mail"`
	UserPrincipalName string `json:"userPrincipalName"`
}

type User struct {
	Email           string `json:"email"`
	Name            string `json:"name"`
	Role            string `json:"role"`
	SalespersonCode string `json:"salesperson_code"`
	Locale          string `json:"locale"`
}

func initDB() {
	connStr := mustEnv("DATABASE_URL")

	var err error
	db, err = sql.Open("postgres", connStr)
	if err != nil {
		log.Printf("Warning: Failed to connect to crm_db: %v", err)
	} else if err = db.Ping(); err != nil {
		log.Printf("Warning: crm_db ping failed: %v", err)
	} else {
		log.Println("crm_db connection verified.")
		
		// Create users and customers tables (including address and county)
		_, err = db.Exec(`
			CREATE TABLE IF NOT EXISTS users (
				email VARCHAR(255) PRIMARY KEY,
				name VARCHAR(255) NOT NULL,
				role VARCHAR(50) NOT NULL,
				salesperson_code VARCHAR(50),
				locale VARCHAR(10) DEFAULT 'en',
				created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
				updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
			);
			CREATE TABLE IF NOT EXISTS customers (
				id VARCHAR(50) PRIMARY KEY,
				name VARCHAR(255) NOT NULL,
				email VARCHAR(255),
				city VARCHAR(100),
				address VARCHAR(255),
				county VARCHAR(100),
				contact VARCHAR(255),
				phone VARCHAR(50),
				registration_no VARCHAR(100),
				vat_registration_no VARCHAR(100),
				payment_terms_code VARCHAR(50),
				salesperson_code VARCHAR(50),
				customer_price_group VARCHAR(50),
				credit_limit NUMERIC(15, 2) DEFAULT 0.0,
				blocked VARCHAR(50),
				post_code VARCHAR(20),
				commerce_trade_no VARCHAR(100),
				total_quantity_tons NUMERIC(15, 2) DEFAULT 0.0,
				main_competitor VARCHAR(255),
				main_competitor_volume NUMERIC(15, 2) DEFAULT 0.0,
				potential VARCHAR(100),
				cardboard_utilization_category VARCHAR(255),
				synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
			log.Printf("Error creating crm_db tables: %v", err)
		}

		// Run migrations
		_, _ = db.Exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS locale VARCHAR(10) DEFAULT 'en';")

		// Create role_margins table
		_, err = db.Exec(`
			CREATE TABLE IF NOT EXISTS role_margins (
				role VARCHAR(50) PRIMARY KEY,
				min_margin NUMERIC(5, 2) NOT NULL,
				max_margin NUMERIC(5, 2) NOT NULL,
				updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
			);
		`)
		if err != nil {
			log.Printf("Error creating role_margins table: %v", err)
		} else {
			// Seed default values
			_, err = db.Exec(`
				INSERT INTO role_margins (role, min_margin, max_margin) VALUES
				('admin', -100.0, 100.0),
				('management', -100.0, 100.0),
				('sales_manager', 0.0, 20.0),
				('rsm', 5.0, 20.0),
				('asm', 10.0, 20.0),
				('sales', 10.0, 20.0),
				('ai', 10.0, 20.0),
				('viewer', 0.0, 0.0),
				('production', 0.0, 0.0),
				('quality', 0.0, 0.0)
				ON CONFLICT (role) DO NOTHING;
			`)
			if err != nil {
				log.Printf("Error seeding role_margins defaults: %v", err)
			}
		}

		// Seed main administrator
		adminEmail := "aurelian.mester@vrancart.com"
		_, err = db.Exec(`
			INSERT INTO users (email, name, role) 
			VALUES ($1, 'Aurelian Mester', 'admin')
			ON CONFLICT (email) DO UPDATE SET role = 'admin';`, adminEmail)
		if err != nil {
			log.Printf("Warning: Failed to seed admin user: %v", err)
		}
	}

	prodConnStr := mustEnv("PRODUCTS_DATABASE_URL")
	productsDB, err = sql.Open("postgres", prodConnStr)
	if err != nil {
		log.Printf("Warning: Failed to connect to products_db: %v", err)
	} else if err = productsDB.Ping(); err != nil {
		log.Printf("Warning: products_db ping failed: %v", err)
	} else {
		log.Println("products_db connection verified.")
		
		// Create products, price_lists, price_list_lines tables
		_, err = productsDB.Exec(`
			CREATE TABLE IF NOT EXISTS products (
				id VARCHAR(50) PRIMARY KEY,
				description VARCHAR(255) NOT NULL,
				unit_price NUMERIC(15, 4) DEFAULT 0.0,
				unit_cost NUMERIC(15, 4) DEFAULT 0.0,
				item_category_code VARCHAR(50),
				synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
			);
			ALTER TABLE products ADD COLUMN IF NOT EXISTS item_category_code VARCHAR(50);
			CREATE TABLE IF NOT EXISTS price_lists (
				code VARCHAR(50) PRIMARY KEY,
				description VARCHAR(255),
				assign_to_type VARCHAR(50),
				assign_to_no VARCHAR(50),
				starting_date DATE,
				ending_date DATE,
				synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
			);
			CREATE TABLE IF NOT EXISTS price_list_lines (
				price_list_code VARCHAR(50),
				line_no INT,
				product_no VARCHAR(50),
				unit_price NUMERIC(15, 4) DEFAULT 0.0,
				direct_unit_cost NUMERIC(15, 4) DEFAULT 0.0,
				min_quantity NUMERIC(15, 4) DEFAULT 0.0,
				PRIMARY KEY (price_list_code, line_no)
			);
			CREATE TABLE IF NOT EXISTS mv_istoric_costuri (
				cod_articol VARCHAR(50) NOT NULL,
				luna_productie VARCHAR(10) NOT NULL,
				cost_mediu NUMERIC(15, 4) DEFAULT 0.0,
				PRIMARY KEY (cod_articol, luna_productie)
			);
			CREATE INDEX IF NOT EXISTS idx_mv_istoric_costuri_cod ON mv_istoric_costuri(cod_articol);

			CREATE TABLE IF NOT EXISTS mv_ultimul_cost_productie (
				cod_articol VARCHAR(50) PRIMARY KEY,
				luna_productie VARCHAR(10) NOT NULL,
				cost_mediu NUMERIC(15, 4) DEFAULT 0.0
			);
			CREATE INDEX IF NOT EXISTS idx_mv_ultimul_cost_productie_cod ON mv_ultimul_cost_productie(cod_articol);

			CREATE TABLE IF NOT EXISTS dwh_sales_invoice_headers (
				no VARCHAR(50) PRIMARY KEY,
				sell_to_customer_no VARCHAR(50) NOT NULL,
				posting_date DATE NOT NULL,
				currency_code VARCHAR(10),
				currency_factor NUMERIC(18, 9) DEFAULT 0.0
			);

			CREATE TABLE IF NOT EXISTS dwh_sales_invoice_lines (
				document_no VARCHAR(50) NOT NULL,
				line_no INT NOT NULL,
				product_no VARCHAR(50),
				description VARCHAR(255),
				quantity NUMERIC(15, 4) DEFAULT 0.0,
				net_weight NUMERIC(15, 4) DEFAULT 0.0,
				amount NUMERIC(15, 4) DEFAULT 0.0,
				PRIMARY KEY (document_no, line_no)
			);

			CREATE TABLE IF NOT EXISTS dwh_sales_headers (
				no VARCHAR(50) NOT NULL,
				document_type VARCHAR(20) NOT NULL,
				sell_to_customer_no VARCHAR(50) NOT NULL,
				posting_date DATE NOT NULL,
				currency_code VARCHAR(10),
				currency_factor NUMERIC(18, 9) DEFAULT 0.0,
				PRIMARY KEY (document_type, no)
			);

			CREATE TABLE IF NOT EXISTS dwh_sales_lines (
				document_no VARCHAR(50) NOT NULL,
				document_type VARCHAR(20) NOT NULL,
				line_no INT NOT NULL,
				product_no VARCHAR(50),
				quantity NUMERIC(15, 4) DEFAULT 0.0,
				net_weight NUMERIC(15, 4) DEFAULT 0.0,
				amount NUMERIC(15, 4) DEFAULT 0.0,
				PRIMARY KEY (document_type, document_no, line_no)
			);

			CREATE TABLE IF NOT EXISTS dwh_currency_exchange_rates (
				currency_code VARCHAR(10) NOT NULL,
				starting_date DATE NOT NULL,
				relational_exch_rate_amount NUMERIC(18, 9) DEFAULT 0.0,
				PRIMARY KEY (currency_code, starting_date)
			);

			CREATE TABLE IF NOT EXISTS dwh_articles (
				number VARCHAR(50) PRIMARY KEY,
				board_grade_id INT
			);

			CREATE TABLE IF NOT EXISTS dwh_board_grades (
				id INT PRIMARY KEY,
				code VARCHAR(50) NOT NULL
			);
		`)
		if err != nil {
			log.Printf("Error creating products_db tables: %v", err)
		}

		// Create materialized views if they do not exist
		_, err = productsDB.Exec(`
			CREATE MATERIALIZED VIEW IF NOT EXISTS mv_customer_invoice_metrics AS
			WITH converted_lines AS (
				SELECT 
					h.sell_to_customer_no AS customer_id,
					h.posting_date,
					l.quantity,
					l.net_weight,
					COALESCE(
						CASE 
							WHEN h.currency_code IS NOT NULL AND h.currency_code <> '' AND h.currency_code <> 'RON' THEN
								CASE 
									WHEN h.currency_factor > 0 THEN l.amount / h.currency_factor
									ELSE l.amount * COALESCE(ex.relational_exch_rate_amount, 5.0)
								END
							ELSE l.amount
						END,
						l.amount
					) AS amount_ron
				FROM dwh_sales_invoice_headers h
				JOIN dwh_sales_invoice_lines l ON h.no = l.document_no
				LEFT JOIN LATERAL (
					SELECT r.relational_exch_rate_amount
					FROM dwh_currency_exchange_rates r
					WHERE r.currency_code = h.currency_code
					  AND r.starting_date <= h.posting_date
					ORDER BY r.starting_date DESC
					LIMIT 1
				) ex ON TRUE
			)
			SELECT 
				customer_id,
				COALESCE(SUM(CASE WHEN posting_date >= CURRENT_DATE - INTERVAL '1 month' THEN amount_ron ELSE 0 END), 0.0) AS val_1m,
				COALESCE(SUM(CASE WHEN posting_date >= CURRENT_DATE - INTERVAL '1 month' THEN quantity ELSE 0 END), 0.0) AS qty_1m,
				COALESCE(SUM(CASE WHEN posting_date >= CURRENT_DATE - INTERVAL '1 month' THEN quantity * net_weight ELSE 0 END), 0.0) AS kg_1m,
				
				COALESCE(SUM(CASE WHEN posting_date >= CURRENT_DATE - INTERVAL '2 month' THEN amount_ron ELSE 0 END), 0.0) AS val_2m,
				COALESCE(SUM(CASE WHEN posting_date >= CURRENT_DATE - INTERVAL '2 month' THEN quantity ELSE 0 END), 0.0) AS qty_2m,
				COALESCE(SUM(CASE WHEN posting_date >= CURRENT_DATE - INTERVAL '2 month' THEN quantity * net_weight ELSE 0 END), 0.0) AS kg_2m,
				
				COALESCE(SUM(CASE WHEN posting_date >= CURRENT_DATE - INTERVAL '3 month' THEN amount_ron ELSE 0 END), 0.0) AS val_3m,
				COALESCE(SUM(CASE WHEN posting_date >= CURRENT_DATE - INTERVAL '3 month' THEN quantity ELSE 0 END), 0.0) AS qty_3m,
				COALESCE(SUM(CASE WHEN posting_date >= CURRENT_DATE - INTERVAL '3 month' THEN quantity * net_weight ELSE 0 END), 0.0) AS kg_3m,
				
				COALESCE(SUM(CASE WHEN posting_date >= CURRENT_DATE - INTERVAL '6 month' THEN amount_ron ELSE 0 END), 0.0) AS val_6m,
				COALESCE(SUM(CASE WHEN posting_date >= CURRENT_DATE - INTERVAL '6 month' THEN quantity ELSE 0 END), 0.0) AS qty_6m,
				COALESCE(SUM(CASE WHEN posting_date >= CURRENT_DATE - INTERVAL '6 month' THEN quantity * net_weight ELSE 0 END), 0.0) AS kg_6m,
				
				COALESCE(SUM(amount_ron), 0.0) AS val_12m,
				COALESCE(SUM(quantity), 0.0) AS qty_12m,
				COALESCE(SUM(quantity * net_weight), 0.0) AS kg_12m
			FROM converted_lines
			GROUP BY customer_id;

			CREATE MATERIALIZED VIEW IF NOT EXISTS mv_customer_order_metrics AS
			WITH converted_lines AS (
				SELECT 
					h.sell_to_customer_no AS customer_id,
					h.posting_date,
					l.quantity,
					l.net_weight,
					COALESCE(
						CASE 
							WHEN h.currency_code IS NOT NULL AND h.currency_code <> '' AND h.currency_code <> 'RON' THEN
								CASE 
									WHEN h.currency_factor > 0 THEN l.amount / h.currency_factor
									ELSE l.amount * COALESCE(ex.relational_exch_rate_amount, 5.0)
								END
							ELSE l.amount
						END,
						l.amount
					) AS amount_ron
				FROM dwh_sales_headers h
				JOIN dwh_sales_lines l ON h.no = l.document_no AND h.document_type = l.document_type
				LEFT JOIN LATERAL (
					SELECT r.relational_exch_rate_amount
					FROM dwh_currency_exchange_rates r
					WHERE r.currency_code = h.currency_code
					  AND r.starting_date <= h.posting_date
					ORDER BY r.starting_date DESC
					LIMIT 1
				) ex ON TRUE
				WHERE h.document_type = 'Order'
			)
			SELECT 
				customer_id,
				COALESCE(SUM(CASE WHEN posting_date >= CURRENT_DATE - INTERVAL '1 month' THEN amount_ron ELSE 0 END), 0.0) AS val_1m,
				COALESCE(SUM(CASE WHEN posting_date >= CURRENT_DATE - INTERVAL '1 month' THEN quantity ELSE 0 END), 0.0) AS qty_1m,
				COALESCE(SUM(CASE WHEN posting_date >= CURRENT_DATE - INTERVAL '1 month' THEN quantity * net_weight ELSE 0 END), 0.0) AS kg_1m,
				
				COALESCE(SUM(CASE WHEN posting_date >= CURRENT_DATE - INTERVAL '2 month' THEN amount_ron ELSE 0 END), 0.0) AS val_2m,
				COALESCE(SUM(CASE WHEN posting_date >= CURRENT_DATE - INTERVAL '2 month' THEN quantity ELSE 0 END), 0.0) AS qty_2m,
				COALESCE(SUM(CASE WHEN posting_date >= CURRENT_DATE - INTERVAL '2 month' THEN quantity * net_weight ELSE 0 END), 0.0) AS kg_2m,
				
				COALESCE(SUM(CASE WHEN posting_date >= CURRENT_DATE - INTERVAL '3 month' THEN amount_ron ELSE 0 END), 0.0) AS val_3m,
				COALESCE(SUM(CASE WHEN posting_date >= CURRENT_DATE - INTERVAL '3 month' THEN quantity ELSE 0 END), 0.0) AS qty_3m,
				COALESCE(SUM(CASE WHEN posting_date >= CURRENT_DATE - INTERVAL '3 month' THEN quantity * net_weight ELSE 0 END), 0.0) AS kg_3m,
				
				COALESCE(SUM(CASE WHEN posting_date >= CURRENT_DATE - INTERVAL '6 month' THEN amount_ron ELSE 0 END), 0.0) AS val_6m,
				COALESCE(SUM(CASE WHEN posting_date >= CURRENT_DATE - INTERVAL '6 month' THEN quantity ELSE 0 END), 0.0) AS qty_6m,
				COALESCE(SUM(CASE WHEN posting_date >= CURRENT_DATE - INTERVAL '6 month' THEN quantity * net_weight ELSE 0 END), 0.0) AS kg_6m,
				
				COALESCE(SUM(amount_ron), 0.0) AS val_12m,
				COALESCE(SUM(quantity), 0.0) AS qty_12m,
				COALESCE(SUM(quantity * net_weight), 0.0) AS kg_12m
			FROM converted_lines
			GROUP BY customer_id;

			CREATE MATERIALIZED VIEW IF NOT EXISTS mv_customer_grades_metrics AS
			WITH converted_lines AS (
				SELECT 
					h.sell_to_customer_no AS customer_id,
					bg.code AS board_grade,
					l.quantity,
					l.net_weight,
					COALESCE(
						CASE 
							WHEN h.currency_code IS NOT NULL AND h.currency_code <> '' AND h.currency_code <> 'RON' THEN
								CASE 
									WHEN h.currency_factor > 0 THEN l.amount / h.currency_factor
									ELSE l.amount * COALESCE(ex.relational_exch_rate_amount, 5.0)
								END
							ELSE l.amount
						END,
						l.amount
					) AS amount_ron
				FROM dwh_sales_invoice_headers h
				JOIN dwh_sales_invoice_lines l ON h.no = l.document_no
				JOIN dwh_articles a ON l.product_no = a.number
				JOIN dwh_board_grades bg ON a.board_grade_id = bg.id
				LEFT JOIN LATERAL (
					SELECT r.relational_exch_rate_amount
					FROM dwh_currency_exchange_rates r
					WHERE r.currency_code = h.currency_code
					  AND r.starting_date <= h.posting_date
					ORDER BY r.starting_date DESC
					LIMIT 1
				) ex ON TRUE
			)
			SELECT 
				customer_id,
				board_grade,
				SUM(amount_ron) AS total_value,
				SUM(quantity) AS total_pieces,
				SUM(quantity * net_weight) AS total_kg
			FROM converted_lines
			GROUP BY customer_id, board_grade;

			CREATE MATERIALIZED VIEW IF NOT EXISTS mv_customer_items AS
			SELECT DISTINCT 
				h.sell_to_customer_no AS customer_id,
				l.product_no AS item_no,
				COALESCE(l.description, l.product_no) AS description
			FROM dwh_sales_invoice_headers h
			JOIN dwh_sales_invoice_lines l ON h.no = l.document_no
			WHERE l.product_no IS NOT NULL AND l.product_no <> '';
		`)
		if err != nil {
			log.Printf("Error creating products_db materialized views: %v", err)
		}
	}
}

func main() {
	initDB()
	go startBackgroundSyncScheduler()

	r := mux.NewRouter()

	r.HandleFunc("/auth/login", handleLogin).Methods("GET")
	r.HandleFunc("/auth/callback", handleCallback).Methods("GET")
	r.HandleFunc("/auth/me", handleMe).Methods("GET")
	r.HandleFunc("/auth/users", handleGetUsers).Methods("GET")
	r.HandleFunc("/auth/users/role", handleUpdateUserRole).Methods("PUT")
	r.HandleFunc("/auth/users/settings", handleUpdateUserSettings).Methods("PUT")
	r.HandleFunc("/auth/sync", handleSync).Methods("POST")
	r.HandleFunc("/auth/margins", handleGetMargins).Methods("GET")
	r.HandleFunc("/auth/margins", handleUpdateMargin).Methods("PUT")

	log.Println("Auth Service starting on :8081...")
	log.Fatal(http.ListenAndServe(":8081", r))
}

func handleLogin(w http.ResponseWriter, r *http.Request) {
	state := generateState()
	url := oauthConfig.AuthCodeURL(state)
	http.Redirect(w, r, url, http.StatusTemporaryRedirect)
}

func getMSGraphUser(accessToken string) (*MSGraphMe, error) {
	req, err := http.NewRequest("GET", "https://graph.microsoft.com/v1.0/me", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("failed to fetch user profile from MS Graph, status: %d", resp.StatusCode)
	}

	var me MSGraphMe
	if err := json.NewDecoder(resp.Body).Decode(&me); err != nil {
		return nil, err
	}
	return &me, nil
}

func handleCallback(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("code")
	if code == "" {
		http.Error(w, "No code in request", http.StatusBadRequest)
		return
	}

	token, err := oauthConfig.Exchange(context.Background(), code)
	if err != nil {
		log.Printf("Token exchange failed: %v", err)
		http.Error(w, "Failed to exchange token", http.StatusInternalServerError)
		return
	}

	// Fetch user details from Microsoft Graph
	me, err := getMSGraphUser(token.AccessToken)
	if err != nil {
		log.Printf("Failed to get user details from MS Graph: %v", err)
		http.Error(w, "Failed to retrieve user profile from Microsoft", http.StatusInternalServerError)
		return
	}

	email := me.Mail
	if email == "" {
		email = me.UserPrincipalName
	}
	email = strings.ToLower(email)

	name := me.DisplayName
	if name == "" {
		name = email
	}

	role := "viewer" // default role for new users
	if email == "aurelian.mester@vrancart.com" {
		role = "admin"
	}

	salespersonCode := ""
	locale := "en"
	// Persist/Fetch user role from Database
	if db != nil {
		var dbRole string
		var dbSalesCode sql.NullString
		var dbLocale sql.NullString
		err := db.QueryRow("SELECT role, salesperson_code, locale FROM users WHERE email = $1", email).Scan(&dbRole, &dbSalesCode, &dbLocale)
		if err == sql.ErrNoRows {
			// Insert new user into database
			_, err = db.Exec("INSERT INTO users (email, name, role, locale) VALUES ($1, $2, $3, 'en')", email, name, role)
			if err != nil {
				log.Printf("Warning: Failed to insert new user into DB: %v", err)
			}
		} else if err != nil {
			log.Printf("Warning: DB error checking user role: %v", err)
		} else {
			role = dbRole
			salespersonCode = dbSalesCode.String
			if dbLocale.Valid && dbLocale.String != "" {
				locale = dbLocale.String
			}
			// Override role dynamically if needed
			if email == "aurelian.mester@vrancart.com" {
				role = "admin"
			}
		}
	}

	customerID := ""
	if db != nil {
		var custID sql.NullString
		err := db.QueryRow("SELECT id FROM customers WHERE LOWER(email) = LOWER($1)", email).Scan(&custID)
		if err == nil && custID.Valid {
			customerID = custID.String
		}
	}

	// Create local JWT
	localToken := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"email":            email,
		"name":             name,
		"role":             role,
		"salesperson_code": salespersonCode,
		"customer_id":      customerID,
		"locale":           locale,
		"exp":              time.Now().Add(time.Hour * 24).Unix(),
	})

	tokenString, err := localToken.SignedString(jwtKey)
	if err != nil {
		http.Error(w, "Failed to sign token", http.StatusInternalServerError)
		return
	}

	// Redirect back to frontend with token
	http.Redirect(w, r, "/vnc-crm/?token="+tokenString, http.StatusSeeOther)
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

func handleMe(w http.ResponseWriter, r *http.Request) {
	claims, err := claimsFromToken(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnauthorized)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(claims)
}

func handleGetUsers(w http.ResponseWriter, r *http.Request) {
	claims, err := claimsFromToken(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnauthorized)
		return
	}

	if claims["role"] != "admin" {
		http.Error(w, "Forbidden: Admin access required", http.StatusForbidden)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	if db == nil {
		mockUsers := []User{
			{Email: "aurelian.mester@vrancart.com", Name: "Aurelian Mester", Role: "admin", SalespersonCode: "", Locale: "en"},
			{Email: "ion.popescu@vrancart.com", Name: "Ion Popescu", Role: "sales", SalespersonCode: "ASM 8", Locale: "en"},
			{Email: "maria.ionescu@vrancart.com", Name: "Maria Ionescu", Role: "production", SalespersonCode: "", Locale: "en"},
		}
		json.NewEncoder(w).Encode(mockUsers)
		return
	}

	rows, err := db.Query("SELECT email, name, role, salesperson_code, locale FROM users ORDER BY email")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var users []User
	for rows.Next() {
		var u User
		var salesCode sql.NullString
		var loc sql.NullString
		if err := rows.Scan(&u.Email, &u.Name, &u.Role, &salesCode, &loc); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		u.SalespersonCode = salesCode.String
		u.Locale = "en"
		if loc.Valid && loc.String != "" {
			u.Locale = loc.String
		}
		users = append(users, u)
	}

	json.NewEncoder(w).Encode(users)
}

type UpdateRoleReq struct {
	Email           string `json:"email"`
	Role            string `json:"role"`
	SalespersonCode string `json:"salesperson_code"`
	Locale          string `json:"locale"`
}

func handleUpdateUserRole(w http.ResponseWriter, r *http.Request) {
	claims, err := claimsFromToken(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnauthorized)
		return
	}

	if claims["role"] != "admin" {
		http.Error(w, "Forbidden: Admin access required", http.StatusForbidden)
		return
	}

	var req UpdateRoleReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid payload", http.StatusBadRequest)
		return
	}

	req.Email = strings.ToLower(req.Email)

	if req.Email == "aurelian.mester@vrancart.com" && req.Role != "admin" {
		http.Error(w, "Forbidden: aurelian.mester@vrancart.com must always be the administrator", http.StatusForbidden)
		return
	}

	validRoles := map[string]bool{
		"admin": true, "sales": true, "production": true, "viewer": true,
		"asm": true, "ai": true, "rsm": true, "sales_manager": true, "management": true, "quality": true,
	}
	if !validRoles[req.Role] {
		http.Error(w, "Invalid role value", http.StatusBadRequest)
		return
	}

	locale := req.Locale
	if locale == "" {
		locale = "en"
	} else if locale != "en" && locale != "ro" {
		http.Error(w, "Invalid locale value. Must be 'en' or 'ro'", http.StatusBadRequest)
		return
	}

	if db == nil {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"success", "message":"Database not connected, mock update succeeded"}`))
		return
	}

	_, err = db.Exec("UPDATE users SET role = $1, salesperson_code = $2, locale = $3, updated_at = CURRENT_TIMESTAMP WHERE email = $4", req.Role, req.SalespersonCode, locale, req.Email)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"status":"success"}`))
}

type UpdateSettingsReq struct {
	Locale string `json:"locale"`
}

func handleUpdateUserSettings(w http.ResponseWriter, r *http.Request) {
	claims, err := claimsFromToken(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnauthorized)
		return
	}

	email, ok := claims["email"].(string)
	if !ok || email == "" {
		http.Error(w, "Invalid token claims: email missing", http.StatusUnauthorized)
		return
	}

	var req UpdateSettingsReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid payload", http.StatusBadRequest)
		return
	}

	if req.Locale != "en" && req.Locale != "ro" {
		http.Error(w, "Invalid locale value. Must be 'en' or 'ro'", http.StatusBadRequest)
		return
	}

	if db == nil {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"success", "message":"Database not connected, mock update succeeded"}`))
		return
	}

	_, err = db.Exec("UPDATE users SET locale = $1, updated_at = CURRENT_TIMESTAMP WHERE email = $2", req.Locale, email)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"status":"success"}`))
}

func executeSync() (map[string]interface{}, error) {
	dwhConnStr := dwhURL

	dwhDB, err := sql.Open("postgres", dwhConnStr)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to Data Warehouse: %v", err)
	}
	defer dwhDB.Close()

	if err = dwhDB.Ping(); err != nil {
		return nil, fmt.Errorf("data Warehouse ping failed: %v", err)
	}

	if db == nil {
		return nil, fmt.Errorf("local CRM database connection is not available")
	}

	if productsDB == nil {
		return nil, fmt.Errorf("local Products database connection is not available")
	}

	var customersCount, productsCount, priceHeadersCount, priceLinesCount, costHistoryCount, lastCostCount int

	// 1. Sync Customers from ss01.customer_v -> crm_db.customers
	custRows, err := dwhDB.Query(`
		SELECT 
			c."No.", c."Name", c."Email", c."City", c."Address", c."County", c."Contact", c."Phone No.", c."Registration No.", c."VAT Registration No.", c."Payment Terms Code", c."Salesperson Code", c."Customer Price Group", c."Credit Limit (LCY)", c."Blocked", c."Post Code", c."Commerce Trade No.",
			COALESCE(calc.tons, 0.0) as calculated_tons,
			c."Concurent principal", c."Volum concurent principal", c."Potential", c."Categorie Utilizare Carton"
		FROM ss01.customer_v c
		LEFT JOIN (
			SELECT h."Sell-to Customer No." as customer_no, SUM(l."Quantity" * l."Net Weight") / 1000.0 as tons
			FROM ss01.salesinvoiceheader_v h
			JOIN ss01.salesinvoiceline_v l ON h."No." = l."Document No."
			GROUP BY h."Sell-to Customer No."
		) calc ON c."No." = calc.customer_no
		WHERE c."No." IS NOT NULL AND c."Name" IS NOT NULL`)
	if err != nil {
		return nil, fmt.Errorf("failed to query customer_v: %v", err)
	}
	defer custRows.Close()

	for custRows.Next() {
		var no, name string
		var email, city, address, county, contact, phone, regNo, vatRegNo, payTerms, salesCode, priceGroup, blocked, postCode, commTradeNo, potential, category sql.NullString
		var creditLimit, totalQty, mainCompVol sql.NullFloat64
		var mainCompetitor sql.NullString
		if err := custRows.Scan(
			&no, &name, &email, &city, &address, &county, &contact, &phone, &regNo, &vatRegNo, &payTerms, &salesCode, &priceGroup, &creditLimit, &blocked, &postCode, &commTradeNo, &totalQty, &mainCompetitor, &mainCompVol, &potential, &category,
		); err != nil {
			log.Printf("Error scanning customer: %v", err)
			continue
		}

		_, err = db.Exec(`
			INSERT INTO customers (
				id, name, email, city, address, county, contact, phone, registration_no, vat_registration_no, 
				payment_terms_code, salesperson_code, customer_price_group, credit_limit, blocked, post_code, commerce_trade_no, 
				total_quantity_tons, main_competitor, main_competitor_volume, potential, cardboard_utilization_category
			) 
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
			ON CONFLICT (id) 
			DO UPDATE SET 
				name = EXCLUDED.name, 
				email = EXCLUDED.email, 
				city = EXCLUDED.city, 
				address = EXCLUDED.address, 
				county = EXCLUDED.county,
				contact = EXCLUDED.contact,
				phone = EXCLUDED.phone,
				registration_no = EXCLUDED.registration_no,
				vat_registration_no = EXCLUDED.vat_registration_no,
				payment_terms_code = EXCLUDED.payment_terms_code,
				salesperson_code = EXCLUDED.salesperson_code,
				customer_price_group = EXCLUDED.customer_price_group,
				credit_limit = EXCLUDED.credit_limit,
				blocked = EXCLUDED.blocked,
				post_code = EXCLUDED.post_code,
				commerce_trade_no = EXCLUDED.commerce_trade_no,
				total_quantity_tons = EXCLUDED.total_quantity_tons,
				main_competitor = EXCLUDED.main_competitor,
				main_competitor_volume = EXCLUDED.main_competitor_volume,
				potential = EXCLUDED.potential,
				cardboard_utilization_category = EXCLUDED.cardboard_utilization_category,
				synced_at = CURRENT_TIMESTAMP;`,
			no, name, email.String, city.String, address.String, county.String, contact.String, phone.String, regNo.String, vatRegNo.String,
			payTerms.String, salesCode.String, priceGroup.String, creditLimit.Float64, blocked.String, postCode.String, commTradeNo.String,
			totalQty.Float64, mainCompetitor.String, mainCompVol.Float64, potential.String, category.String)
		if err != nil {
			log.Printf("Error inserting customer %s: %v", no, err)
		} else {
			customersCount++
		}
	}

	// 2. Sync Items from ss01.item_mv -> products_db.products
	itemRows, err := dwhDB.Query(`SELECT "No.", "Description", "Unit Price", "Unit Cost", "Item Category Code" FROM ss01.item_mv WHERE "No." IS NOT NULL AND "Description" IS NOT NULL`)
	if err != nil {
		return nil, fmt.Errorf("failed to query item_mv: %v", err)
	}
	defer itemRows.Close()

	for itemRows.Next() {
		var no, description string
		var unitPrice, unitCost sql.NullFloat64
		var itemCategory sql.NullString
		if err := itemRows.Scan(&no, &description, &unitPrice, &unitCost, &itemCategory); err != nil {
			log.Printf("Error scanning item: %v", err)
			continue
		}

		_, err = productsDB.Exec(`
			INSERT INTO products (id, description, unit_price, unit_cost, item_category_code) 
			VALUES ($1, $2, $3, $4, $5)
			ON CONFLICT (id) 
			DO UPDATE SET 
				description = EXCLUDED.description, 
				unit_price = EXCLUDED.unit_price, 
				unit_cost = EXCLUDED.unit_cost, 
				item_category_code = EXCLUDED.item_category_code,
				synced_at = CURRENT_TIMESTAMP;`,
			no, description, unitPrice.Float64, unitCost.Float64, itemCategory)
		if err != nil {
			log.Printf("Error inserting product %s: %v", no, err)
		} else {
			productsCount++
		}
	}

	// 3. Sync Price List Headers from ss01.pricelistheader_v -> products_db.price_lists
	headerRows, err := dwhDB.Query(`SELECT "Code", "Description", "Assign-to Type", "Assign-to No.", "Starting Date", "Ending Date" FROM ss01.pricelistheader_v WHERE "Code" IS NOT NULL`)
	if err != nil {
		return nil, fmt.Errorf("failed to query pricelistheader_v: %v", err)
	}
	defer headerRows.Close()

	for headerRows.Next() {
		var code string
		var description, assignToType, assignToNo, startingDate, endingDate sql.NullString
		if err := headerRows.Scan(&code, &description, &assignToType, &assignToNo, &startingDate, &endingDate); err != nil {
			log.Printf("Error scanning pricelistheader: %v", err)
			continue
		}

		_, err = productsDB.Exec(`
			INSERT INTO price_lists (code, description, assign_to_type, assign_to_no, starting_date, ending_date) 
			VALUES ($1, $2, $3, $4, NULLIF($5, '')::DATE, NULLIF($6, '')::DATE)
			ON CONFLICT (code) 
			DO UPDATE SET 
				description = EXCLUDED.description, 
				assign_to_type = EXCLUDED.assign_to_type, 
				assign_to_no = EXCLUDED.assign_to_no, 
				starting_date = EXCLUDED.starting_date, 
				ending_date = EXCLUDED.ending_date, 
				synced_at = CURRENT_TIMESTAMP;`,
			code, description.String, assignToType.String, assignToNo.String, startingDate.String, endingDate.String)
		if err != nil {
			log.Printf("Error inserting price list header %s: %v", code, err)
		} else {
			priceHeadersCount++
		}
	}

	// 4. Sync Price List Lines from ss01.pricelistline_v -> products_db.price_list_lines
	lineRows, err := dwhDB.Query(`SELECT "Price List Code", "Line No.", "Product No.", "Unit Price", "Direct Unit Cost", "Minimum Quantity" FROM ss01.pricelistline_v WHERE "Price List Code" IS NOT NULL AND "Line No." IS NOT NULL`)
	if err != nil {
		return nil, fmt.Errorf("failed to query pricelistline_v: %v", err)
	}
	defer lineRows.Close()

	for lineRows.Next() {
		var priceListCode string
		var lineNo int
		var productNo sql.NullString
		var unitPrice, directUnitCost, minQuantity sql.NullFloat64
		if err := lineRows.Scan(&priceListCode, &lineNo, &productNo, &unitPrice, &directUnitCost, &minQuantity); err != nil {
			log.Printf("Error scanning pricelistline: %v", err)
			continue
		}

		_, err = productsDB.Exec(`
			INSERT INTO price_list_lines (price_list_code, line_no, product_no, unit_price, direct_unit_cost, min_quantity) 
			VALUES ($1, $2, $3, $4, $5, $6)
			ON CONFLICT (price_list_code, line_no) 
			DO UPDATE SET product_no = EXCLUDED.product_no, unit_price = EXCLUDED.unit_price, direct_unit_cost = EXCLUDED.direct_unit_cost, min_quantity = EXCLUDED.min_quantity;`,
			priceListCode, lineNo, productNo.String, unitPrice.Float64, directUnitCost.Float64, minQuantity.Float64)
		if err != nil {
			log.Printf("Error inserting price list line %s:%d: %v", priceListCode, lineNo, err)
		} else {
			priceLinesCount++
		}
	}

	// 5. Sync Cost History from public.mv_istoric_costuri -> products_db.mv_istoric_costuri
	costHistoryRows, err := dwhDB.Query(`SELECT cod_articol, luna_productie, cost_mediu FROM public.mv_istoric_costuri WHERE cod_articol IS NOT NULL`)
	if err != nil {
		log.Printf("Warning: Failed to query DWH mv_istoric_costuri: %v", err)
	} else {
		defer costHistoryRows.Close()
		tx, err := productsDB.Begin()
		if err == nil {
			_, _ = tx.Exec("TRUNCATE TABLE mv_istoric_costuri")
			stmt, err := tx.Prepare("INSERT INTO mv_istoric_costuri (cod_articol, luna_productie, cost_mediu) VALUES ($1, $2, $3)")
			if err == nil {
				defer stmt.Close()
				for costHistoryRows.Next() {
					var cod, luna string
					var cost sql.NullFloat64
					if err := costHistoryRows.Scan(&cod, &luna, &cost); err == nil {
						_, _ = stmt.Exec(cod, luna, cost.Float64)
						costHistoryCount++
					}
				}
				_ = tx.Commit()
			} else {
				log.Printf("Error preparing mv_istoric_costuri stmt: %v", err)
				_ = tx.Rollback()
			}
		} else {
			log.Printf("Error starting tx for mv_istoric_costuri: %v", err)
		}
	}

	// 6. Sync Last Production Cost from public.mv_ultimul_cost_productie -> products_db.mv_ultimul_cost_productie
	lastCostRows, err := dwhDB.Query(`SELECT cod_articol, luna_productie, cost_mediu FROM public.mv_ultimul_cost_productie WHERE cod_articol IS NOT NULL`)
	if err != nil {
		log.Printf("Warning: Failed to query DWH mv_ultimul_cost_productie: %v", err)
	} else {
		defer lastCostRows.Close()
		tx, err := productsDB.Begin()
		if err == nil {
			_, _ = tx.Exec("TRUNCATE TABLE mv_ultimul_cost_productie")
			stmt, err := tx.Prepare("INSERT INTO mv_ultimul_cost_productie (cod_articol, luna_productie, cost_mediu) VALUES ($1, $2, $3)")
			if err == nil {
				defer stmt.Close()
				for lastCostRows.Next() {
					var cod, luna string
					var cost sql.NullFloat64
					if err := lastCostRows.Scan(&cod, &luna, &cost); err == nil {
						_, _ = stmt.Exec(cod, luna, cost.Float64)
						lastCostCount++
					}
				}
				_ = tx.Commit()
			} else {
				log.Printf("Error preparing mv_ultimul_cost_productie stmt: %v", err)
				_ = tx.Rollback()
			}
		} else {
			log.Printf("Error starting tx for mv_ultimul_cost_productie: %v", err)
		}
	}

	// 7. Sync Sales Invoice Headers (last 12 months)
	var invoiceHeadersCount int
	invoiceHeadersRows, err := dwhDB.Query(`
		SELECT "No.", "Sell-to Customer No.", "Posting Date", "Currency Code", "Currency Factor"
		FROM ss01.salesinvoiceheader_v
		WHERE "Posting Date" >= CURRENT_DATE - INTERVAL '12 month'
		  AND "No." IS NOT NULL AND "Sell-to Customer No." IS NOT NULL`)
	if err != nil {
		log.Printf("Warning: Failed to query DWH salesinvoiceheader_v: %v", err)
	} else {
		defer invoiceHeadersRows.Close()
		tx, err := productsDB.Begin()
		if err == nil {
			_, _ = tx.Exec("TRUNCATE TABLE dwh_sales_invoice_headers")
			stmt, err := tx.Prepare(`
				INSERT INTO dwh_sales_invoice_headers (no, sell_to_customer_no, posting_date, currency_code, currency_factor)
				VALUES ($1, $2, $3, $4, $5)
				ON CONFLICT (no) DO UPDATE SET 
					sell_to_customer_no = EXCLUDED.sell_to_customer_no, 
					posting_date = EXCLUDED.posting_date, 
					currency_code = EXCLUDED.currency_code, 
					currency_factor = EXCLUDED.currency_factor`)
			if err == nil {
				defer stmt.Close()
				for invoiceHeadersRows.Next() {
					var no, custNo string
					var pDate time.Time
					var curCode sql.NullString
					var curFactor sql.NullFloat64
					if err := invoiceHeadersRows.Scan(&no, &custNo, &pDate, &curCode, &curFactor); err == nil {
						_, err = stmt.Exec(no, custNo, pDate, curCode, curFactor)
						if err == nil {
							invoiceHeadersCount++
						}
					}
				}
				_ = tx.Commit()
			} else {
				_ = tx.Rollback()
			}
		}
	}

	// 8. Sync Sales Invoice Lines (last 12 months)
	var invoiceLinesCount int
	invoiceLinesRows, err := dwhDB.Query(`
		SELECT l."Document No.", l."Line No.", l."No.", l."Description", l."Quantity", l."Net Weight", l."Amount"
		FROM ss01.salesinvoiceline_v l
		JOIN ss01.salesinvoiceheader_v h ON l."Document No." = h."No."
		WHERE h."Posting Date" >= CURRENT_DATE - INTERVAL '12 month'`)
	if err != nil {
		log.Printf("Warning: Failed to query DWH salesinvoiceline_v: %v", err)
	} else {
		defer invoiceLinesRows.Close()
		tx, err := productsDB.Begin()
		if err == nil {
			_, _ = tx.Exec("TRUNCATE TABLE dwh_sales_invoice_lines")
			stmt, err := tx.Prepare(`
				INSERT INTO dwh_sales_invoice_lines (document_no, line_no, product_no, description, quantity, net_weight, amount)
				VALUES ($1, $2, $3, $4, $5, $6, $7)
				ON CONFLICT (document_no, line_no) DO UPDATE SET 
					product_no = EXCLUDED.product_no, 
					description = EXCLUDED.description, 
					quantity = EXCLUDED.quantity, 
					net_weight = EXCLUDED.net_weight, 
					amount = EXCLUDED.amount`)
			if err == nil {
				defer stmt.Close()
				for invoiceLinesRows.Next() {
					var docNo string
					var lineNo int
					var prodNo, desc sql.NullString
					var qty, weight, amt sql.NullFloat64
					if err := invoiceLinesRows.Scan(&docNo, &lineNo, &prodNo, &desc, &qty, &weight, &amt); err == nil {
						_, err = stmt.Exec(docNo, lineNo, prodNo, desc, qty, weight, amt)
						if err == nil {
							invoiceLinesCount++
						}
					}
				}
				_ = tx.Commit()
			} else {
				_ = tx.Rollback()
			}
		}
	}

	// 9. Sync Sales Headers (last 12 months)
	var salesHeadersCount int
	salesHeadersRows, err := dwhDB.Query(`
		SELECT "No.", "Document Type", "Sell-to Customer No.", "Posting Date", "Currency Code", "Currency Factor"
		FROM ss01.salesheader_v
		WHERE "Document Type" = 'Order' AND "Posting Date" >= CURRENT_DATE - INTERVAL '12 month'
		  AND "No." IS NOT NULL AND "Sell-to Customer No." IS NOT NULL`)
	if err != nil {
		log.Printf("Warning: Failed to query DWH salesheader_v: %v", err)
	} else {
		defer salesHeadersRows.Close()
		tx, err := productsDB.Begin()
		if err == nil {
			_, _ = tx.Exec("TRUNCATE TABLE dwh_sales_headers")
			stmt, err := tx.Prepare(`
				INSERT INTO dwh_sales_headers (no, document_type, sell_to_customer_no, posting_date, currency_code, currency_factor)
				VALUES ($1, $2, $3, $4, $5, $6)
				ON CONFLICT (document_type, no) DO UPDATE SET 
					sell_to_customer_no = EXCLUDED.sell_to_customer_no, 
					posting_date = EXCLUDED.posting_date, 
					currency_code = EXCLUDED.currency_code, 
					currency_factor = EXCLUDED.currency_factor`)
			if err == nil {
				defer stmt.Close()
				for salesHeadersRows.Next() {
					var no, docType, sellToCustNo string
					var pDate time.Time
					var curCode sql.NullString
					var curFactor sql.NullFloat64
					err := salesHeadersRows.Scan(&no, &docType, &sellToCustNo, &pDate, &curCode, &curFactor)
					if err == nil {
						_, err = stmt.Exec(no, docType, sellToCustNo, pDate, curCode, curFactor)
						if err == nil {
							salesHeadersCount++
						}
					} else {
						log.Printf("Scan error in salesHeadersRows: %v", err)
					}
				}
				_ = tx.Commit()
			} else {
				_ = tx.Rollback()
			}
		}
	}

	// 10. Sync Sales Lines (last 12 months)
	var salesLinesCount int
	salesLinesRows, err := dwhDB.Query(`
		SELECT l."Document No.", l."Document Type", l."Line No.", l."No.", l."Quantity", l."Net Weight", l."Amount"
		FROM ss01.salesline_v l
		JOIN ss01.salesheader_v h ON l."Document No." = h."No." AND l."Document Type" = h."Document Type"
		WHERE h."Document Type" = 'Order' AND h."Posting Date" >= CURRENT_DATE - INTERVAL '12 month'`)
	if err != nil {
		log.Printf("Warning: Failed to query DWH salesline_v: %v", err)
	} else {
		defer salesLinesRows.Close()
		tx, err := productsDB.Begin()
		if err == nil {
			_, _ = tx.Exec("TRUNCATE TABLE dwh_sales_lines")
			stmt, err := tx.Prepare(`
				INSERT INTO dwh_sales_lines (document_no, document_type, line_no, product_no, quantity, net_weight, amount)
				VALUES ($1, $2, $3, $4, $5, $6, $7)
				ON CONFLICT (document_type, document_no, line_no) DO UPDATE SET 
					product_no = EXCLUDED.product_no, 
					quantity = EXCLUDED.quantity, 
					net_weight = EXCLUDED.net_weight, 
					amount = EXCLUDED.amount`)
			if err == nil {
				defer stmt.Close()
				for salesLinesRows.Next() {
					var docNo, docType string
					var lineNo int
					var prodNo sql.NullString
					var qty, weight, amt sql.NullFloat64
					if err := salesLinesRows.Scan(&docNo, &docType, &lineNo, &prodNo, &qty, &weight, &amt); err == nil {
						_, err = stmt.Exec(docNo, docType, lineNo, prodNo, qty, weight, amt)
						if err == nil {
							salesLinesCount++
						}
					}
				}
				_ = tx.Commit()
			} else {
				_ = tx.Rollback()
			}
		}
	}

	// 11. Sync Currency Exchange Rates
	var exchangeRatesCount int
	exchangeRatesRows, err := dwhDB.Query(`
		SELECT "Currency Code", "Starting Date", "Relational Exch. Rate Amount"
		FROM ss01.currencyexchangerate_v
		WHERE "Currency Code" IS NOT NULL AND "Starting Date" IS NOT NULL`)
	if err != nil {
		log.Printf("Warning: Failed to query DWH currencyexchangerate_v: %v", err)
	} else {
		defer exchangeRatesRows.Close()
		tx, err := productsDB.Begin()
		if err == nil {
			_, _ = tx.Exec("TRUNCATE TABLE dwh_currency_exchange_rates")
			stmt, err := tx.Prepare(`
				INSERT INTO dwh_currency_exchange_rates (currency_code, starting_date, relational_exch_rate_amount)
				VALUES ($1, $2, $3)
				ON CONFLICT (currency_code, starting_date) DO UPDATE SET 
					relational_exch_rate_amount = EXCLUDED.relational_exch_rate_amount`)
			if err == nil {
				defer stmt.Close()
				for exchangeRatesRows.Next() {
					var curCode string
					var sDate time.Time
					var rate sql.NullFloat64
					if err := exchangeRatesRows.Scan(&curCode, &sDate, &rate); err == nil {
						_, err = stmt.Exec(curCode, sDate, rate)
						if err == nil {
							exchangeRatesCount++
						}
					}
				}
				_ = tx.Commit()
			} else {
				_ = tx.Rollback()
			}
		}
	}

	// 12. Sync Articles
	var articlesCount int
	articlesRows, err := dwhDB.Query(`
		SELECT "Number", "BoardGradeID"
		FROM ss02.articles_v
		WHERE "Number" IS NOT NULL`)
	if err != nil {
		log.Printf("Warning: Failed to query DWH articles_v: %v", err)
	} else {
		defer articlesRows.Close()
		tx, err := productsDB.Begin()
		if err == nil {
			_, _ = tx.Exec("TRUNCATE TABLE dwh_articles")
			stmt, err := tx.Prepare(`
				INSERT INTO dwh_articles (number, board_grade_id)
				VALUES ($1, $2)
				ON CONFLICT (number) DO UPDATE SET board_grade_id = EXCLUDED.board_grade_id`)
			if err == nil {
				defer stmt.Close()
				for articlesRows.Next() {
					var num string
					var bgId sql.NullInt64
					if err := articlesRows.Scan(&num, &bgId); err == nil {
						_, err = stmt.Exec(num, bgId)
						if err == nil {
							articlesCount++
						}
					}
				}
				_ = tx.Commit()
			} else {
				_ = tx.Rollback()
			}
		}
	}

	// 13. Sync Board Grades
	var boardGradesCount int
	boardGradesRows, err := dwhDB.Query(`
		SELECT "ID", "Code"
		FROM ss02.boardgrades_v
		WHERE "ID" IS NOT NULL AND "Code" IS NOT NULL`)
	if err != nil {
		log.Printf("Warning: Failed to query DWH boardgrades_v: %v", err)
	} else {
		defer boardGradesRows.Close()
		tx, err := productsDB.Begin()
		if err == nil {
			_, _ = tx.Exec("TRUNCATE TABLE dwh_board_grades")
			stmt, err := tx.Prepare(`
				INSERT INTO dwh_board_grades (id, code)
				VALUES ($1, $2)
				ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code`)
			if err == nil {
				defer stmt.Close()
				for boardGradesRows.Next() {
					var id int
					var code string
					if err := boardGradesRows.Scan(&id, &code); err == nil {
						_, err = stmt.Exec(id, code)
						if err == nil {
							boardGradesCount++
						}
					}
				}
				_ = tx.Commit()
			} else {
				_ = tx.Rollback()
			}
		}
	}

	// 14. Refresh Materialized Views
	log.Println("Refreshing local materialized views...")
	_, err = productsDB.Exec("REFRESH MATERIALIZED VIEW mv_customer_invoice_metrics")
	if err != nil {
		log.Printf("Failed to refresh mv_customer_invoice_metrics: %v", err)
	}
	_, err = productsDB.Exec("REFRESH MATERIALIZED VIEW mv_customer_order_metrics")
	if err != nil {
		log.Printf("Failed to refresh mv_customer_order_metrics: %v", err)
	}
	_, err = productsDB.Exec("REFRESH MATERIALIZED VIEW mv_customer_grades_metrics")
	if err != nil {
		log.Printf("Failed to refresh mv_customer_grades_metrics: %v", err)
	}
	_, err = productsDB.Exec("REFRESH MATERIALIZED VIEW mv_customer_items")
	if err != nil {
		log.Printf("Failed to refresh mv_customer_items: %v", err)
	}

	return map[string]interface{}{
		"customers_synced":     customersCount,
		"products_synced":      productsCount,
		"price_headers_synced": priceHeadersCount,
		"price_lines_synced":   priceLinesCount,
		"cost_history_synced":  costHistoryCount,
		"last_costs_synced":    lastCostCount,
		"invoice_headers":      invoiceHeadersCount,
		"invoice_lines":        invoiceLinesCount,
		"sales_headers":        salesHeadersCount,
		"sales_lines":          salesLinesCount,
		"exchange_rates":       exchangeRatesCount,
		"articles":             articlesCount,
		"board_grades":         boardGradesCount,
	}, nil
}

func startBackgroundSyncScheduler() {
	// Wait a bit on startup to allow everything to initialize
	time.Sleep(30 * time.Second)
	
	log.Println("Starting initial background DWH sync...")
	if stats, err := executeSync(); err != nil {
		log.Printf("Initial background DWH sync failed: %v", err)
	} else {
		log.Printf("Initial background DWH sync finished successfully. Stats: %+v", stats)
	}

	ticker := time.NewTicker(4 * time.Hour)
	for range ticker.C {
		log.Println("Starting scheduled background DWH sync...")
		if stats, err := executeSync(); err != nil {
			log.Printf("Scheduled background DWH sync failed: %v", err)
		} else {
			log.Printf("Scheduled background DWH sync finished successfully. Stats: %+v", stats)
		}
	}
}

func handleSync(w http.ResponseWriter, r *http.Request) {
	claims, err := claimsFromToken(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnauthorized)
		return
	}

	if claims["role"] != "admin" {
		http.Error(w, "Forbidden: Admin access required", http.StatusForbidden)
		return
	}

	stats, err := executeSync()
	if err != nil {
		http.Error(w, fmt.Sprintf("Sync failed: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "success",
		"stats":  stats,
	})
}

func generateState() string {
	b := make([]byte, 16)
	rand.Read(b)
	return base64.URLEncoding.EncodeToString(b)
}

type RoleMargin struct {
	Role      string    `json:"role"`
	MinMargin float64   `json:"min_margin"`
	MaxMargin float64   `json:"max_margin"`
	UpdatedAt time.Time `json:"updated_at"`
}

func handleGetMargins(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_, err := claimsFromToken(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnauthorized)
		return
	}

	if db == nil {
		http.Error(w, "Database connection unavailable", http.StatusInternalServerError)
		return
	}

	rows, err := db.Query("SELECT role, min_margin, max_margin, updated_at FROM role_margins ORDER BY role")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var margins []RoleMargin
	for rows.Next() {
		var m RoleMargin
		if err := rows.Scan(&m.Role, &m.MinMargin, &m.MaxMargin, &m.UpdatedAt); err == nil {
			margins = append(margins, m)
		}
	}
	if margins == nil {
		margins = []RoleMargin{}
	}
	json.NewEncoder(w).Encode(margins)
}

func handleUpdateMargin(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	claims, err := claimsFromToken(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnauthorized)
		return
	}

	if claims["role"] != "admin" {
		http.Error(w, "Forbidden: Admin access required", http.StatusForbidden)
		return
	}

	var req struct {
		Role      string  `json:"role"`
		MinMargin float64 `json:"min_margin"`
		MaxMargin float64 `json:"max_margin"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid payload", http.StatusBadRequest)
		return
	}

	if req.Role == "" {
		http.Error(w, "Role is required", http.StatusBadRequest)
		return
	}

	if db == nil {
		http.Error(w, "Database connection unavailable", http.StatusInternalServerError)
		return
	}

	_, err = db.Exec("UPDATE role_margins SET min_margin = $1, max_margin = $2, updated_at = CURRENT_TIMESTAMP WHERE role = $3", req.MinMargin, req.MaxMargin, req.Role)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Write([]byte(`{"status":"success"}`))
}
