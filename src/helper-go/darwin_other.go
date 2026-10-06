//go:build !darwin

package main

import (
	"fmt"
	"net"
)

type darwinPolicy struct{}

var installedDarwinPolicy darwinPolicy

const darwinSocketPath = ""
const darwinKeyPath = ""

func prepareDarwinSocket() error         { return nil }
func darwinSocketReady() error           { return nil }
func initializeDarwin() error            { return nil }
func loadDarwinKey() error               { return nil }
func validateDarwinUID(int) error        { return nil }
func installDarwinPolicy([]string) error { return nil }
func listenDarwinSocket() (net.Listener, error) {
	return nil, fmt.Errorf("macOS socket is unavailable on this platform")
}
func dispatchDarwin(TaskItem, darwinPolicy) (interface{}, error) {
	return nil, fmt.Errorf("macOS helper is unavailable on this platform")
}
