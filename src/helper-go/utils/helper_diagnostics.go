package utils

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sync"
)

const (
	HelperStartupLogName       = "startup.log"
	HelperStartupLogBackupName = "startup.log.1"
	HelperStartupLogMaxBytes   = 256 * 1024
)

// helperDiagnosticLog is deliberately small: it only supports append writes,
// rotates by rename, and never truncates an existing file.
type helperDiagnosticLog struct {
	mu      sync.Mutex
	file    *os.File
	path    string
	backup  string
	maxSize int64
}

func OpenWindowsHelperDiagnostics(paths WindowsHelperPaths) (io.WriteCloser, error) {
	root := filepath.Clean(paths.InstanceRoot)
	if root == "." || root == "" {
		return nil, fmt.Errorf("helper diagnostics instance directory is empty")
	}
	if err := validateHelperDiagnosticsDirectory(root); err != nil {
		return nil, err
	}
	path := paths.DiagnosticsPath
	if path == "" {
		path = filepath.Join(root, HelperStartupLogName)
	}
	if filepath.Dir(filepath.Clean(path)) != root {
		return nil, fmt.Errorf("helper diagnostics path is outside the instance directory")
	}
	log := &helperDiagnosticLog{
		path:    path,
		backup:  filepath.Join(root, HelperStartupLogBackupName),
		maxSize: HelperStartupLogMaxBytes,
	}
	file, err := openDiagnosticFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to open helper startup diagnostics: %w", err)
	}
	log.file = file
	if info, statErr := file.Stat(); statErr == nil && info.Size() > log.maxSize {
		if err := log.rotateLocked(); err != nil {
			file.Close()
			return nil, fmt.Errorf("failed to rotate helper startup diagnostics: %w", err)
		}
	} else if statErr != nil {
		file.Close()
		return nil, fmt.Errorf("failed to inspect helper startup diagnostics: %w", statErr)
	}
	return log, nil
}

func (l *helperDiagnosticLog) Write(data []byte) (int, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.file == nil {
		return 0, os.ErrClosed
	}
	written := 0
	for written < len(data) {
		info, err := l.file.Stat()
		if err != nil {
			return written, err
		}
		if info.Size() >= l.maxSize {
			if err := l.rotateLocked(); err != nil {
				return written, err
			}
			continue
		}
		room := int(l.maxSize - info.Size())
		end := written + room
		if end > len(data) {
			end = len(data)
		}
		n, err := l.file.Write(data[written:end])
		written += n
		if err != nil {
			return written, err
		}
		if n == 0 {
			return written, io.ErrShortWrite
		}
	}
	return written, nil
}

func (l *helperDiagnosticLog) rotateLocked() error {
	if l.file != nil {
		if err := l.file.Close(); err != nil {
			return err
		}
		l.file = nil
	}
	if err := removeDiagnosticFile(l.backup); err != nil && !os.IsNotExist(err) {
		return err
	}
	if err := validateDiagnosticFile(l.path); err != nil && !os.IsNotExist(err) {
		return err
	}
	if err := os.Rename(l.path, l.backup); err != nil && !os.IsNotExist(err) {
		return err
	}
	file, err := openDiagnosticFile(l.path)
	if err != nil {
		return err
	}
	l.file = file
	return nil
}

func (l *helperDiagnosticLog) Close() error {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.file == nil {
		return nil
	}
	err := l.file.Close()
	l.file = nil
	return err
}
