//go:build darwin

package main

import (
	"fmt"
	"golang.org/x/sys/unix"
	"os"
	"strings"
	"syscall"
)

// Hosts uses the fixed file's validation, independent of user-configured parent permissions.
var darwinHosts = &hostsStore{path: "/private/etc/hosts"}

func validateHostsMutation(st os.FileInfo) error {
	flags := st.Sys().(*syscall.Stat_t).Flags
	if flags&(unix.UF_IMMUTABLE|unix.SF_IMMUTABLE|unix.UF_APPEND|unix.SF_APPEND) != 0 {
		return fmt.Errorf("hosts is immutable or append-only; administrator maintenance required")
	}
	return nil
}

func preserveHostsAttributes(source, target *os.File) error {
	attributes := map[string][]byte{}
	for _, file := range []*os.File{source, target} {
		fd := int(file.Fd())
		n, err := unix.Flistxattr(fd, nil)
		if err != nil {
			return err
		}
		if n > 65536 {
			return fmt.Errorf("hosts attributes exceed size limit")
		}
		if n == 0 {
			continue
		}
		list := make([]byte, n)
		n, err = unix.Flistxattr(fd, list)
		if err != nil {
			return err
		}
		for _, name := range strings.Split(strings.TrimRight(string(list[:n]), "\x00"), "\x00") {
			if file == target {
				if _, ok := attributes[name]; !ok {
					if err = unix.Fremovexattr(fd, name); err != nil {
						return err
					}
				}
				continue
			}
			size, err := unix.Fgetxattr(fd, name, nil)
			if err != nil {
				return err
			}
			if size > 65536 {
				return fmt.Errorf("hosts attribute exceeds size limit")
			}
			value := make([]byte, size)
			size, err = unix.Fgetxattr(fd, name, value)
			if err != nil {
				return err
			}
			attributes[name] = value[:size]
		}
	}
	for name, value := range attributes {
		if err := unix.Fsetxattr(int(target.Fd()), name, value, 0); err != nil {
			return err
		}
	}
	if err := copyDarwinACL(source, target); err != nil {
		return err
	}
	st, err := source.Stat()
	if err != nil {
		return err
	}
	if err = validateHostsMutation(st); err != nil {
		return err
	}
	return unix.Fchflags(int(target.Fd()), int(st.Sys().(*syscall.Stat_t).Flags))
}
