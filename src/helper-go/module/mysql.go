package module

import (
	"fmt"
	"helper-go/utils" // Import your utils package
)

// MysqlManager embeds BaseManager, providing MySQL-specific functionalities.
type MysqlManager struct {
	BaseManager // Anonymous field for composition and method "inheritance"
}

// MacportsDirFixed ensures the MacPorts directory structure is correctly set up for MySQL.
func (m *MysqlManager) MacportsDirFixed(enDir, shareDir, langDir, langEnDir string) (bool, error) {
	if err := utils.ValidatePathForWrite(enDir); err != nil {
		return false, fmt.Errorf("path not allowed: %s: %w", enDir, err)
	}
	if err := utils.ValidatePathForRead(shareDir); err != nil {
		return false, fmt.Errorf("path not allowed: %s: %w", shareDir, err)
	}
	if err := utils.ValidatePathForWrite(langDir); err != nil {
		return false, fmt.Errorf("path not allowed: %s: %w", langDir, err)
	}
	if err := utils.ValidatePathForRead(langEnDir); err != nil {
		return false, fmt.Errorf("path not allowed: %s: %w", langEnDir, err)
	}
	var err error
	var stderr string

	_, stderr, err = utils.ExecCommand("mkdir", []string{"-p", enDir}, nil)
	if err != nil {
		return false, fmt.Errorf("failed to create directory '%s': %w, stderr: %s", enDir, err, stderr)
	}

	_, stderr, err = utils.ExecCommand("cp", []string{"-R", shareDir, enDir}, nil)
	if err != nil {
		return false, fmt.Errorf("failed to copy shared directory contents from '%s' to '%s': %w, stderr: %s", shareDir, enDir, err, stderr)
	}

	_, stderr, err = utils.ExecCommand("mkdir", []string{"-p", langDir}, nil)
	if err != nil {
		return false, fmt.Errorf("failed to create directory '%s': %w, stderr: %s", langDir, err, stderr)
	}

	_, stderr, err = utils.ExecCommand("cp", []string{"-R", langEnDir, langDir}, nil)
	if err != nil {
		return false, fmt.Errorf("failed to copy language directory from '%s' to '%s': %w, stderr: %s", langEnDir, langDir, err, stderr)
	}

	return true, nil
}

// NewMysqlManager creates and returns a new instance of MysqlManager.
func NewMysqlManager() *MysqlManager {
	return &MysqlManager{
		BaseManager: BaseManager{}, // Initialize the BaseManager instance
	}
}
