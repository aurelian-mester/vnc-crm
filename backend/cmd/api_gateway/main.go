package main

import (
	"encoding/json"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strings"

	"github.com/golang-jwt/jwt/v5"
)

// jwtKey is loaded from the JWT_SECRET environment variable at startup (fail-closed).
// It must match the key the auth_service signs tokens with for this deployment.
var jwtKey []byte

// publicPaths are reachable WITHOUT a valid JWT: the login redirect, the OAuth
// callback, and the health check. Everything else requires authentication.
func isPublic(path string) bool {
	switch path {
	case "/health", "/auth/login", "/auth/callback":
		return true
	}
	return false
}

// hasValidToken validates the Bearer JWT: correct format, HS256 signature against
// jwtKey, and unexpired. The explicit method allow-list prevents alg-confusion.
func hasValidToken(r *http.Request) bool {
	authHeader := r.Header.Get("Authorization")
	parts := strings.SplitN(authHeader, " ", 2)
	if len(parts) != 2 || parts[0] != "Bearer" || parts[1] == "" {
		return false
	}
	token, err := jwt.Parse(parts[1], func(t *jwt.Token) (interface{}, error) {
		return jwtKey, nil
	}, jwt.WithValidMethods([]string{"HS256"}))
	return err == nil && token.Valid
}

func unauthorized(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized"})
}

func main() {
	log.Println("Starting API Gateway on :8080...")

	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		log.Fatal("FATAL: JWT_SECRET environment variable is required")
	}
	jwtKey = []byte(secret)

	// Microservices URLs
	authServiceURL, _ := url.Parse("http://127.0.0.1:8081")
	crmServiceURL, _ := url.Parse("http://127.0.0.1:8082")
	pricingServiceURL, _ := url.Parse("http://127.0.0.1:8083")

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		log.Printf("Request: %s %s", r.Method, r.URL.Path)

		// Strip spoofable identity headers so downstream services can never trust them.
		r.Header.Del("X-User")
		r.Header.Del("X-Role")
		r.Header.Del("X-User-Id")
		r.Header.Del("X-Customer-Id")

		// Centralized authentication: reject anything that is not public and lacks a valid JWT.
		if !isPublic(r.URL.Path) && !hasValidToken(r) {
			unauthorized(w)
			return
		}

		var target *url.URL

		switch {
		case strings.HasPrefix(r.URL.Path, "/auth"):
			target = authServiceURL
		case strings.HasPrefix(r.URL.Path, "/customers") || strings.HasPrefix(r.URL.Path, "/quotes") || strings.HasPrefix(r.URL.Path, "/production") || strings.HasPrefix(r.URL.Path, "/leads") || strings.HasPrefix(r.URL.Path, "/opportunities") || strings.HasPrefix(r.URL.Path, "/projects") || strings.HasPrefix(r.URL.Path, "/lab-tests") || strings.HasPrefix(r.URL.Path, "/claims") || strings.HasPrefix(r.URL.Path, "/quality-config") || strings.HasPrefix(r.URL.Path, "/logistics") || strings.HasPrefix(r.URL.Path, "/box-configs"):
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
