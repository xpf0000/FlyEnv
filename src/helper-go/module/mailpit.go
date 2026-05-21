package module

import (
	"fmt"
	"helper-go/utils" // Import your utils package
)

// MailpitManager embeds BaseManager, providing Mailpit-specific functionalities.
type MailpitManager struct {
	BaseManager // Anonymous field for composition and method "inheritance"
}

// BinFixed attempts to remove the quarantine attribute from a binary on macOS.
func (m *MailpitManager) BinFixed(bin string) (bool, error) {
	if err := utils.ValidatePathForRead(bin); err != nil {
		return false, fmt.Errorf("path not allowed: %s: %w", bin, err)
	}
	if utils.IsMacOS() {
		if utils.ExistsSync(bin) {
			_, stderr, err := utils.ExecCommand("xattr", []string{"-dr", "com.apple.quarantine", bin}, nil)
			if err != nil {
				return false, fmt.Errorf("failed to remove quarantine attribute from '%s': %w, stderr: %s", bin, err, stderr)
			}
		}
	}
	return true, nil
}

// NewMailpitManager creates and returns a new instance of MailpitManager.
func NewMailpitManager() *MailpitManager {
	return &MailpitManager{
		BaseManager: BaseManager{}, // Initialize the BaseManager instance
	}
}
