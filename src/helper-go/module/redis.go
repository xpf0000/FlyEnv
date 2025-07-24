package module

import (
	"fmt"
	"helper-go/utils" // Import your utils package
)

// RedisManager embeds BaseManager, providing Redis-specific functionalities.
type RedisManager struct {
	BaseManager // Anonymous field for composition and method "inheritance"
}

// LogFileFixed checks if a log file exists and attempts to change its ownership.
func (r *RedisManager) LogFileFixed(logFile, user string) (bool, error) {
	if utils.ExistsSync(logFile) {
		fmt.Printf("redis logFileFixed: chown %s %s\n", user, logFile) // Equivalent to console.log

		command := fmt.Sprintf(`chown "%s" "%s"`, user, logFile)
		_, stderr, err := utils.ExecPromise(command, nil) // No options passed in JS, so nil
		if err != nil {
			// The original JS had no 'catch' block for this await, and always resolved true.
			// In Go, it's best to at least log the error if we're not returning it to the caller
			// as a failure. We will still return true, nil to match the JS 'resolve(true)' behavior.
			fmt.Printf("Warning: failed to chown '%s' to '%s': %v, stderr: %s\n", logFile, user, err, stderr)
		}
	}
	// Equivalent to JS resolve(true) - always resolve true regardless of chown success/failure
	return true, nil
}

// NewRedisManager creates and returns a new instance of RedisManager.
func NewRedisManager() *RedisManager {
	return &RedisManager{
		BaseManager: BaseManager{}, // Initialize the BaseManager instance
	}
}
