//go:build linux || darwin

package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// Resolve aliases, including an existing parent of a not-yet-created user file.
func canonicalUnixPath(path string) (string, error) {
	if !filepath.IsAbs(path) || strings.ContainsAny(path, "\x00\r\n") {
		return "", fmt.Errorf("expected absolute Unix path")
	}
	path = filepath.Clean(path)
	parent := path
	suffix := ""
	for {
		resolved, err := filepath.EvalSymlinks(parent)
		if err == nil {
			return filepath.Join(resolved, suffix), nil
		}
		if !os.IsNotExist(err) || parent == "/" {
			return "", err
		}
		// A dangling symlink is an actual unresolved path, not a missing leaf.
		if stat, statErr := os.Lstat(parent); statErr == nil && stat.Mode()&os.ModeSymlink != 0 {
			return "", err
		}
		suffix = filepath.Join(filepath.Base(parent), suffix)
		parent = filepath.Dir(parent)
	}
}

func unixDataPath(path, root string) (string, error) {
	if !filepath.IsAbs(path) || filepath.Clean(path) != path || strings.ContainsAny(path, "\x00\r\n") {
		return "", fmt.Errorf("expected clean absolute data path")
	}
	canonicalRoot, err := canonicalUnixPath(root)
	if err != nil {
		return "", err
	}
	// Only ordinary service inputs use this comparison. Resolve the selected
	// root alias, keeping links below it: the child reads/writes as the user.
	// Privileged PID repair separately pins its fixed directory without links.
	for parent := filepath.Dir(path); ; parent = filepath.Dir(parent) {
		if parent == canonicalRoot {
			return filepath.Join(canonicalRoot, strings.TrimPrefix(path, parent+"/")), nil
		}
		resolved, resolveErr := filepath.EvalSymlinks(parent)
		if resolveErr == nil && resolved == canonicalRoot {
			relative, err := filepath.Rel(parent, path)
			if err != nil {
				return "", err
			}
			return filepath.Join(canonicalRoot, relative), nil
		}
		if parent == "/" {
			break
		}
	}
	return "", fmt.Errorf("path must be inside the authorized data root")
}
