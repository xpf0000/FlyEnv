export default {
  noBrewTips: 'Đã phát hiện thấy bạn chưa cài đặt Brew, bạn có muốn cài đặt ngay bây giờ không?',
  brewInstallFail: 'Cài đặt Brew thất bại',
  userNoInstall: 'Người dùng hủy cài đặt',
  clean: 'Dọn dẹp',
  ok: 'OK',
  versionNoFound: 'Không lấy được phiên bản phần mềm, thao tác thất bại.',
  setup: 'Cài đặt',
  savePath: 'Thư mục lưu',
  saveAs: 'Lưu trang web: Thư mục lưu/Tên miền trang web',
  proxy: 'Proxy',
  pageLimit: 'Giới hạn trang',
  pageLimitTips: 'Địa chỉ trang giới hạn phải chứa chuỗi ở đây',
  LinkExclusion: 'Loại trừ tên miền',
  LinkExclusionTips: 'Lọc các URL chứa tên miền này, mỗi tên miền một dòng.',
  timeout: 'Thời gian chờ',
  timeoutTips: 'Mặc định 5000, thời gian chờ 5 giây',
  maxImgSize: 'Giới hạn kích thước tệp hình ảnh',
  maxVideoSize: 'Giới hạn kích thước tệp âm thanh/video',
  count: 'Số lượng: ',
  ftpTableHeadUser: 'Tên người dùng',
  ftpTableHeadPass: 'Mật khẩu',
  ftpTableHeadDir: 'Thư mục gốc',
  ftpTableHeadSetup: 'Cài đặt',
  theme: 'Chủ đề',
  fontSize: 'Cỡ chữ',
  lineHeight: 'Chiều cao dòng',
  forceStart: 'Buộc khởi động dịch vụ',
  forceStartInfo: 'Có hay không việc buộc tắt các dịch vụ không được khởi động bởi ứng dụng này khi dịch vụ được khởi động. Cố gắng đảm bảo rằng dịch vụ có thể được bật đúng cách.',
  showAIRobot: 'Hiển thị trợ lý AI',

  mysqlVersion: 'Phiên bản',
  mysqlDir: 'Thư mục',
  mysqlPort: 'Cổng',
  mysqlDataDir: 'Thư mục dữ liệu',
  mysqlState: 'Trạng thái',

  mysqlPopperSocket: 'Sao chép đường dẫn Socket',

  brewDefault: 'Mặc định',
  brewTsinghua: 'Tsinghua',
  brewBfsu: 'Bfsu',
  brewTencent: 'Tencent',
  brewAliyun: 'Aliyun',
  brewUstc: 'Ustc',

  macPortsSrcSwitch: 'Chuyển đổi nguồn phản chiếu MacPorts',

  macPortsSrcDefault: 'Mặc định',
  macPortsSrcAustraliBrisbane: 'Úc, Brisbane',
  macPortsSrcCanadaManitoba: 'Canada, Manitoba',
  macPortsSrcCanadaWaterloo: 'Canada, Waterloo',
  macPortsSrcChinaBeijing: 'Trung Quốc, Bắc Kinh',
  macPortsSrcDenmarkCopenhagen: 'Đan Mạch, Copenhagen',
  macPortsSrcGermanyErlangen: 'Đức, Erlangen',
  macPortsSrcGermanyLimburg: 'Đức, Limburg',
  macPortsSrcIndonesiaYogyakarta: 'Indonesia, Yogyakarta',
  macPortsSrcJapanNomiIshikawa: 'Nhật Bản, Nomi, Ishikawa',
  macPortsSrcSouthAfricaJohannesburg: 'Nam Phi, Johannesburg',
  macPortsSrcSouthKoreaDaejeon: 'Hàn Quốc, Daejeon',
  macPortsSrcUnitedKingdomCanterbury: 'Vương quốc Anh, Canterbury',
  macPortsSrcUnitedStatesGeorgia: 'Hoa Kỳ, Georgia',

  nodeToolInstall: 'Cài đặt trình quản lý phiên bản NodeJS',
  nodeToolChoose: 'Trình quản lý',
  nodeToolInstallBy: 'Cài đặt',
  nodeToolShell: 'Chính thức',
  nodeToolInstallBtn: 'Cài đặt',
  nodeListCellCurrent: 'Hiện tại',
  nodeListCellInstalled: 'Trạng thái',

  toolSystemEnv: 'Môi trường hệ thống',
  toolSSL: 'Tạo SSL',
  toolFileInfo: 'Thông tin tệp',
  toolTimestamp: 'Dấu thời gian',
  toolDecode: 'Giải mã/Mã hóa',
  toolPortKill: 'Kết thúc cổng',
  toolProcessKill: 'Kết thúc tiến trình',
  toolPhpObfuscator: 'Làm rối mã Php',
  toolUTF8BomClean: 'Xóa UTF8-BOM',
  toolSiteSucker: 'Site Sucker', // Kept English name

  toolFileNotExist: 'Tệp không tồn tại',
  toolFileTooMore: 'Không thể lấy tệp, vui lòng không dọn dẹp quá nhiều tệp cùng một lúc.',
  toolSaveConfim: 'Bạn có chắc chắn muốn lưu nó không?',

  auto: 'Tự động',

  edit: {
    vsLight: 'Vs Sáng',
    vsDark: 'Vs Tối',
    hcLight: 'Hc Sáng',
    hcBlack: 'Hc Tối'
  },

  noVerionsFoundInLib: 'Không có phiên bản khả dụng',

  noLibFound:
    'Không tìm thấy <a href="javascript:void();" onclick="openUrl(\'https://brew.sh/\')">Homebrew</a> hoặc ' +
    '<a href="javascript:void();" onclick="openUrl(\'https://www.macports.org/\')">Macports</a>, quản lý phiên bản không khả dụng.\n' +
    'Cài đặt Macports, bạn có thể nhấp vào liên kết này\n' +
    '<a href="javascript:void();" onclick="openUrl(\'https://www.macports.org/install.php\')">https://www.macports.org/install.php</a>\n' +
    'Làm theo tài liệu để cài đặt.\n' +
    'Cài đặt Homebrew, bạn có thể nhấp vào liên kết này\n' +
    '<a href="javascript:void();" onclick="openUrl(\'https://www.macphpstudy.com/guide/getting-started.html#macos-1\')">https://www.macphpstudy.com/guide/getting-started.html#macos-1</a>\n' + // Keeping original link, assuming it has Vietnamese instructions
    'Làm theo tài liệu để cài đặt.',

  showToolBtn: 'Hiển thị nút công cụ nổi'
}
