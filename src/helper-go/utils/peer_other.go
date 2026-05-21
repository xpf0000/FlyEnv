//go:build !windows && !linux && !darwin

package utils

import (
	"fmt"
	"net"
)

func PeerInfoFromConn(conn net.Conn) (PeerInfo, error) {
	return PeerInfo{}, fmt.Errorf("peer credentials are unsupported for %T", conn)
}

func CurrentUserSID() (string, error) {
	return "", fmt.Errorf("Windows SID is unavailable")
}
