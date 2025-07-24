package module

import (
	"fmt"
	"helper-go/utils" // Import your utils package
)

// RabbitmqManager embeds BaseManager, providing RabbitMQ-specific functionalities.
type RabbitmqManager struct {
	BaseManager // Anonymous field for composition and method "inheritance"
}

// InitPlugin initializes RabbitMQ plugins, specifically enabling rabbitmq_management.
func (r *RabbitmqManager) InitPlugin(cwd string) (bool, error) {
	command := `./rabbitmq-plugins enable rabbitmq_management`
	options := map[string]interface{}{
		"cwd": cwd, // Pass the cwd option
	}

	_, stderr, err := utils.ExecPromise(command, options)
	if err != nil {
		// Equivalent to JS reject(e)
		return false, fmt.Errorf("failed to enable rabbitmq_management plugin: %w, stderr: %s", err, stderr)
	}

	// Equivalent to JS resolve(true)
	return true, nil
}

// NewRabbitmqManager creates and returns a new instance of RabbitmqManager.
func NewRabbitmqManager() *RabbitmqManager {
	return &RabbitmqManager{
		BaseManager: BaseManager{}, // Initialize the BaseManager instance
	}
}
