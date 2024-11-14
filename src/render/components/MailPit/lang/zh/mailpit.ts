export default {
  MP_DATABASE:
    '指定存储持久数据的本地数据库文件名。默认是本地临时文件，当 Mailpit 退出时会自动删除。您可以选择通过指定“http 地址”来使用远程 rqlite 数据库（请参阅文档）。',
  MP_LABEL: '设置可选标签来标识此 Mailpit 实例。这会将标签添加到 Web UI、SMTP 和 POP3 服务器。',
  MP_TENANT_ID:
    '设置租户ID（表前缀）。这用于将数据与共享同一数据文件的其他 Mailpit 实例隔离（请参阅文档）。',
  MP_MAX_MESSAGES:
    '要存储的最大消息数。如果大于此值，Mailpit 将定期删除最旧的邮件。设置为 0 以禁用自动删除（请参阅文档）。',
  MP_MAX_AGE:
    '消息存储的最长期限（小时）或（天）。如果大于此值，Mailpit 将定期删除最旧的邮件。该值必须以小时为单位（例如：--max-age 36h）或天（例如：--max-age 14d）（请参阅文档）。',
  MP_USE_MESSAGE_DATES: '使用邮件标头日期作为 Mailpit 接收日期和时间，而不是 SMTP 接收日期和时间。',
  MP_IGNORE_DUPLICATE_IDS: '根据消息 ID 忽略重复消息。',
  MP_LOG_FILE: '将 Mailpit 输出记录到文件而不是标准输出。例如： --log-file /path/to/logfile.log',
  MP_QUIET: '安静记录（仅错误）',
  MP_VERBOSE: '详细日志记录（调试）',
  MP_UI_BIND_ADDR: 'UI 的 HTTP 绑定接口和端口。',
  MP_WEBROOT: '设置 Web UI 和 API 的 Webroot，例如邮件将生成 http://0.0.0.0:8025/mail/。',
  MP_UI_AUTH_FILE: '指定 Web UI 和 API 基本身份验证的密码文件（请参阅文档）。',
  MP_UI_TLS_CERT:
    'Web UI 和 API 的 TLS 证书（即：HTTPS）。此选项需要设置 --ui-tls-key 参数或 MP_UI_TLS_KEY 环境变量。',
  MP_UI_TLS_KEY:
    'Web UI 和 API 的 TLS 密钥（即：HTTPS）。此选项需要设置 --ui-tls-cert 参数或 MP_UI_TLS_CERT 环境变量。',
  MP_API_CORS: '如果需要跨域浏览器请求，请设置 API CORS Access-Control-Allow-Origin 标头。',
  MP_BLOCK_REMOTE_CSS_AND_FONTS:
    '阻止所有浏览器访问通过消息样式表导入的远程 CSS 和字体。 Mailpit 使用 HTTP 内容安全策略 (CSP) 方法来阻止这些内容。这不会阻止远程图像或单击外部链接。',
  MP_ENABLE_SPAMASSASSIN: '启用 SpamAssassin 集成以获取垃圾邮件评分（请参阅文档）。',
  MP_ALLOW_UNTRUSTED_TLS: '不验证链接检查器和屏幕截图生成的 HTTPS 证书。',
  MP_SMTP_BIND_ADDR: 'SMTP 绑定接口和端口。',
  MP_SMTP_AUTH_FILE: '指定 SMTP 身份验证的密码文件（请参阅文档）。',
  MP_SMTP_AUTH_ACCEPT_ANY: '接受任何 SMTP 用户名和密码，包括无。使用它基本上可以允许任何事情。',
  MP_SMTP_TLS_CERT:
    'SMTP STARTTLS 的 TLS 证书。此选项需要设置 --smtp-tls-key 参数或 MP_SMTP_TLS_KEY 环境变量。',
  MP_SMTP_TLS_KEY:
    'SMTP STARTTLS 的 TLS 密钥。此选项需要设置 --smtp-tls-cert 参数或 MP_SMTP_TLS_CERT 环境变量。',
  MP_SMTP_REQUIRE_STARTTLS:
    '要求所有 SMTP 客户端使用 STARTTLS 加密。如果设置为 true，则在连接升级到 STARTTLS 之前，唯一允许的命令是 NOOP、EHLO、STARTTLS 和 QUIT（如 RFC 4954 中指定）。',
  MP_SMTP_REQUIRE_TLS:
    '要求所有 SMTP 客户端使用 SSL/TLS 加密。如果设置为 true，则所有与 SMTP 服务器的连接都必须通过 TLS 进行处理。这与 STARTTLS 不同，STARTTLS 要求初始连接未加密。请注意，此选项会禁用 STARTTLS，并可能会降低客户端兼容性。',
  MP_SMTP_AUTH_ALLOW_INSECURE:
    '通常，对于所有 SMTP 身份验证都强制执行 STARTTLS 或 TLS。使用 STARTTLS 时，此选项允许不安全的 PLAIN 和 LOGIN SMTP 身份验证。',
  MP_SMTP_STRICT_RFC_HEADERS:
    '如果邮件标头包含 \\n 而不是 \\r\\n 换行符，则强制 Mailpit 返回 SMTP 错误。默认情况下，Mailpit 会默默地修复由某些损坏的 sendmail 客户端生成的错误换行符（请参阅相关的 Github 问题）。',
  MP_SMTP_MAX_RECIPIENTS: '每封邮件允许的 SMTP 收件人最大数量。',
  MP_SMTP_ALLOWED_RECIPIENTS: `仅允许与正则表达式匹配的 SMTP 收件人。使用此选项可将传入邮件限制为仅发送到预定义列表的邮件。例如 --smtp-allowed-recipients '{'@'}example.com$' 仅允许将电子邮件发送给以 {'@'}example.com 结尾的收件人。`,
  MP_SMTP_DISABLE_RDNS:
    '禁用 SMTP 反向 DNS 查找。默认情况下，SMTP 将尝试解析连接客户端的 IP 地址的主机名，但在测试网络中，这有时可能会出现问题，导致每条消息传送延迟。',
  MP_SMTP_RELAY_CONFIG:
    '用于启用消息中继/发布的 SMTP 配置文件（请参阅文档）。或者，整个配置可以通过环境变量传递。',
  MP_SMTP_RELAY_ALL: '通过外部 SMTP 服务器自动中继所有传入消息（请参阅文档）。使用时要格外小心！',
  MP_SMTP_RELAY_MATCHING:
    '通过外部 SMTP 服务器自动将一些传入消息转发给匹配的收件人（请参阅文档）。',
  MP_POP3_BIND_ADDR: 'POP3服务器绑定接口和端口。',
  MP_POP3_AUTH_FILE: '指定 POP3 身份验证的密码文件（请参阅文档）。',
  MP_POP3_TLS_CERT:
    'POP3 SSL/TLS 的 TLS 证书。此选项需要设置 --pop3-tls-key 参数或 MP_POP3_TLS_KEY 环境变量。',
  MP_POP3_TLS_KEY:
    'POP3 SSL/TLS 的 TLS 密钥。此选项需要设置 --pop3-tls-cert 参数或 MP_POP3_TLS_CERT 环境变量。',
  MP_TAG: '自动标记与过滤器匹配的新消息（请参阅文档）。',
  MP_TAGS_CONFIG: '从 yaml 配置文件加载标签过滤器（请参阅文档）。',
  MP_TAGS_TITLE_CASE: '对所有新创建的标签强制使用 TitleCasing（请参阅文档）。',
  MP_TAGS_DISABLE: '禁用特定的自动标记。此选项采用逗号分隔的选项列表（请参阅文档）。',
  MP_WEBHOOK_URL:
    '收到新消息时调用 webhook（请参阅文档），例如：--webhook-url https://example.com/webhook.php。',
  MP_WEBHOOK_LIMIT:
    '每秒的 Webhook 请求速率受到限制。为了防止 Webhook 服务器可能过载，默认情况下将速率限制为每秒最多 1 个请求（请参阅文档）。'
}
