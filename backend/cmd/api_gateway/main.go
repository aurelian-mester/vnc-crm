package main

import (
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
)

func main() {
	log.Println("Starting API Gateway on :8080...")

	// Microservices URLs
	authServiceURL, _ := url.Parse("http://127.0.0.1:8081")
	crmServiceURL, _ := url.Parse("http://127.0.0.1:8082")
	pricingServiceURL, _ := url.Parse("http://127.0.0.1:8083")

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		log.Printf("Proxying request: %s %s", r.Method, r.URL.Path)

		var target *url.URL

		switch {
		case strings.HasPrefix(r.URL.Path, "/auth"):
			target = authServiceURL
		case strings.HasPrefix(r.URL.Path, "/customers") || strings.HasPrefix(r.URL.Path, "/quotes") || strings.HasPrefix(r.URL.Path, "/production") || strings.HasPrefix(r.URL.Path, "/leads") || strings.HasPrefix(r.URL.Path, "/opportunities") || strings.HasPrefix(r.URL.Path, "/projects"):
			target = crmServiceURL
		case strings.HasPrefix(r.URL.Path, "/pricing") || strings.HasPrefix(r.URL.Path, "/calculate") || strings.HasPrefix(r.URL.Path, "/products"):
			target = pricingServiceURL
		case r.URL.Path == "/health":
			w.WriteHeader(http.StatusOK)
			w.Write([]byte("API Gateway OK"))
			return
		default:
			w.WriteHeader(http.StatusNotFound)
			w.Write([]byte("Not Found"))
			return
		}

		proxy := httputil.NewSingleHostReverseProxy(target)
		proxy.ServeHTTP(w, r)
	})

	log.Fatal(http.ListenAndServe(":8080", nil))
}
