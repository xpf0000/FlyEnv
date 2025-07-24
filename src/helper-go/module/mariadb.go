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
	// Equivalent to JS: await execPromise(`mkdir -p ${enDir}`)
	_, stderr, err := utils.ExecPromise(fmt.Sprintf(`mkdir -p "%s"`, enDir), nil)
	if err != nil {
		// JS had an empty catch, but in Go, it's good practice to at least log.
		return false, fmt.Errorf("failed to create directory '%s': %w, stderr: %s", enDir, err, stderr)
	}

	// Equivalent to JS: await execPromise(`cp -R ${shareDir} ${enDir}`)
	_, stderr, err = utils.ExecPromise(fmt.Sprintf(`cp -R "%s" "%s"`, shareDir, enDir), nil)
	if err != nil {
		// Log the error for cp, but since JS always resolved true, we might return true
		// or, for better Go practice, return the error. Let's return the error as it indicates a failure.
		return false, fmt.Errorf("failed to copy shared directory '%s' to '%s': %w, stderr: %s", shareDir, enDir, err, stderr)
	}

	// If all commands executed without critical errors, return true
	return true, nil
}

// NewMariadbManager creates and returns a new instance of MariadbManager.
func NewMariadbManager() *MariadbManager {
	return &MariadbManager{
		BaseManager: BaseManager{}, // Initialize the BaseManager instance
	}
}
