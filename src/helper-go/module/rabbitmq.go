package module

import (
	"fmt"
	"helper-go/utils" // Import your utils package
	"path/filepath"
)

// RabbitmqManager embeds BaseManager, providing RabbitMQ-specific functionalities.
type RabbitmqManager struct {
	BaseManager // Anonymous field for composition and method "inheritance"
}

// InitPlugin initializes RabbitMQ plugins, specifically enabling rabbitmq_management.
func (r *RabbitmqManager) InitPlugin(cwd string) (bool, error) {
	if err := utils.ValidateRabbitMQPluginDir(cwd); err != nil {
		return false, fmt.Errorf("path not allowed: %s: %w", cwd, err)
	}
	binPath := filepath.Join(cwd, "rabbitmq-plugins")
	_, stderr, err := utils.ExecCommand(binPath, []string{"enable", "rabbitmq_management"}, map[string]interface{}{
		"cwd": cwd,
	})
	if err != nil {
		return false, fmt.Errorf("failed to enable rabbitmq_management plugin: %w, stderr: %s", err, stderr)
	}

	return true, nil
}

// NewRabbitmqManager creates and returns a new instance of RabbitmqManager.
func NewRabbitmqManager() *RabbitmqManager {
	return &RabbitmqManager{
		BaseManager: BaseManager{}, // Initialize the BaseManager instance
	}
}
