## Cấu hình

Thiết lập cấu hình toàn cục

```shell
git config --global user.name "[tên]"
git config --global user.email "[email]"
```

## Bắt đầu

Tạo một kho lưu trữ git mới

```shell
git init
```

Sao chép một kho lưu trữ git hiện có

```shell
git clone [url]
```

## Nhánh (Branching)

Quản lý các luồng phát triển.

- **Liệt kê danh sách nhánh**:
  ```shell
  git branch
  ```
- **Tạo nhánh mới**:
  ```shell
  git branch [tên-nhánh]
  ```
- **Chuyển nhánh**:
  ```shell
  git checkout [tên-nhánh]
  # Hoặc dùng 'switch' (Git 2.23+):
  git switch [tên-nhánh]
  ```
- **Tạo và chuyển sang nhánh mới ngay lập tức**:
  ```shell
  git checkout -b [tên-nhánh]
  # Hoặc dùng 'switch':
  git switch -c [tên-nhánh]
  ```
- **Gộp nhánh** (vào nhánh hiện tại):
  ```shell
  git merge [tên-nhánh]
  ```
- **Xóa nhánh**:
  ```shell
  git branch -d [tên-nhánh]
  ```

## Kiểm tra & So sánh

Xem trạng thái và lịch sử.

- **Kiểm tra trạng thái**:
  ```shell
  git status
  ```
- **Xem lịch sử commit**:
  ```shell
  git log --oneline --graph --decorate --all
  ```
- **Xem các thay đổi chưa commit**:
  ```shell
  git diff
  ```

## Tạm lưu (Stash)

Lưu trữ tạm thời các thay đổi chưa commit.

- **Lưu các thay đổi vào stash**:
  ```shell
  git stash push -m "tin nhắn"
  ```
- **Liệt kê danh sách stash**:
  ```shell
  git stash list
  ```
- **Áp dụng stash và giữ lại trong danh sách**:
  ```shell
  git stash apply stash@{n}
  ```
- **Áp dụng stash và xóa khỏi danh sách**:
  ```shell
  git stash pop
  ```
- **Xóa một stash cụ thể**:
  ```shell
  git stash drop stash@{n}
  ```

## Commit

Commit tất cả các thay đổi đã theo dõi

```shell
git commit -am "[tin nhắn commit]"
```

Thêm các sửa đổi mới vào commit cuối cùng

```shell
git commit --amend --no-edit
```

## Tôi đã mắc lỗi

Thay đổi tin nhắn của commit cuối cùng

```shell
git commit --amend
```

Hoàn tác commit gần nhất và giữ lại các thay đổi

```shell
git reset HEAD~1
```

Hoàn tác `N` commit gần nhất và giữ lại các thay đổi

```shell
git reset HEAD~N
```

Hoàn tác commit gần nhất và loại bỏ hoàn toàn các thay đổi

```shell
git reset HEAD~1 --hard
```

Đặt lại nhánh về trạng thái của remote

```shell
git fetch origin
git reset --hard origin/[tên-nhánh]
```

## Các lệnh khác

Đổi tên nhánh master cục bộ thành main

```shell
git branch -m master main
```

## Git Flow

Git Flow là mô hình phân nhánh giúp tổ chức quy trình phát triển phần mềm, quản lý các bản phát hành và sửa lỗi khẩn cấp.

### Các nhánh chính

- **`master` (hoặc `main`)**: Lưu trữ lịch sử các bản phát hành chính thức. Nhánh này luôn phải ở trạng thái ổn định để sẵn sàng triển khai.
- **`develop`**: Nhánh tích hợp chính. Chứa các mã nguồn mới nhất chuẩn bị cho bản phát hành tiếp theo.

### Các nhánh hỗ trợ

