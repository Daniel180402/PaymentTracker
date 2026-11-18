package main

import (
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"
)

func newTestServer(t *testing.T, user, password string) (*httptest.Server, string) {
	t.Helper()
	dir := t.TempDir()
	store, err := OpenStore(dir, 3)
	if err != nil {
		t.Fatal(err)
	}
	static, err := LoadStatic(fstest.MapFS{
		"index.html":         {Data: []byte("<!doctype html><title>PT</title>")},
		"assets/app-1.js":    {Data: []byte("console.log(1)")},
		"assets/app-1.js.br": {Data: []byte("BR")},
		"assets/app-1.js.gz": {Data: []byte("GZ")},
	})
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(NewHandler(store, static, user, password))
	t.Cleanup(srv.Close)
	return srv, dir
}

func do(t *testing.T, method, url, body string, headers map[string]string) *http.Response {
	t.Helper()
	req, _ := http.NewRequest(method, url, strings.NewReader(body))
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	// keep the raw encoded body: the transport would otherwise ask for gzip itself
	tr := &http.Transport{DisableCompression: true}
	res, err := (&http.Client{Transport: tr}).Do(req)
	if err != nil {
		t.Fatal(err)
	}
	return res
}

func readBody(res *http.Response) string {
	b, _ := io.ReadAll(res.Body)
	res.Body.Close()
	return string(b)
}

func TestDataRoundTripAndConflict(t *testing.T) {
	srv, dir := newTestServer(t, "", "")

	res := do(t, "GET", srv.URL+"/api/data", "", nil)
	if res.StatusCode != http.StatusNoContent || res.Header.Get("ETag") != emptyETag {
		t.Fatalf("empty store: %d %s", res.StatusCode, res.Header.Get("ETag"))
	}

	res = do(t, "PUT", srv.URL+"/api/data", `{"version": 1, "months": []}`, map[string]string{"If-Match": emptyETag})
	if res.StatusCode != http.StatusNoContent {
		t.Fatalf("first save: %d", res.StatusCode)
	}
	v1 := res.Header.Get("ETag")

	res = do(t, "GET", srv.URL+"/api/data", "", nil)
	if got := readBody(res); got != `{"version":1,"months":[]}` || res.Header.Get("ETag") != v1 {
		t.Fatalf("read back: %q %s", got, res.Header.Get("ETag"))
	}
	if res := do(t, "GET", srv.URL+"/api/data", "", map[string]string{"If-None-Match": v1}); res.StatusCode != http.StatusNotModified {
		t.Fatalf("revalidate: %d", res.StatusCode)
	}

	// a device with stale data must not overwrite newer data
	res = do(t, "PUT", srv.URL+"/api/data", `{"version": 1, "months": [1]}`, map[string]string{"If-Match": emptyETag})
	if res.StatusCode != http.StatusPreconditionFailed || readBody(res) != `{"version":1,"months":[]}` {
		t.Fatalf("stale save should conflict: %d", res.StatusCode)
	}

	file, _ := os.ReadFile(filepath.Join(dir, "paymenttracker.json"))
	if string(file) != `{"app":{"version":1,"months":[]}}` {
		t.Fatalf("file format: %s", file)
	}

	// data survives a restart
	store, err := OpenStore(dir, 3)
	if err != nil {
		t.Fatal(err)
	}
	if _, etag := store.Get(); etag != v1 {
		t.Fatalf("reopen etag %s != %s", etag, v1)
	}
}

func TestRejectsInvalidJSON(t *testing.T) {
	srv, _ := newTestServer(t, "", "")
	if res := do(t, "PUT", srv.URL+"/api/data", `not json`, nil); res.StatusCode != http.StatusBadRequest {
		t.Fatalf("got %d", res.StatusCode)
	}
}

func TestStaticCompressionAndCaching(t *testing.T) {
	srv, _ := newTestServer(t, "", "")

	res := do(t, "GET", srv.URL+"/assets/app-1.js", "", map[string]string{"Accept-Encoding": "gzip, br"})
	if res.Header.Get("Content-Encoding") != "br" || readBody(res) != "BR" {
		t.Fatalf("brotli not served: %q", res.Header.Get("Content-Encoding"))
	}
	if !strings.Contains(res.Header.Get("Cache-Control"), "immutable") {
		t.Fatalf("hashed asset not immutable: %q", res.Header.Get("Cache-Control"))
	}
	res = do(t, "GET", srv.URL+"/assets/app-1.js", "", map[string]string{"Accept-Encoding": "gzip, br;q=0"})
	if res.Header.Get("Content-Encoding") != "gzip" {
		t.Fatalf("gzip fallback: %q", res.Header.Get("Content-Encoding"))
	}

	// client-side routes fall back to index.html, which is revalidated
	res = do(t, "GET", srv.URL+"/conto", "", nil)
	if res.StatusCode != 200 || !strings.Contains(readBody(res), "<title>PT</title>") ||
		res.Header.Get("Cache-Control") != "no-cache" {
		t.Fatalf("spa fallback: %d %q", res.StatusCode, res.Header.Get("Cache-Control"))
	}
	if res := do(t, "GET", srv.URL+"/missing.png", "", nil); res.StatusCode != 404 {
		t.Fatalf("missing file: %d", res.StatusCode)
	}
}

func TestBasicAuth(t *testing.T) {
	srv, _ := newTestServer(t, "casa", "segreta")
	if res := do(t, "GET", srv.URL+"/api/data", "", nil); res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("no credentials: %d", res.StatusCode)
	}
	req, _ := http.NewRequest("GET", srv.URL+"/api/data", nil)
	req.SetBasicAuth("casa", "segreta")
	res, _ := http.DefaultClient.Do(req)
	if res.StatusCode != http.StatusNoContent {
		t.Fatalf("with credentials: %d", res.StatusCode)
	}
	if res := do(t, "GET", srv.URL+"/healthz", "", nil); res.StatusCode != http.StatusNoContent {
		t.Fatalf("healthz must stay open: %d", res.StatusCode)
	}
}

func TestDailyBackupRotation(t *testing.T) {
	dir := t.TempDir()
	store, _ := OpenStore(dir, 2)
	if _, err := store.Put([]byte(`{"n":1}`), ""); err != nil {
		t.Fatal(err)
	}
	for _, day := range []string{"2026-01-01", "2026-01-02", "2026-01-03"} {
		os.WriteFile(filepath.Join(dir, "backups", "paymenttracker-"+day+".json"), []byte("{}"), 0o600)
	}
	if _, err := store.Put([]byte(`{"n":2}`), ""); err != nil {
		t.Fatal(err)
	}
	entries, _ := os.ReadDir(filepath.Join(dir, "backups"))
	if len(entries) != 2 {
		t.Fatalf("want 2 backups, got %d", len(entries))
	}
	today, _ := os.ReadFile(filepath.Join(dir, "backups", entries[1].Name()))
	if string(today) != `{"app":{"n":1}}` {
		t.Fatalf("backup holds previous data: %s", today)
	}
}
