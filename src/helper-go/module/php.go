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
	var err error
	var stderr string

	// Equivalent to JS: await mkdirp(dirname(baseIni))
	// In Go, os.MkdirAll is equivalent to mkdir -p
	err = utils.Mkdirp(filepath.Dir(baseIni))
	if err != nil {
		return false, fmt.Errorf("failed to create directory for '%s': %w", baseIni, err)
	}

	// Equivalent to JS: await execPromise(`cp -f "${ini}" "${baseIni}"`)
	_, stderr, err = utils.ExecPromise(fmt.Sprintf(`cp -f "%s" "%s"`, ini, baseIni), nil)
	if err != nil {
		return false, fmt.Errorf("failed to copy ini file from '%s' to '%s': %w, stderr: %s", ini, baseIni, err, stderr)
	}

	// Equivalent to JS: await execPromise(`chmod 755 "${baseIni}"`)
	_, stderr, err = utils.ExecPromise(fmt.Sprintf(`chmod 755 "%s"`, baseIni), nil)
	if err != nil {
		return false, fmt.Errorf("failed to set permissions on '%s': %w, stderr: %s", baseIni, err, stderr)
	}

	// If all commands executed without critical errors, return true
	return true, nil
}

// IniDefaultFileFixed copies the default ini file.
func (p *PhpManager) IniDefaultFileFixed(iniDefault, ini string) (bool, error) {
	var err error
	var stderr string

	// Equivalent to JS: await execPromise(`cp -f "${ini}" "${iniDefault}"`)
	_, stderr, err = utils.ExecPromise(fmt.Sprintf(`cp -f "%s" "%s"`, ini, iniDefault), nil)
	if err != nil {
		return false, fmt.Errorf("failed to copy default ini file from '%s' to '%s': %w, stderr: %s", ini, iniDefault, err, stderr)
	}

	return true, nil
}

// NewPhpManager creates and returns a new instance of PhpManager.
func NewPhpManager() *PhpManager {
	return &PhpManager{
		BaseManager: BaseManager{}, // Initialize the BaseManager instance
	}
}
