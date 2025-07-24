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
	var err error
	var stderr string

	// Equivalent to JS: await execPromise(`mkdir -p "${enDir}"`)
	_, stderr, err = utils.ExecPromise(fmt.Sprintf(`mkdir -p "%s"`, enDir), nil)
	if err != nil {
		return false, fmt.Errorf("failed to create directory '%s': %w, stderr: %s", enDir, err, stderr)
	}

	// Equivalent to JS: await execPromise(`cp -R "${shareDir}/*" "${enDir}"`)
	// Note: cp -R "source/*" may not work as expected in all shells/environments
	// it's generally safer to copy the directory itself or iterate files.
	// However, mimicking JS directly:
	_, stderr, err = utils.ExecPromise(fmt.Sprintf(`cp -R "%s" "%s"`, shareDir, enDir), nil)
	if err != nil {
		return false, fmt.Errorf("failed to copy shared directory contents from '%s' to '%s': %w, stderr: %s", shareDir, enDir, err, stderr)
	}

	// Equivalent to JS: await execPromise(`mkdir -p "${langDir}"`)
	_, stderr, err = utils.ExecPromise(fmt.Sprintf(`mkdir -p "%s"`, langDir), nil)
	if err != nil {
		return false, fmt.Errorf("failed to create directory '%s': %w, stderr: %s", langDir, err, stderr)
	}

	// Equivalent to JS: await execPromise(`cp -R "${langEnDir}" "${langDir}"`)
	_, stderr, err = utils.ExecPromise(fmt.Sprintf(`cp -R "%s" "%s"`, langEnDir, langDir), nil)
	if err != nil {
		return false, fmt.Errorf("failed to copy language directory from '%s' to '%s': %w, stderr: %s", langEnDir, langDir, err, stderr)
	}

	// If all commands executed without critical errors, return true
	return true, nil
}

// NewMysqlManager creates and returns a new instance of MysqlManager.
func NewMysqlManager() *MysqlManager {
	return &MysqlManager{
		BaseManager: BaseManager{}, // Initialize the BaseManager instance
	}
}
