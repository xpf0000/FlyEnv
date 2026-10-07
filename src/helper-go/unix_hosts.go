//go:build linux || darwin

package main

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"syscall"

	"golang.org/x/sys/unix"
)

type hostsSnapshot struct {
	Content string `json:"content"`
	Digest  string `json:"digest"`
}
type hostsStore struct {
	path string
	mu   sync.Mutex
}

func digest(content string) string {
	hash := sha256.Sum256([]byte(content))
	return hex.EncodeToString(hash[:])
}
func readHostsFile(f *os.File) (string, error) {
	st, err := f.Stat()
	if err != nil {
		return "", err
	}
	if !st.Mode().IsRegular() || st.Sys().(*syscall.Stat_t).Nlink != 1 || st.Size() > hostsLimit {
		return "", fmt.Errorf("unsafe or oversized hosts file")
	}
	data, err := io.ReadAll(io.LimitReader(f, hostsLimit+1))
	if len(data) > hostsLimit {
		return "", fmt.Errorf("hosts file exceeds size limit")
	}
	return string(data), err
}
func (s *hostsStore) read() (hostsSnapshot, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	f, err := openNoSymlinks(s.path, unix.O_RDONLY, 0)
	if err != nil {
		return hostsSnapshot{}, err
	}
	defer f.Close()
	content, err := readHostsFile(f)
	return hostsSnapshot{Content: content, Digest: digest(content)}, err
}
func (s *hostsStore) update(expected string, transform func(string) (string, error)) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	f, err := openNoSymlinks(s.path, unix.O_RDONLY, 0)
	if err != nil {
		return err
	}
	defer f.Close()
	if err = unix.Flock(int(f.Fd()), unix.LOCK_EX); err != nil {
		return err
	}
	defer unix.Flock(int(f.Fd()), unix.LOCK_UN)
	content, err := readHostsFile(f)
	if err != nil {
		return err
	}
	if expected != "" && digest(content) != expected {
		return fmt.Errorf("hosts changed; reload before saving")
	}
	next, err := transform(content)
	if err != nil {
		return err
	}
	if next == content {
		return nil
	}
	if len(next) > hostsLimit || strings.ContainsRune(next, 0) {
		return fmt.Errorf("invalid or oversized hosts text")
	}
	current, err := os.Lstat(s.path)
	if err != nil {
		return err
	}
	opened, err := f.Stat()
	if err != nil {
		return err
	}
	if !os.SameFile(current, opened) {
		return fmt.Errorf("hosts file was replaced; reload before saving")
	}
	if err = validateHostsMutation(opened); err != nil {
		return err
	}
	temp, err := os.CreateTemp(filepath.Dir(s.path), ".flyenv-hosts-*")
	if err != nil {
		return err
	}
	defer os.Remove(temp.Name())
	defer temp.Close()
	ownership := opened.Sys().(*syscall.Stat_t)
	if err = temp.Chown(int(ownership.Uid), int(ownership.Gid)); err != nil {
		return err
	}
	if err = temp.Chmod(opened.Mode().Perm()); err != nil {
		return err
	}
	if _, err = temp.WriteString(next); err != nil {
		return err
	}
	if err = preserveHostsAttributes(f, temp); err != nil {
		return fmt.Errorf("cannot preserve hosts security attributes: %w", err)
	}
	if err = temp.Sync(); err != nil {
		return err
	}
	if err = temp.Close(); err != nil {
		return err
	}
	// Re-check the snapshot immediately before publication; never replay a stale edit.
	current, err = os.Lstat(s.path)
	if err != nil {
		return err
	}
	if !os.SameFile(current, opened) {
		return fmt.Errorf("hosts file was replaced; reload before saving")
	}
	if _, err = f.Seek(0, 0); err != nil {
		return err
	}
	latest, err := readHostsFile(f)
	if err != nil {
		return err
	}
	if latest != content {
		return fmt.Errorf("hosts changed; reload before saving")
	}
	if err = os.Rename(temp.Name(), s.path); err != nil {
		return fmt.Errorf("cannot atomically publish hosts: %w", err)
	}
	return nil
}

// ACLs and SELinux labels are xattrs too. Copy them before publishing the new inode.
func (s *hostsStore) replace(content, expected string) (bool, error) {
	if len(expected) != 64 {
		return false, fmt.Errorf("hosts content digest is required")
	}
	changed := false
	err := s.update(expected, func(current string) (string, error) {
		changed = current != content
		return content, nil
	})
	return changed && err == nil, err
}

func (s *hostsStore) syncManaged(entries, expected string) (bool, error) {
	changed := false
	err := s.update(expected, func(content string) (string, error) {
		next, err := mergeManagedHosts(content, entries)
		changed = next != content
		return next, err
	})
	return changed && err == nil, err
}

func mergeManagedHosts(content, entries string) (string, error) {
	const begin = "#X-HOSTS-BEGIN#"
	const end = "#X-HOSTS-END#"
	block := ""
	if entries != "" {
		block = begin + "\n" + strings.TrimSuffix(entries, "\n") + "\n" + end
	}
	start := strings.Index(content, begin)
	stop := strings.Index(content, end)
	if start < 0 && stop < 0 {
		if block == "" {
			return content, nil
		}
		separator := ""
		if content != "" && !strings.HasSuffix(content, "\n") {
			separator = "\n"
		}
		return content + separator + block + "\n", nil
	}
	result := ""
	for start >= 0 || stop >= 0 {
		if start < 0 || stop < start || strings.Contains(content[start+len(begin):stop], begin) {
			return "", fmt.Errorf("ambiguous FlyEnv hosts markers; edit hosts manually")
		}
		result += content[:start] + block
		block = ""
		content = content[stop+len(end):]
		start, stop = strings.Index(content, begin), strings.Index(content, end)
	}
	return result + content, nil
}
