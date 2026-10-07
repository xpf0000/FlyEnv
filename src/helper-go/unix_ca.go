//go:build linux || darwin

package main

import (
	"bytes"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"syscall"
)

const unixCAName = "FlyEnv-Root-CA"
const unixCAFile = unixCAName + ".crt"
const unixCALimit = 256 * 1024

var unixCAMutex sync.Mutex

// Preserve the existing SSL RPCs, but only for FlyEnv's fixed public root CA.
func dispatchUnixCA(info TaskItem, p unixPolicy, snapshotDir string) (interface{}, error) {
	cwd := filepath.Join(p.DataRoot, "server", "CA")
	if len(info.Args) < 1 {
		return nil, fmt.Errorf("expected FlyEnv CA directory")
	}
	requested, ok := info.Args[0].(string)
	if !ok || !filepath.IsAbs(requested) {
		return nil, fmt.Errorf("expected FlyEnv CA directory")
	}
	if requested != cwd {
		// Installation records a canonical root on macOS; the UI may retain its alias.
		actual, err := filepath.EvalSymlinks(requested)
		if err != nil {
			return nil, err
		}
		expected, expectedErr := filepath.EvalSymlinks(cwd)
		if expectedErr != nil {
			return nil, expectedErr
		}
		if actual != expected {
			return nil, fmt.Errorf("expected FlyEnv CA directory")
		}
	}
	unixCAMutex.Lock()
	defer unixCAMutex.Unlock()
	switch info.Function {
	case "sslFindCertificate":
		if len(info.Args) > 2 || (len(info.Args) == 2 && info.Args[1] != unixCAName) {
			return nil, fmt.Errorf("expected fixed FlyEnv CA name")
		}
		found, err := findUnixCA()
		if err != nil {
			return nil, err
		}
		stdout := ""
		if found {
			stdout = unixCAName
		}
		return map[string]string{"stdout": stdout, "stderr": ""}, nil
	case "sslAddTrustedCert":
		if len(info.Args) != 2 || info.Args[1] != unixCAFile {
			return nil, fmt.Errorf("expected fixed FlyEnv CA filename")
		}
		snapshot, err := snapshotUnixCA(cwd, snapshotDir)
		if err != nil {
			return nil, err
		}
		defer os.Remove(snapshot)
		if err = importUnixCA(snapshot); err != nil {
			return nil, err
		}
		return true, nil
	}
	return nil, fmt.Errorf("unsupported CA operation")
}

func validateUnixCA(data []byte) error {
	if !bytes.HasPrefix(bytes.TrimSpace(data), []byte("-----BEGIN CERTIFICATE-----")) {
		return fmt.Errorf("expected public certificate data")
	}
	block, rest := pem.Decode(data)
	if block == nil || block.Type != "CERTIFICATE" || len(bytes.TrimSpace(rest)) != 0 {
		return fmt.Errorf("expected one public certificate")
	}
	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil || !cert.IsCA || cert.Subject.CommonName != unixCAName {
		return fmt.Errorf("expected FlyEnv root CA certificate")
	}
	return nil
}

func containsUnixCA(data []byte) bool {
	for len(data) > 0 {
		block, rest := pem.Decode(data)
		if block == nil {
			break
		}
		data = rest
		if block.Type == "CERTIFICATE" {
			cert, err := x509.ParseCertificate(block.Bytes)
			if err == nil && cert.Subject.CommonName == unixCAName {
				return true
			}
		}
	}
	return false
}

// Snapshot only validated public bytes; the system tool never reopens user input.
// User-managed ancestors and permissions do not gate this operation.
func snapshotUnixCA(cwd, snapshotDir string) (string, error) {
	file, err := os.OpenFile(filepath.Join(cwd, unixCAFile), os.O_RDONLY|syscall.O_NONBLOCK, 0)
	if err != nil {
		return "", err
	}
	stat, err := file.Stat()
	if err != nil {
		file.Close()
		return "", err
	}
	if !stat.Mode().IsRegular() || stat.Size() > unixCALimit {
		file.Close()
		return "", fmt.Errorf("expected bounded regular CA file")
	}
	data, err := readBoundedFile(file, unixCALimit)
	file.Close()
	if err != nil {
		return "", err
	}
	if err = validateUnixCA(data); err != nil {
		return "", err
	}
	snapshot, err := os.CreateTemp(snapshotDir, ".ca-*.crt")
	if err != nil {
		return "", err
	}
	defer func() {
		if err != nil {
			os.Remove(snapshot.Name())
		}
	}()
	_, err = snapshot.Write(data)
	closeErr := snapshot.Close()
	if err != nil {
		return "", err
	}
	if closeErr != nil {
		err = closeErr
		return "", err
	}
	return snapshot.Name(), nil
}
