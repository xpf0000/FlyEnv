package utils

// PeerInfo describes the operating-system identity observed on the helper transport.
type PeerInfo struct {
	PID     int
	UID     int
	GID     int
	Exe     string
	UserSID string
}
