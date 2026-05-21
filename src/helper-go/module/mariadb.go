package module

import (
	"fmt"
	"helper-go/utils" // Import your utils package
)

// MariadbManager embeds BaseManager, providing MariaDB-specific functionalities.
type MariadbManager struct {
	BaseManager // Anonymous field for composition and method "inheritance"
}

// MacportsDirFixed ensures the MacPorts directory structure is correctly set up for MariaDB.
func (m *MariadbManager) MacportsDirFixed(enDir, shareDir string) (bool, error) {
	if err := utils.ValidatePathForWrite(enDir); err != nil {
		return false, fmt.Errorf("path not allowed: %s: %w", enDir, err)
	}
	if err := utils.ValidatePathForRead(shareDir); err != nil {
		return false, fmt.Errorf("path not allowed: %s: %w", shareDir, err)
	}
	_, stderr, err := utils.ExecCommand("mkdir", []string{"-p", enDir}, nil)
	if err != nil {
		return false, fmt.Errorf("failed to create directory '%s': %w, stderr: %s", enDir, err, stderr)
	}

	_, stderr, err = utils.ExecCommand("cp", []string{"-R", shareDir, enDir}, nil)
	if err != nil {
		return false, fmt.Errorf("failed to copy shared directory '%s' to '%s': %w, stderr: %s", shareDir, enDir, err, stderr)
	}

	return true, nil
}

// NewMariadbManager creates and returns a new instance of MariadbManager.
func NewMariadbManager() *MariadbManager {
	return &MariadbManager{
		BaseManager: BaseManager{}, // Initialize the BaseManager instance
	}
}