- **`feature/*`** (tách từ `develop`): Dùng để phát triển tính năng mới. Sau khi hoàn thành sẽ được gộp lại vào `develop`.
- **`release/*`** (tách từ `develop`): Chuẩn bị cho việc phát hành bản production mới. Dùng để sửa các lỗi nhỏ và cập nhật tài liệu trước khi gộp vào `master` và `develop`.
- **`hotfix/*`** (tách từ `master`): Dùng để sửa các lỗi nghiêm trọng phát sinh trên môi trường production. Sau đó được gộp vào cả `master` và `develop`.

### Các lệnh quan trọng

- **Tạo tính năng mới**: `git checkout -b feature/ten-tinh-nang develop`
- **Tạo bản release**: `git checkout -b release/v1.0.0 develop`
- **Sửa lỗi gấp (Hotfix)**: `git checkout -b hotfix/ten-fix master`
- **Chuẩn commit message**: `<loại>: <tiêu đề>` (VD: `feat: thêm chức năng đăng nhập`).
  - _Các loại phổ biến_: `feat` (tính năng), `fix` (sửa lỗi), `docs` (tài liệu), `refactor` (tối ưu mã), `chore` (cấu hình hệ thống).

### Hợp tác & Quy tắc tốt nhất

- **Git Fetch và Pull**: Dùng `git fetch` để xem các thay đổi từ remote mà không ảnh hưởng đến code local. Dùng `git pull` để lấy về và gộp ngay vào nhánh hiện tại.
- **Quy trình Tích hợp**: Trước khi đẩy (push) tính năng, hãy gộp `develop` vào nhánh feature để xử lý xung đột tại máy cá nhân:

```shell
git checkout feature/ten-tinh-nang
git merge develop
```

- **Đẩy code (Push) an toàn**: Tránh dùng `git push --force`. Hãy dùng `git push --force-with-lease` để đảm bảo bạn không vô tình ghi đè lên công việc của đồng nghiệp khác.

### Cấu hình xuống dòng (CRLF/LF)

Xử lý vấn đề tương thích ký tự xuống dòng giữa Windows (CRLF) và Linux/macOS (LF).

#### 1. Cấu hình toàn cục (Global)

- **Người dùng Windows**:
  ```shell
  git config --global core.autocrlf true
  ```
- **Người dùng macOS/Linux**:
  ```shell
  git config --global core.autocrlf input
  ```

#### 2. Sử dụng `.gitattributes` (Tốt nhất)

Tạo file `.gitattributes` ở thư mục gốc của dự án để ép buộc quy tắc xuống dòng cho tất cả mọi người:

```text
# Tự động xử lý cho tất cả các file text
* text=auto

# Ép buộc dùng LF cho các loại file cụ thể
*.sh text eol=lf
*.js text eol=lf
```

#### 3. Làm mới/Chuẩn hóa lại (Renormalize)

Nếu dự án hiện tại đã bị lẫn lộn CRLF/LF, hãy chạy các lệnh sau để chuẩn hóa:

```shell
# 1. Lưu lại công việc (commit hoặc stash)
# 2. Xóa cache của git
git rm --cached -r .
# 3. Khôi phục lại các file theo cấu hình mới
git reset --hard
```

Hoặc dùng lệnh sau (Git 2.16+):

```shell
git add --renormalize .
```

### Git Submodules

Submodule cho phép bạn chứa một kho lưu trữ Git khác như một thư mục con trong kho lưu trữ của mình.

- **Thêm một submodule**:
  ```shell
  git submodule add [url] [đường-dẫn]
  ```
- **Khởi tạo submodule** (sau khi clone project cha):
  ```shell
  git submodule init
  git submodule update
  ```
- **Clone kèm theo tất cả submodule**:
  ```shell
  git clone --recursive [url]
  ```
- **Cập nhật tất cả submodule lên bản mới nhất**:
  ```shell
  git submodule update --remote --merge
  ```

## Quản lý Remote

Quản lý kết nối với các kho lưu trữ khác.

- **Thêm một remote**:
  ```shell
  git remote add [tên] [url]
  ```
- **Liệt kê các remote**:
  ```shell
  git remote -v
  ```
