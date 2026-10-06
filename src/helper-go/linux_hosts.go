//go:build linux

package main

import (
	"fmt"
	"golang.org/x/sys/unix"
	"os"
	"strings"
	"syscall"
)

var linuxHosts = &hostsStore{path: "/etc/hosts", protected: true}

func validateHostsMutation(os.FileInfo) error { return nil }

func preserveHostsAttributes(source, target *os.File) error {
	attributes := make(map[string][]byte)
	for _, file := range []*os.File{source, target} {
		fd := int(file.Fd())
		n, err := unix.Flistxattr(fd, nil)
		if err == unix.ENOTSUP {
			continue
		}
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
				if _, exists := attributes[name]; !exists {
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
	return nil
}

func validateProtectedACL(*os.File) error { return nil }

func protectedDirectoryMode(_ string, st os.FileInfo) bool {
	return st.Sys().(*syscall.Stat_t).Uid == 0 && st.Mode().Perm()&0022 == 0
}
