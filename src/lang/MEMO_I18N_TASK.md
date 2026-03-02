# I18N 翻译补充任务 - 执行备忘录

## 任务概述
补充多语言翻译文件中缺失的 key，以中文(zh)和英文(en)为参考，为其他所有语言添加对应的翻译。

## 常见陷阱与解决方案

### 1. JSON 格式错误（最严重）

#### 问题
- 添加新 key 时容易遗漏逗号 `,`
- 最后一个 key 后面不应该有逗号，但倒数第二个必须有
- 换行符（`\n` vs `\r\n`）可能导致解析问题

#### 正确做法
```json
{
  "existingKey": "value",
  "newKey": "new value"
}
```

#### 错误示例
```json
{
  "existingKey": "value"
  "newKey": "new value"    // 错误：缺少逗号
}
```

```json
{
  "existingKey": "value",
  "newKey": "new value",   // 错误：最后一个key后面有逗号
}
```

### 2. PowerShell 转义问题

#### 问题
- PowerShell 中 `{}` 会被解析为代码块
- 正则表达式特殊字符需要转义
- `"` 和 `'` 的使用要非常小心

#### 避免在 PowerShell 中直接使用
❌ 不要这样做：
```powershell
-replace '("dbclickRowToEdit":\s*".+?")'
```

✅ 改用 Python 脚本：
```python
import json
# 使用 Python 处理字符串和正则
```

### 3. 推荐的执行流程

#### 步骤 1: 分析缺失的 key
```bash
node src/lang/check.mjs
```

#### 步骤 2: 准备翻译映射表
创建 Python 字典，包含所有语言的翻译：
```python
translations = {
    'ar': {'key': '翻译'},
    'de': {'key': 'Übersetzung'},
    # ...
}
```

#### 步骤 3: 使用 Python 脚本统一处理
不要逐个文件手动修改，使用脚本：

```python
import json
import os

langs = ['ar', 'az', 'bn', 'cs', 'da', 'de', 'el', 'es', 'fi', 'fr', 
         'id', 'it', 'ja', 'nl', 'no', 'pl', 'pt', 'pt-br', 'ro', 
         'ru', 'sv', 'tr', 'uk', 'vi']

for lang in langs:
    filepath = f'src/lang/{lang}/filename.json'
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # 添加新 key
    data['newKey'] = translations[lang]['key']
    
    # 写回文件（Python 会自动处理格式）
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
```

#### 步骤 4: 验证
```bash
node src/lang/check.mjs
```

### 4. 子代理使用注意事项

当使用子代理(Task工具)并行处理时：

1. **明确指定输出格式**: 要求子代理使用 Python 的 `json.dump()` 而不是手动拼接字符串
2. **验证每个结果**: 子代理完成后，立即验证 JSON 是否有效
3. **避免并行修改同一文件**: 如果多个子代理修改同一文件的不同部分，可能产生冲突

### 5. 翻译质量建议

- 保持术语一致性（参考该语言已有的翻译风格）
- 保留原始格式占位符（如 `{error}`、`{ip}` 等）
- HTML 标签（如 `<p>`）通常不需要翻译

### 6. 快速修复 JSON 错误的工具脚本

如果 JSON 已损坏，使用这个脚本重新生成：

```python
import json

# 读取原始文件（即使损坏也尝试解析）
def fix_json_file(filepath, default_structure):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except json.JSONDecodeError:
        # 如果无法解析，使用默认结构
        data = default_structure
    
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f'Fixed: {filepath}')
```

## 任务检查清单

- [ ] 运行 `check.mjs` 确认缺失的 key
- [ ] 准备完整的翻译映射表
- [ ] 使用 Python 脚本批量处理（不要用 PowerShell 正则）
- [ ] 验证每个修改后的 JSON 文件
- [ ] 再次运行 `check.mjs` 确认无差异
- [ ] 清理临时文件

## 教训总结

1. **永远不要手动编辑 JSON 字符串**：使用 `json.dump()`
2. **不要在 PowerShell 中处理复杂字符串转义**：使用 Python
3. **先验证一个文件**：批量处理前先确保方法对单个文件有效
4. **保留备份**：修改前备份原始文件

---
*创建于: 2026-03-02*
*最后更新: 2026-03-02*
