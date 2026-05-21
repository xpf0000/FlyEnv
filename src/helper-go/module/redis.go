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
	if err := utils.ValidatePathForWrite(logFile); err != nil {
		return false, fmt.Errorf("path not allowed: %s: %w", logFile, err)
	}
	if err := utils.ValidateChownUser(user); err != nil {
		return false, err
	}
	if utils.ExistsSync(logFile) {
		fmt.Printf("redis logFileFixed: chown %s %s\n", user, logFile)

		_, stderr, err := utils.ExecCommand("chown", []string{user, logFile}, nil)
		if err != nil {
			fmt.Printf("Warning: failed to chown '%s' to '%s': %v, stderr: %s\n", logFile, user, err, stderr)
		}
	}
	return true, nil
}

// NewRedisManager creates and returns a new instance of RedisManager.
func NewRedisManager() *RedisManager {
	return &RedisManager{
		BaseManager: BaseManager{}, // Initialize the BaseManager instance
	}
}
