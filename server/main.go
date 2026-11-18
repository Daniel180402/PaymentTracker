// PaymentTracker home server: serves the web app and stores its data in a
// single JSON file. Standard library only, built into a scratch image.
package main

import (
	"context"
	"crypto/subtle"
	"errors"
	"flag"
	"io"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"
)

const maxBody = 10 << 20 // 10 MB is far more than years of data

func main() {
	healthcheck := flag.Bool("healthcheck", false, "probe the running server and exit (for Docker HEALTHCHECK)")
	flag.Parse()

	addr := env("PT_ADDR", ":8080")
	if *healthcheck {
		os.Exit(probe(addr))
	}

	keep, _ := strconv.Atoi(env("PT_BACKUPS", "30"))
	store, err := OpenStore(env("PT_DATA_DIR", "/data"), keep)
	if err != nil {
		log.Fatalf("open data: %v", err)
	}
	web, _ := fs.Sub(dist, "dist")
	static, err := LoadStatic(web)
	if err != nil {
		log.Fatalf("load web app: %v", err)
	}

	srv := &http.Server{
		Addr:              addr,
		Handler:           NewHandler(store, static, os.Getenv("PT_USER"), os.Getenv("PT_PASSWORD")),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	go func() {
		log.Printf("PaymentTracker in ascolto su %s", addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatal(err)
		}
	}()
	<-ctx.Done()
	shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdown)
}

// NewHandler wires the API, the health endpoint and the static app.
func NewHandler(store *Store, static http.Handler, user, password string) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})
	api := http.NewServeMux()
	api.HandleFunc("GET /api/data", func(w http.ResponseWriter, r *http.Request) { getData(store, w, r) })
	api.HandleFunc("PUT /api/data", func(w http.ResponseWriter, r *http.Request) { putData(store, w, r) })
	mux.Handle("/api/", withAuth(api, user, password))
	mux.Handle("/", withAuth(static, user, password))
	return securityHeaders(mux)
}

func getData(store *Store, w http.ResponseWriter, r *http.Request) {
	data, etag := store.Get()
	h := w.Header()
	h.Set("ETag", etag)
	h.Set("Cache-Control", "no-store")
	if r.Header.Get("If-None-Match") == etag {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	if data == nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	h.Set("Content-Type", "application/json")
	_, _ = w.Write(data)
}

func putData(store *Store, w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxBody))
	if err != nil {
		http.Error(w, "body too large", http.StatusRequestEntityTooLarge)
		return
	}
	etag, err := store.Put(body, r.Header.Get("If-Match"))
	w.Header().Set("Cache-Control", "no-store")
	switch {
	case errors.Is(err, ErrConflict):
		// someone else saved first: hand back the current version
		data, current := store.Get()
		w.Header().Set("ETag", current)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusPreconditionFailed)
		_, _ = w.Write(data)
	case err != nil:
		log.Printf("save: %v", err)
		http.Error(w, err.Error(), http.StatusBadRequest)
	default:
		w.Header().Set("ETag", etag)
		w.WriteHeader(http.StatusNoContent)
	}
}

// withAuth enables HTTP Basic auth when PT_USER and PT_PASSWORD are set.
func withAuth(next http.Handler, user, password string) http.Handler {
	if user == "" || password == "" {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u, p, ok := r.BasicAuth()
		if !ok ||
			subtle.ConstantTimeCompare([]byte(u), []byte(user)) != 1 ||
			subtle.ConstantTimeCompare([]byte(p), []byte(password)) != 1 {
			w.Header().Set("WWW-Authenticate", `Basic realm="PaymentTracker", charset="UTF-8"`)
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "no-referrer")
		next.ServeHTTP(w, r)
	})
}

func probe(addr string) int {
	_, port, err := net.SplitHostPort(addr)
	if err != nil {
		return 1
	}
	client := http.Client{Timeout: 3 * time.Second}
	res, err := client.Get("http://127.0.0.1:" + port + "/healthz")
	if err != nil {
		return 1
	}
	res.Body.Close()
	if res.StatusCode != http.StatusNoContent {
		return 1
	}
	return 0
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
