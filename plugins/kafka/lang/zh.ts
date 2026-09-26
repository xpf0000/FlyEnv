export default {
  topics: '主题',
  selectJava: '选择 Java',
  installCompatibleJava: '安装兼容的 Java',
  selectKafkaVersionFirst: '请先在服务页面选择 Kafka 版本',
  bindJavaFirst: '请先为 Kafka 绑定 Java 17+ 运行时',
  createTopic: '创建 Topic',
  partitions: '分区数',
  topicNameRequired: '请输入 Topic 名称',
  installationPathRequired: '缺少 Kafka 安装路径',
  javaRuntimeRequired: '需要有效的 Java 运行时',
  javaMajorUnsupported: 'Kafka 需要 Java {min}+（当前绑定：Java {major}）',
  javaBindRequired:
    'Kafka 需要 Java {min}+ 运行时，请先在 Kafka 页面绑定 Java {min}+ 运行时再启动服务',
  javaBinNotFound: '未找到 Java 可执行文件：{bin}',
  javaVersionTooOld: 'Kafka 需要 Java {min} 或更高版本，当前选择的是 Java {major}',
  kraftUuidFailed: 'Kafka KRaft random-uuid 执行失败：{error}',
  kraftUuidEmpty: 'Kafka KRaft random-uuid 执行失败：集群 uuid 为空',
  kraftFormatFailed: 'Kafka KRaft storage format 执行失败：{error}',
  invalidTopicName: '无效的 Topic 名称：{topic}',
  invalidTopicPartitions: '无效的分区数：{partitions}（必须为 1-100）',
  brokerUnavailable: '无法连接到 Kafka 服务（{server}），请先启动 Kafka 服务'
}
