export default {
  topics: 'Topics',
  selectJava: 'Select Java',
  installCompatibleJava: 'Install compatible Java',
  selectKafkaVersionFirst: 'Select a Kafka version in the Service tab first',
  bindJavaFirst: 'Bind a Java 17+ runtime for Kafka first',
  createTopic: 'Create Topic',
  partitions: 'Partitions',
  topicNameRequired: 'Topic name is required',
  installationPathRequired: 'Kafka installation path is required',
  javaRuntimeRequired: 'A valid Java runtime is required',
  javaMajorUnsupported: 'Kafka requires Java {min}+ (bound: Java {major})',
  javaBindRequired:
    'Kafka requires a Java {min}+ runtime. Please bind a Java {min}+ runtime on the Kafka page before starting the service',
  javaBinNotFound: 'Java executable not found: {bin}',
  javaVersionTooOld: 'Kafka requires Java {min} or newer, but Java {major} was selected',
  kraftUuidFailed: 'Kafka KRaft random-uuid failed: {error}',
  kraftUuidEmpty: 'Kafka KRaft random-uuid failed: empty cluster uuid',
  kraftFormatFailed: 'Kafka KRaft storage format failed: {error}',
  invalidTopicName: 'Invalid Kafka topic name: {topic}',
  invalidTopicPartitions: 'Invalid Kafka topic partitions: {partitions} (must be 1-100)',
  brokerUnavailable:
    'Cannot connect to the Kafka broker at {server}. Please start the Kafka service first.'
}
