export default {
  startInstall: 'Bắt đầu cài đặt {service}',
  startDown: `Bắt đầu tải xuống {service}, Liên kết tải xuống: {url}`,
  downSuccess: 'Tải xuống hoàn tất, cài đặt {service}',
  downFail: 'Tải xuống thất bại, cài đặt {service} không thành công',
  installSuccess: 'Cài đặt {service} thành công, vị trí cài đặt: {appDir}',
  installFail: 'Cài đặt {service} không thành công, lý do: {error}',
  installFromZip: 'Gói cài đặt đã tồn tại, cài đặt {service}',
  installFromZipFail: 'Cài đặt thất bại, tải xuống lại gói cài đặt để cài đặt',

  startServiceBegin: 'Bắt đầu dịch vụ {service}...',
  serviceUseBundle: 'Đã sử dụng phiên bản tích hợp, Bắt đầu giải nén và cài đặt {service}',
  bundleUnzipSuccess: 'Giải nén cài đặt hoàn tất, vị trí cài đặt: {appDir}',
  bundleUnzipFail: 'Giải nén cài đặt không thành công, lý do: {error}',
  confInit: 'Tệp cấu hình không tồn tại, tạo tệp cấu hình',
  confInitSuccess: 'Tạo tệp cấu hình thành công, đường dẫn tệp: {file}',
  confInitFail: 'Tạo tệp cấu hình không thành công, lý do: {error}',
  apachePortHandleBegin: 'Bắt đầu lấy tất cả các cổng nghe Apache từ trang web',
  apachePortHandleEnd: 'Hoàn tất lấy cổng nghe Apache, ghi tệp cấu hình thành công',
  execStartCommand: 'Bắt đầu thực thi lệnh khởi động',
  execStartCommandSuccess: 'Thực thi lệnh khởi động thành công, bắt đầu kiểm tra xem khởi động có thành công không',
  execStartCommandFail: 'Thực thi lệnh khởi động không thành công, lý do: {error}, dịch vụ {service} không khởi động được',
  startServiceSuccess: 'Dịch vụ {service} khởi động thành công, pid: {pid}',
  startServiceFail: 'Dịch vụ {service} không khởi động được, lý do: {error}',

  stopServiceBegin: 'Bắt đầu dừng dịch vụ {service}',
  stopServiceEnd: 'Dịch vụ {service} đã dừng thành công',

  initDBPass: 'Bắt đầu khởi tạo mật khẩu cơ sở dữ liệu',
  initDBPassSuccess: 'Khởi tạo mật khẩu cơ sở dữ liệu thành công, mật khẩu tài khoản: {user} {pass}',
  initDBPassFail: 'Không thể khởi tạo mật khẩu cơ sở dữ liệu, lý do: {error}',
  initDBDataDir: 'Không tìm thấy thư mục dữ liệu, bắt đầu khởi tạo thư mục dữ liệu',
  initDBDataDirSuccess: 'Khởi tạo thư mục dữ liệu thành công, đường dẫn thư mục dữ liệu: {dir}',
  initDBDataDirFail: 'Khởi tạo thư mục dữ liệu không thành công, lý do: {error}',

  initPlugin: 'Bắt đầu khởi tạo plugin và thực thi lệnh: {command}',
  initPluginSuccess: 'Khởi tạo plugin thành công',
  initPluginFail: 'Khởi tạo plugin không thành công, lý do: {error}',

  erlangEnvInit: 'Thử khởi tạo môi trường thời gian chạy Erlang',
  erlangEnvInitEnd: 'Hoàn tất khởi tạo môi trường thời gian chạy Erlang',

  newProjectBegin: 'Bắt đầu một dự án mới và thực thi lệnh: {command}',
  newProjectSuccess: 'Dự án mới đã được tạo thành công, đường dẫn dự án: {dir}',
  newProjectFail: 'Không thể tạo dự án mới'
}
