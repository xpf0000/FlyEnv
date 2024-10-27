export default {
  Timeout: 'The number of seconds before receives and sends time out.',
  KeepAlive: 'Whether or not to allow persistent connections',
  KeepAliveTimeout:
    'Number of seconds to wait for the next request from the same client on the same connection.',
  MaxKeepAliveRequests:
    'The maximum number of requests to allow during a persistent connection.\nSet to 0 to allow an unlimited amount.\nWe recommend you leave this number high, for maximum performance.',
  LimitRequestBody: 'Byte. File upload size limit. 0: no limit'
}
