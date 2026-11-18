package main

import (
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"io/fs"
	"mime"
	"net/http"
	"path"
	"strconv"
	"strings"
)

// dist is the Vite build, with .br/.gz siblings produced at image build time.
//
//go:embed all:dist
var dist embed.FS

type asset struct {
	raw, br, gz []byte
	ctype       string
	etag        string
	immutable   bool
}

// Static serves the SPA from memory, picking the precompressed variant the
// client accepts. Hashed files under /assets/ are cached forever, the rest
// is revalidated with an ETag.
type Static struct {
	files map[string]*asset
}

func init() {
	_ = mime.AddExtensionType(".mjs", "text/javascript; charset=utf-8")
	_ = mime.AddExtensionType(".webmanifest", "application/manifest+json")
}

func LoadStatic(root fs.FS) (*Static, error) {
	s := &Static{files: map[string]*asset{}}
	err := fs.WalkDir(root, ".", func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		if strings.HasSuffix(p, ".br") || strings.HasSuffix(p, ".gz") || path.Base(p) == ".gitkeep" {
			return nil
		}
		raw, err := fs.ReadFile(root, p)
		if err != nil {
			return err
		}
		a := &asset{raw: raw, immutable: strings.HasPrefix(p, "assets/")}
		a.br, _ = fs.ReadFile(root, p+".br")
		a.gz, _ = fs.ReadFile(root, p+".gz")
		a.ctype = mime.TypeByExtension(path.Ext(p))
		if a.ctype == "" {
			a.ctype = http.DetectContentType(raw)
		}
		sum := sha256.Sum256(raw)
		a.etag = `"` + hex.EncodeToString(sum[:8]) + `"`
		s.files["/"+p] = a
		return nil
	})
	return s, err
}

func (s *Static) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	p := path.Clean("/" + r.URL.Path)
	a, ok := s.files[p]
	if !ok {
		// unknown paths without an extension are client-side routes
		if path.Ext(p) != "" {
			http.NotFound(w, r)
			return
		}
		p = "/index.html"
		a = s.files[p]
		if a == nil {
			http.NotFound(w, r)
			return
		}
	}

	h := w.Header()
	h.Set("Content-Type", a.ctype)
	h.Set("Vary", "Accept-Encoding")
	h.Set("ETag", a.etag)
	if a.immutable {
		h.Set("Cache-Control", "public, max-age=31536000, immutable")
	} else {
		h.Set("Cache-Control", "no-cache")
	}
	if match := r.Header.Get("If-None-Match"); match != "" && match == a.etag {
		w.WriteHeader(http.StatusNotModified)
		return
	}

	body := a.raw
	accept := r.Header.Get("Accept-Encoding")
	switch {
	case a.br != nil && acceptsEncoding(accept, "br"):
		h.Set("Content-Encoding", "br")
		body = a.br
	case a.gz != nil && acceptsEncoding(accept, "gzip"):
		h.Set("Content-Encoding", "gzip")
		body = a.gz
	}
	h.Set("Content-Length", strconv.Itoa(len(body)))
	if r.Method == http.MethodHead {
		return
	}
	_, _ = w.Write(body)
}

// acceptsEncoding reports whether enc is listed with a non-zero q value.
func acceptsEncoding(header, enc string) bool {
	for _, part := range strings.Split(header, ",") {
		name, params, _ := strings.Cut(strings.TrimSpace(part), ";")
		if !strings.EqualFold(strings.TrimSpace(name), enc) {
			continue
		}
		q := strings.TrimSpace(params)
		if v, ok := strings.CutPrefix(q, "q="); ok {
			f, err := strconv.ParseFloat(v, 64)
			return err == nil && f > 0
		}
		return true
	}
	return false
}
