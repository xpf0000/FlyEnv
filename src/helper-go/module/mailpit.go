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
	if utils.IsMacOS() {
		if utils.ExistsSync(bin) {
			command := fmt.Sprintf(`xattr -dr "com.apple.quarantine" "%s"`, bin)
			_, stderr, err := utils.ExecPromise(command, nil) // No options passed in JS, so nil
			if err != nil {
				// In Go, it's better to log the error rather than silently ignoring it like JS catch {}
				// Or, return the error to the caller for proper handling.
				return false, fmt.Errorf("failed to remove quarantine attribute from '%s': %w, stderr: %s", bin, err, stderr)
			}
		}
	}
	// Always return true if not macOS, or if macOS and successful/binary didn't exist
	return true, nil
}

// NewMailpitManager creates and returns a new instance of MailpitManager.
func NewMailpitManager() *MailpitManager {
	return &MailpitManager{
		BaseManager: BaseManager{}, // Initialize the BaseManager instance
	}
}
