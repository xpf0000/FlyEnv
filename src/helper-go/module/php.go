package module

import (
	"fmt"
	"helper-go/utils" // Import your utils package
	"path/filepath"   // For filepath.Dir
)

// PhpManager embeds BaseManager, providing PHP-specific functionalities.
type PhpManager struct {
	BaseManager // Anonymous field for composition and method "inheritance"
}

// IniFileFixed ensures the main PHP ini file is correctly placed and has permissions.
func (p *PhpManager) IniFileFixed(baseIni, ini string) (bool, error) {
	if err := utils.ValidatePathForWrite(baseIni); err != nil {
		return false, fmt.Errorf("path not allowed: %s: %w", baseIni, err)
	}
	if err := utils.ValidatePathForRead(ini); err != nil {
		return false, fmt.Errorf("path not allowed: %s: %w", ini, err)
	}
	var err error
	var stderr string

	err = utils.Mkdirp(filepath.Dir(baseIni))
	if err != nil {
		return false, fmt.Errorf("failed to create directory for '%s': %w", baseIni, err)
	}

	_, stderr, err = utils.ExecCommand("cp", []string{"-f", ini, baseIni}, nil)
	if err != nil {
		return false, fmt.Errorf("failed to copy ini file from '%s' to '%s': %w, stderr: %s", ini, baseIni, err, stderr)
	}

	_, stderr, err = utils.ExecCommand("chmod", []string{"755", baseIni}, nil)
	if err != nil {
		return false, fmt.Errorf("failed to set permissions on '%s': %w, stderr: %s", baseIni, err, stderr)
	}

	return true, nil
}

// NewPhpManager creates and returns a new instance of PhpManager.
func NewPhpManager() *PhpManager {
	return &PhpManager{
		BaseManager: BaseManager{}, // Initialize the BaseManager instance
	}
}
