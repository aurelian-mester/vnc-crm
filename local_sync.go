package main

import (
	"database/sql"
	"fmt"
	"log"
	"strings"

	_ "github.com/lib/pq"
)

type Customer struct {
	ID   string
	Name string
}

type PriceList struct {
	Code        string
	Description string
}

func main() {
	crmDB, err := sql.Open("postgres", "postgres://vnc_user:vnc_pass_2026@localhost/crm_db?sslmode=disable")
	if err != nil {
		log.Fatalf("Failed to connect to crm_db: %v", err)
	}
	defer crmDB.Close()

	productsDB, err := sql.Open("postgres", "postgres://vnc_user:vnc_pass_2026@localhost/products_db?sslmode=disable")
	if err != nil {
		log.Fatalf("Failed to connect to products_db: %v", err)
	}
	defer productsDB.Close()

	// 1. Fetch customers
	rows, err := crmDB.Query("SELECT id, name FROM customers")
	if err != nil {
		log.Fatalf("Failed to query customers: %v", err)
	}
	defer rows.Close()

	var customers []Customer
	for rows.Next() {
		var c Customer
		if err := rows.Scan(&c.ID, &c.Name); err == nil {
			customers = append(customers, c)
		}
	}
	fmt.Printf("Fetched %d customers from crm_db\n", len(customers))

	// 2. Fetch price lists
	pRows, err := productsDB.Query("SELECT code, description FROM price_lists")
	if err != nil {
		log.Fatalf("Failed to query price_lists: %v", err)
	}
	defer pRows.Close()

	var priceLists []PriceList
	for pRows.Next() {
		var pl PriceList
		var desc sql.NullString
		if err := pRows.Scan(&pl.Code, &desc); err == nil {
			pl.Description = desc.String
			priceLists = append(priceLists, pl)
		}
	}
	fmt.Printf("Fetched %d price lists from products_db\n", len(priceLists))

	// 3. Match and update
	matchedCount := 0
	for _, pl := range priceLists {
		if pl.Description == "" {
			continue
		}

		descLower := strings.ToLower(pl.Description)
		// Try to match with customer names
		var bestMatch *Customer
		for i, cust := range customers {
			custLower := strings.ToLower(cust.Name)
			// Clean up some common prefixes or suffixes
			cleanCust := strings.TrimSpace(custLower)
			cleanDesc := strings.TrimSpace(descLower)
			
			// Try various matching strategies
			if cleanDesc == cleanCust ||
				strings.HasPrefix(cleanDesc, cleanCust) ||
				strings.HasPrefix(cleanCust, cleanDesc) ||
				(len(cleanCust) > 5 && strings.Contains(cleanDesc, cleanCust)) {
				bestMatch = &customers[i]
				break
			}
		}

		if bestMatch != nil {
			_, err = productsDB.Exec("UPDATE price_lists SET assign_to_type = 'Customer', assign_to_no = $1 WHERE code = $2", bestMatch.ID, pl.Code)
			if err != nil {
				log.Printf("Error updating price list %s: %v", pl.Code, err)
			} else {
				matchedCount++
			}
		} else {
			// Check if description indicates "All Customers"
			if strings.Contains(descLower, "all customer") || strings.Contains(descLower, "generala") || strings.Contains(descLower, "lista pret standard") {
				_, err = productsDB.Exec("UPDATE price_lists SET assign_to_type = 'All Customers', assign_to_no = '' WHERE code = $1", pl.Code)
				if err == nil {
					matchedCount++
				}
			}
		}
	}

	fmt.Printf("Successfully matched and updated %d price lists\n", matchedCount)
}
