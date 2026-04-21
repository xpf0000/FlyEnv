# src/render/components/Hermes/SkillsInstalled.vue 优化

1. 技能名称 点击 在文件夹中显示对应的文件
文件路径规则: ~/.hermes/skills/{分类}/{技能名称}/SKILL.md
2. 分类名称 点击 打开分类文件夹
分类文件夹路径规则: ~/.hermes/skills/{分类}
3. 操作改成弹出式
参照 src/render/components/Host/ListTable.vue 里的操作栏. 改成弹出式的.
4. 操作里新增 查看 菜单.
点击弹出窗口, 展示 markdown编辑和预览. 可参考 src/render/components/Tools/MarkdownPreview/index.vue
5. 技能相关的IPC, 传递对象的话, 需要 JSON 深拷贝下. 否则因为VUE的关系,会报错


