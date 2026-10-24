//go:build !linux

package main

import (
	"fmt"
	"net"
)

type linuxPolicy struct{}

var installedLinuxPolicy linuxPolicy

const linuxSocketPath = ""

func listenLinuxSocket() (net.Listener, error) {
	return nil, fmt.Errorf("Linux socket is unavailable on this platform")
}

func prepareLinuxSocket() error { return nil }

func initializeLinux() error                                   { return nil }
func validateLinuxUID(int) error                               { return nil }
func loadLinuxKey() error                                      { return nil }
func linuxSocketReady() error                                  { return nil }
func linuxServiceChild() error                                 { return nil }
func installLinuxPolicy([]string) error                        { return nil }
func dispatchLinux(TaskItem, linuxPolicy) (interface{}, error) { return nil, nil }
