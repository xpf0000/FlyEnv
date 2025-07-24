package module

import (
	"fmt"
	"helper-go/utils" // Import your utils package
	"strings"         // Required for strings.Join
)

// CaddyManager embeds BaseManager, achieving a similar effect to JavaScript's extends.
type CaddyManager struct {
	BaseManager // Anonymous field for composition and method "inheritance"
}

// SslDirFixed checks and potentially fixes SSL directory permissions.
func (c *CaddyManager) SslDirFixed(sslDir string) bool {
	// Go typically returns results and errors directly, rather than Promises.
	// This simulates the synchronous behavior of your JavaScript async/await.

	if utils.ExistsSync(sslDir) {
		// In Go, error handling is explicit and important.
		stdout, _, err := utils.ExecPromise(strings.Join([]string{"ls", "-al", sslDir}, " "), nil)
		if err != nil {
			// Log the error but continue, similar to your empty JS catch block.
			// Depending on your needs, you might want to return false or an actual error here.
			fmt.Printf("Error checking SSL directory '%s': %v\n", sslDir, err)
			return true // Assuming we still want to "resolve true" even on error
		}

		if strings.Contains(stdout, " root ") {
			// Again, always check errors from ExecPromise.
			_, _, err := utils.ExecPromise(strings.Join([]string{"rm", "-rf", sslDir}, " "), nil)
			if err != nil {
				// Log the error, but the JS logic resolves true regardless.
				fmt.Printf("Error removing SSL directory '%s': %v\n", sslDir, err)
			}
		}
	}
	return true // Corresponds to the JavaScript's resolve(true)
}

// NewCaddyManager creates and returns a new instance of CaddyManager.
func NewCaddyManager() *CaddyManager {
	return &CaddyManager{
		BaseManager: BaseManager{}, // Initialize the BaseManager instance
	}
}
