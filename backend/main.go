package main

import (
	"fmt"
	"net/http"
	"vnc-crm/backend/internal/handlers"
)

func main() {
	fmt.Println("VNC-CRM Backend starting...")
	
	http.HandleFunc("/api/health", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, "OK")
	})

	http.HandleFunc("/api/customers", handlers.GetCustomers)
	http.HandleFunc("/api/products", handlers.GetProducts)
	http.HandleFunc("/api/production", handlers.GetProductionJobs)

	fmt.Println("Server listening on :8080")
	if err := http.ListenAndServe(":8080", nil); err != nil {
		panic(err)
	}
}

