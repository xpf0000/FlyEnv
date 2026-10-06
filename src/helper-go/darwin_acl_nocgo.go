//go:build darwin && !cgo

package main

import (
	"fmt"
	"os"
)

func nativeACLUnavailable() error {
	return fmt.Errorf("macOS helper requires a native cgo build for protected ACL operations")
}
func validateProtectedACL(*os.File) error    { return nativeACLUnavailable() }
func setDarwinKeyACL(*os.File, int) error    { return nativeACLUnavailable() }
func checkDarwinKeyACL(*os.File, int) error  { return nativeACLUnavailable() }
func copyDarwinACL(*os.File, *os.File) error { return nativeACLUnavailable() }

func nativeDarwinProcessBirth(int) (string, error) { return "", nativeACLUnavailable() }
