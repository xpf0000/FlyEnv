//go:build darwin

package main

import (
	"errors"
	"os/exec"
	"time"
)

const systemCAKeychain = "/Library/Keychains/System.keychain"

func findUnixCA() (bool, error) {
	output, err := runFixedTool("/usr/bin/security", 20*time.Second, "find-certificate", "-a", "-c", unixCAName, "-p", systemCAKeychain)
	var exit *exec.ExitError
	if errors.As(err, &exit) && exit.ExitCode() == 44 {
		return false, nil // security's certificate-not-found result
	}
	if err != nil {
		return false, err
	}
	return containsUnixCA([]byte(output)), nil
}

func importUnixCA(snapshot string) error {
	return runSystemTool("/usr/bin/security", "add-trusted-cert", "-d", "-r", "trustRoot", "-k", systemCAKeychain, snapshot)
}
