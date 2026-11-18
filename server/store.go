package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// Store keeps the whole app state in one JSON file, in the same format as the
// Tauri store ({"app": {...}}) so a desktop data file can simply be copied in.
type Store struct {
	mu      sync.Mutex
	path    string
	backups string
	keep    int
	data    []byte // raw AppData JSON, nil when nothing was saved yet
	etag    string
}

var ErrConflict = errors.New("revision conflict")

const emptyETag = `"0"`

func OpenStore(dir string, keepBackups int) (*Store, error) {
	if err := os.MkdirAll(filepath.Join(dir, "backups"), 0o700); err != nil {
		return nil, err
	}
	s := &Store{
		path:    filepath.Join(dir, "paymenttracker.json"),
		backups: filepath.Join(dir, "backups"),
		keep:    keepBackups,
		etag:    emptyETag,
	}
	raw, err := os.ReadFile(s.path)
	if errors.Is(err, os.ErrNotExist) {
		return s, nil
	}
	if err != nil {
		return nil, err
	}
	var file struct {
		App json.RawMessage `json:"app"`
	}
	if err := json.Unmarshal(raw, &file); err != nil {
		return nil, fmt.Errorf("%s: %w", s.path, err)
	}
	if len(file.App) > 0 && !bytes.Equal(file.App, []byte("null")) {
		s.data = file.App
		s.etag = etagOf(file.App)
	}
	return s, nil
}

func etagOf(b []byte) string {
	sum := sha256.Sum256(b)
	return `"` + hex.EncodeToString(sum[:8]) + `"`
}

// Get returns the current data (nil if empty) and its ETag.
func (s *Store) Get() ([]byte, string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.data, s.etag
}

// Put replaces the data. When ifMatch is set it must equal the current ETag,
// otherwise ErrConflict is returned and nothing is written.
func (s *Store) Put(data []byte, ifMatch string) (string, error) {
	var probe map[string]json.RawMessage
	if err := json.Unmarshal(data, &probe); err != nil {
		return "", fmt.Errorf("invalid data: %w", err)
	}
	compact := new(bytes.Buffer)
	if err := json.Compact(compact, data); err != nil {
		return "", err
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if ifMatch != "" && ifMatch != "*" && ifMatch != s.etag {
		return s.etag, ErrConflict
	}
	next := compact.Bytes()
	tag := etagOf(next)
	if tag == s.etag {
		return tag, nil // nothing changed
	}
	s.backupDaily()
	file := append(append([]byte(`{"app":`), next...), '}')
	if err := writeAtomic(s.path, file); err != nil {
		return "", err
	}
	s.data, s.etag = next, tag
	return tag, nil
}

// backupDaily copies the current file once per day before it is overwritten
// and keeps only the most recent s.keep copies.
func (s *Store) backupDaily() {
	if s.keep <= 0 || s.data == nil {
		return
	}
	name := filepath.Join(s.backups, "paymenttracker-"+time.Now().Format("2006-01-02")+".json")
	if _, err := os.Stat(name); err == nil {
		return
	}
	if raw, err := os.ReadFile(s.path); err == nil {
		_ = writeAtomic(name, raw)
	}
	entries, _ := os.ReadDir(s.backups)
	var names []string
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), "paymenttracker-") {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)
	for len(names) > s.keep {
		_ = os.Remove(filepath.Join(s.backups, names[0]))
		names = names[1:]
	}
}

// writeAtomic writes to a temp file, syncs it and renames it over path, so a
// crash or power cut never leaves a half-written data file.
func writeAtomic(path string, data []byte) error {
	dir := filepath.Dir(path)
	tmp, err := os.CreateTemp(dir, ".tmp-*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Chmod(tmp.Name(), 0o600); err != nil {
		return err
	}
	if err := os.Rename(tmp.Name(), path); err != nil {
		return err
	}
	if d, err := os.Open(dir); err == nil {
		_ = d.Sync()
		d.Close()
	}
	return nil
}