- **Thay đổi URL của remote**:
  ```shell
  git remote set-url [tên] [url]
  ```
- **Lấy thay đổi từ remote** (không gộp):
  ```shell
  git fetch [remote]
  ```
- **Lấy thay đổi và rebase các commit cục bộ**:
  ```shell
  git pull --rebase [remote] [nhánh]
  ```
- **Xóa nhánh trên remote**:
  ```shell
  git push [remote] --delete [nhánh]
  ```

## Tạm lưu nâng cao (Advanced Stash)

Kiểm soát chính xác việc lưu trữ tạm thời.

- **Tạm lưu từng phần thay đổi (tương tác)**:
  ```shell
  git stash -p
  ```
- **Tạm lưu bao gồm cả các file chưa theo dõi (untracked)**:
  ```shell
  git stash -u
  ```
- **Tạm lưu các file đã theo dõi nhưng giữ lại trong index**:
  ```shell
  git stash --keep-index
  ```
- **Tạo một nhánh mới từ một stash**:
  ```shell
  git stash branch [tên-nhánh] stash@{n}
  ```

## Rebase nâng cao

Viết lại lịch sử để có một log tuyến tính sạch sẽ.

- **Rebase tương tác (N commit cuối)**:
  ```shell
  git rebase -i HEAD~N
  ```
  _Hành động: `pick` (giữ), `reword` (sửa tin nhắn), `edit` (sửa code), `squash` (gộp lên), `fixup` (gộp lên và bỏ tin nhắn)._
- **Tự động gộp các commit được đánh dấu là fixup**:
  ```shell
  git rebase -i --autosquash [nhánh-gốc]
  ```
- **Tiếp tục rebase sau khi xử lý xung đột**:
  ```shell
  git rebase --continue
  ```
- **Hủy bỏ rebase**:
  ```shell
  git rebase --abort
  ```

## Gộp nhánh nâng cao (Advanced Merging)

Xử lý các tình huống tích hợp và xung đột phức tạp.

- **Gộp nhánh với chiến lược cụ thể**:
  ```shell
  git merge -s [chiến-lược] [nhánh]
  # Chiến lược: recursive (mặc định), resolve, octopus, ours, subtree
  ```
- **Gộp nhánh nhưng không commit (để kiểm tra kết quả)**:
  ```shell
  git merge --no-commit [nhánh]
  ```
- **Tìm điểm gốc chung (merge base)**:
  ```shell
  git merge-base [nhánh1] [nhánh2]
  ```
- **Xử lý xung đột (Conflict Resolution)**:
  1. Mở các file có dấu hiệu `<<<<<<<`, `=======`, `>>>>>>>`.
  2. Chỉnh sửa để giữ lại code mong muốn.
  3. `git add [file]` và `git commit`.

## Thẻ (Tags)

Đánh dấu các điểm cụ thể trong lịch sử (thường là các bản phát hành).

- **Liệt kê danh sách tag**:
  ```shell
  git tag
  ```
- **Tag nhẹ (Lightweight)**:
  ```shell
  git tag [tên-tag]
  ```
- **Tag có chú thích (Annotated - Khuyên dùng)**:
  ```shell
  git tag -a [tên-tag] -m "[tin nhắn]"
  ```
- **Xác minh một tag đã ký số**:
  ```shell
  git tag -v [tên-tag]
  ```
- **Đẩy các tag lên remote**:
  ```shell
  git push origin --tags
  ```

## Gỡ lỗi & Kiểm tra (Debugging)

Tìm lỗi và kiểm tra các đối tượng.

- **Xem chi tiết commit/đối tượng**:
  ```shell
  git show [mã-hash]
  ```
- **Xem ai đã thay đổi từng dòng code (blame)**:
  ```shell
  git blame [file]
  ```
- **Tìm kiếm văn bản trong các file đã theo dõi**:
  ```shell
  git grep "[văn-bản]"
  ```
