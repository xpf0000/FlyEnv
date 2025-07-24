package module

// NginxManager 嵌入了 BaseManager，实现了类似 JavaScript 中 extends 的效果
type NginxManager struct {
	BaseManager // 匿名字段，实现组合和方法继承
}

// NewNginxManager 创建并返回 NginxManager 的新实例
func NewNginxManager() *NginxManager {
	return &NginxManager{
		BaseManager: BaseManager{}, // 初始化 BaseManager 实例
	}
}
