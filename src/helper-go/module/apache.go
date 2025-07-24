package module

// ApacheManager 嵌入了 BaseManager，实现了类似 JavaScript 中 extends 的效果
type ApacheManager struct {
	BaseManager // 匿名字段，实现组合和方法继承
}

// NewApacheManager 创建并返回 ApacheManager 的新实例
func NewApacheManager() *ApacheManager {
	return &ApacheManager{
		BaseManager: BaseManager{}, // 初始化 BaseManager 实例
	}
}