- **Tìm kiếm lỗi bằng thuật toán chia đôi (bisect)**:
  ```shell
  git bisect start
  git bisect bad                 # Phiên bản hiện tại bị lỗi
  git bisect good [mã-hash]      # Phiên bản cũ này vẫn hoạt động tốt
  # Git sẽ tự động checkout các điểm ở giữa. Bạn kiểm tra và báo cho Git 'good' hoặc 'bad'.
  git bisect reset               # Kết thúc quá trình gỡ lỗi
  ```
- **Kiểm tra tính toàn vẹn của file pack**:
  ```shell
  git verify-pack -v .git/objects/pack/pack-*.idx
  ```

## Công cụ nội bộ & Quy trình nâng cao

Quản lý kho lưu trữ nâng cao.

- **Xem lịch sử tham chiếu (reflog)**:
  ```shell
  git reflog
  # Rất hữu ích để khôi phục các commit 'bị mất' sau khi reset.
  ```
- **Quản lý nhiều cây làm việc (worktree)**:
  ```shell
  git worktree add [đường-dẫn] [nhánh]
  # Cho phép làm việc trên hai nhánh cùng lúc ở các thư mục khác nhau.
  ```
- **Chạy lệnh trên tất cả các submodule**:
  ```shell
  git submodule foreach '[lệnh]'
  ```
- **Đồng bộ hóa URL của submodule**:
  ```shell
  git submodule sync
  ```

## Bảo trì & Làm sạch

Giữ cho kho lưu trữ khỏe mạnh và gọn nhẹ.

- **Thu gom rác & tối ưu hóa**:
  ```shell
  git gc --prune=now --aggressive
  ```
- **Kiểm tra các đối tượng bị lỗi**:
  ```shell
  git fsck
  ```
- **Xóa các đối tượng không thể truy cập**:
  ```shell
  git prune -v
  ```
- **Đóng gói lại các đối tượng vào packfile**:
  ```shell
  git repack -a -d
  ```

## Bảo mật & Quy trình Patch

- **Ký số GPG (Ký commit)**:
  ```shell
  git commit -S -m "[tin nhắn]"
  ```
- **Xuất commit thành file patch email**:
  ```shell
  git format-patch [nhánh]
  ```
- **Áp dụng các file patch**:
  ```shell
  git am < [file-patch]
  ```
- **Trình quản lý thông tin đăng nhập (Khuyên dùng)**:
  ```shell
  # Windows, macOS, Linux (khi đã cài GCM)
  git config --global credential.helper manager
  # Các trình hỗ trợ khác: osxkeychain (macOS), libsecret (Linux)
  ```
- **Lưu tạm thông tin đăng nhập (Credential cache)**:
  ```shell
  git config --global credential.helper 'cache --timeout=3600'
  ```

## Phím tắt & Cấu hình hữu ích

- **Bật tính năng Reuse Recorded Resolution (rerere)**:
  ```shell
  git config --global rerere.enabled true
  ```
- **Tự động sửa lỗi gõ lệnh (độ trễ 0.1s)**:
  ```shell
  git config --global help.autocorrect 1
  ```
- **Alias hữu ích (lg)**:
  ```shell
  git config --global alias.lg "log --color --graph --pretty=format:'%Cred%h%Creset -%C(yellow)%d%Creset %s %Cgreen(%cr) %C(bold blue)<%an>%Creset' --abbrev-commit"
  ```

## Quy tắc tốt nhất trong nhóm (Best Practices)

- **Commit nguyên tử (Atomic)**: Mỗi commit chỉ nên đại diện cho một thay đổi logic duy nhất.
- **Pull trước khi Push**: Luôn đồng bộ với remote để tránh các xung đột không đáng có.
- **Viết tin nhắn commit rõ ràng**: Sử dụng thể mệnh lệnh (VD: "Fix" thay vì "Fixed").
- **Không bao giờ rebase lịch sử đã công khai**: Chỉ rebase các nhánh chưa được push lên server.
- **Sử dụng tên nhánh có ý nghĩa**: `feat/description` hoặc `fix/bug-id`.
