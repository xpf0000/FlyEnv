//go:build linux

package main

import (
	"fmt"
	"os"
	"path/filepath"
)

func findUnixCA() (bool, error) {
	// Query the generated trust bundles, not anchors left by a failed update.
	for _, path := range []string{"/etc/ssl/certs/ca-certificates.crt", "/etc/pki/tls/certs/ca-bundle.crt", "/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem", "/etc/ssl/cert.pem"} {
		file, err := os.Open(path)
		if os.IsNotExist(err) {
			continue
		}
		if err != nil {
			return false, err
		}
		data, err := readBoundedFile(file, 16*1024*1024)
		file.Close()
		if err != nil {
			return false, err
		}
		if containsUnixCA(data) {
			return true, nil
		}
	}
	return false, nil
}

func importUnixCA(snapshot string) error {
	dir, tool := "/usr/local/share/ca-certificates", "/usr/sbin/update-ca-certificates"
	if _, err := os.Stat(tool); os.IsNotExist(err) {
		dir, tool = "/etc/pki/ca-trust/source/anchors", "/usr/bin/update-ca-trust"
	}
	return installLinuxCA(snapshot, dir, tool)
}

func installLinuxCA(snapshot, dir, tool string) error {
	data, err := os.ReadFile(snapshot) // The already validated root-private snapshot.
	if err != nil {
		return err
	}
	temp, err := os.CreateTemp(dir, ".flyenv-ca-*.crt")
	if err != nil {
		return err
	}
	defer os.Remove(temp.Name())
	defer temp.Close()
	if err = temp.Chmod(0644); err != nil {
		return err
	}
	if _, err = temp.Write(data); err != nil {
		return err
	}
	if err = temp.Sync(); err != nil {
		return err
	}
	if err = temp.Close(); err != nil {
		return err
	}
	if err = os.Rename(temp.Name(), filepath.Join(dir, unixCAFile)); err != nil {
		return err
	}
	if err = runSystemTool(tool); err != nil {
		return fmt.Errorf("FlyEnv CA copied but trust update failed: %w", err)
	}
	return nil
}
