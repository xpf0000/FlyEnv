<template>
  <div class="h-full overflow-hidden">
    <el-scrollbar>
      <div v-if="!store.isActive" class="flex flex-col gap-2 items-start">
        <template v-if="lang === 'zh'">
          <div class="text-xl">许可证说明</div>
          <p
            >许可证代表了对 FlyEnv
            和作者辛勤工作的认可。其初衷并非限制用户使用，而是希望提醒用户尊重开发者的劳动成果，并在使用软件时遵守相关条款。
            通过遵守许可证，用户不仅支持了项目的持续发展，也为开源社区的互信与合作精神贡献了力量。</p
          >
          <p>未获取许可证的用户将受到以下限制: </p>
          <p>1. 最多可新建三个站点。</p>
          <p>2. AI聊天功能仅可试用三天。</p>
          <p>3. 后续新增功能可能会受到其他限制。</p>
          <p
            >当前提供的许可证为永久许可证，每台电脑对应一个许可证。若更换电脑，需重新申请许可证。</p
          >
          <div class="text-xl">许可证获取方式</div>
          <p>FlyEnv 提供了灵活的许可证获取方式，用户可选择以下任意一种方式申请：</p>
          <p>1. 捐赠项目. </p>
          <p>
            捐赠金额无具体限制。考虑到不同国家和用户的经济状况（例如许多用户为学生），请根据自身情况选择合适的金额。
            <el-button type="primary" link @click.stop="toUrl('https://flyenv.com/sponsor.html')"
              >https://flyenv.com/sponsor.html</el-button
            >
          </p>
          <p>2. 参与项目开发。 </p>
          <p>
            通过提交 Pull Request
            参与开发。无论代码量多少，只要是对项目的正向优化（例如修复翻译错误），均符合条件。
            <el-button type="primary" link @click.stop="toUrl('https://github.com/xpf0000/FlyEnv')"
              >https://github.com/xpf0000/FlyEnv</el-button
            ></p
          >
          <p> 3. 帮助推广项目 </p>
          <p
            >通过发表文章、视频、博客、vlog 或在评论中介绍 FlyEnv
            来推广项目。推广内容不限语言和平台，只要能在互联网上公开访问即可。</p
          >
          <p
            >完成上述任意一种方式后，请将执行结果填写到下方输入框，并点击“请求许可证”按钮提交申请。许可证请求为人工审核，请耐心等待，通常会在短时间内处理完毕。</p
          >
          <el-form-item class="w-full mt-5 mb-1" label-position="top" label="UUID">
            <el-input v-model="store.uuid" readonly></el-input>
          </el-form-item>
          <el-form-item class="w-full mb-0" label-position="top" label="消息">
            <el-input
              v-model="store.message"
              class="mt-4"
              type="textarea"
              resize="none"
              rows="6"
              placeholder="选择捐赠请提交捐赠人捐赠链接或订单ID.
选择参与项目开发请提交PR链接.
选择帮助推广项目,请提交文章/视频链接"
            ></el-input>
          </el-form-item>
          <div class="mt-4">
            <el-button
              :loading="store.fetching"
              :disabled="store.fetching || !store.message.trim()"
              type="primary"
              @click.stop="doRequest"
              >请求许可证</el-button
            >
            <el-button :loading="store.fetching" :disabled="store.fetching" @click.stop="doRefresh"
              >刷新状态</el-button
            >
          </div>
        </template>
        <template v-else-if="lang === 'vi'">
          <div class="text-xl">Mô tả giấy phép</div>
          <p
          >Giấy phép là một sự công nhận và hỗ trợ cho công việc khó khăn của Flyenv và các tác giả của nó.
            Mục đích của nó không phải là hạn chế người dùng mà là nhắc nhở họ tôn trọng các nhà phát triển
            nỗ lực và tuân thủ các thuật ngữ có liên quan khi sử dụng phần mềm. Bằng cách tuân thủ
            giấy phép, người dùng không chỉ hỗ trợ sự phát triển liên tục của dự án mà còn
            Đóng góp cho tinh thần tin cậy và hợp tác trong cộng đồng nguồn mở.</p
          >
          <p>Người dùng không có giấy phép sẽ tuân theo các hạn chế sau:</p>
          <p>1. Tối đa ba trang web có thể được tạo.</p>
          <p>2. Tính năng trò chuyện AI chỉ có sẵn trong thời gian dùng thử chỉ ba ngày.</p>
          <p>3. Hạn chế bổ sung có thể áp dụng cho các tính năng trong tương lai.</p>
          <p
          >Giấy phép hiện tại được cung cấp là giấy phép vĩnh viễn, với một giấy phép tương ứng với
            Một máy tính. Nếu bạn thay đổi máy tính, bạn sẽ cần phải yêu cầu một giấy phép mới.</p
          >
          <div class="text-xl">Cách lấy giấy phép</div>
          <p
          >FlyEnv cung cấp các cách linh hoạt để có được giấy phép. Người dùng có thể chọn bất kỳ
            Các phương pháp sau để áp dụng:</p
          >
          <p>1. Quyên góp cho dự án. </p>
          <p>
            Không có số tiền cố định cần thiết cho quyên góp. Xem xét kinh tế khác nhau
            Tình huống của người dùng ở các quốc gia khác nhau (ví dụ: nhiều người dùng là sinh viên), xin vui lòng
            Chọn một số tiền phù hợp với hoàn cảnh của bạn.
            <el-button type="primary" link @click.stop="toUrl('https://flyenv.com/sponsor.html')"
            >https://flyenv.com/sponsor.html</el-button
            >
          </p>
          <p>2. Đóng góp cho sự phát triển. </p>
          <p>
            Tham gia vào dự án bằng cách gửi yêu cầu kéo. Bất kể số lượng của
            Mã, miễn là nó cải thiện tích cực dự án (ví dụ: sửa lỗi dịch),
            nó đủ điều kiện.
            <el-button type="primary" link @click.stop="toUrl('https://github.com/xpf0000/FlyEnv')"
            >https://github.com/xpf0000/FlyEnv</el-button
            ></p
          >
          <p>3. Thúc đẩy dự án</p>
          <p>
            Quảng bá FlyEnv bằng cách xuất bản các bài viết, video, blog, vlog hoặc giới thiệu nó trong
            Nhận xét. Nội dung có thể bằng bất kỳ ngôn ngữ nào và trên bất kỳ nền tảng nào, miễn là nó
            có thể truy cập công khai trên internet.
          </p>
          <p>
            Sau khi hoàn thành bất kỳ phương pháp nào ở trên, vui lòng điền vào kết quả trong hộp đầu vào
            Dưới đây và nhấp vào nút "Yêu cầu giấy phép" để gửi đơn đăng ký của bạn. Giấy phép
            Yêu cầu được xem xét thủ công, vì vậy hãy kiên nhẫn. Chúng thường được xử lý
            nhanh chóng.
          </p>
          <el-form-item class="w-full mt-5 mb-1" label-position="top" label="UUID">
            <el-input v-model="store.uuid" readonly></el-input>
          </el-form-item>
          <el-form-item class="w-full mb-0" label-position="top" label="Message">
            <el-input
              v-model="store.message"
              type="textarea"
              resize="none"
              rows="6"
              placeholder="Vui lòng gửi nhà tài trợ, liên kết quyên góp hoặc đặt hàng ID khi chọn quyên góp.
Vui lòng gửi liên kết PR cho những người chọn tham gia phát triển dự án.
Vui lòng gửi liên kết bài viết/video nếu bạn chọn giúp quảng bá dự án"
            ></el-input>
          </el-form-item>
          <div class="mt-4">
            <el-button
              :loading="store.fetching"
              :disabled="store.fetching || !store.message.trim()"
              type="primary"
              @click.stop="doRequest"
            >Request License</el-button
            >
            <el-button :loading="store.fetching" :disabled="store.fetching" @click.stop="doRefresh"
            >Refresh State</el-button
            >
          </div>
        </template>
        <template v-else>
          <div class="text-xl">License Description</div>
          <p
            >The license is a recognition and support for the hard work of FlyEnv and its authors.
            Its purpose is not to restrict users but to remind them to respect the developers'
            efforts and comply with the relevant terms when using the software. By adhering to the
            license, users not only support the ongoing development of the project but also
            contribute to the spirit of trust and collaboration within the open-source community.</p
          >
          <p>Users without a license will be subject to the following restrictions:</p>
          <p>1. A maximum of three sites can be created.</p>
          <p>2. The AI chat feature is available for a trial period of three days only.</p>
          <p>3. Additional restrictions may apply to future features.</p>
          <p
            >The current license offered is a perpetual license, with one license corresponding to
            one computer. If you change your computer, you will need to request a new license.</p
          >
          <div class="text-xl">How to Obtain a License</div>
          <p
            >FlyEnv provides flexible ways to obtain a license. Users can choose any of the
            following methods to apply:</p
          >
          <p>1. Donate to the Project. </p>
          <p>
            There is no fixed amount required for donations. Considering the varying economic
            situations of users in different countries (e.g., many users are students), please
            choose an amount that suits your circumstances.
            <el-button type="primary" link @click.stop="toUrl('https://flyenv.com/sponsor.html')"
              >https://flyenv.com/sponsor.html</el-button
            >
          </p>
          <p>2. Contribute to Development. </p>
          <p>
            Participate in the project by submitting a Pull Request. Regardless of the amount of
            code, as long as it positively improves the project (e.g., fixing a translation error),
            it qualifies.
            <el-button type="primary" link @click.stop="toUrl('https://github.com/xpf0000/FlyEnv')"
              >https://github.com/xpf0000/FlyEnv</el-button
            ></p
          >
          <p>3. Promote the Project</p>
          <p>
            Promote FlyEnv by publishing articles, videos, blogs, vlogs, or introducing it in
            comments. The content can be in any language and on any platform, as long as it is
            publicly accessible on the internet.
          </p>
          <p>
            After completing any of the above methods, please fill in the results in the input box
            below and click the "Request License" button to submit your application. License
            requests are manually reviewed, so please be patient. They are usually processed
            promptly.
          </p>
          <el-form-item class="w-full mt-5 mb-1" label-position="top" label="UUID">
            <el-input v-model="store.uuid" readonly></el-input>
          </el-form-item>
          <el-form-item class="w-full mb-0" label-position="top" label="Message">
            <el-input
              v-model="store.message"
              type="textarea"
              resize="none"
              rows="6"
              placeholder="Please submit the donor, donation link, or order ID when choosing to donate.
Please submit the PR link for those who choose to participate in project development.
Please submit article/video link if you choose to help promote the project"
            ></el-input>
          </el-form-item>
          <div class="mt-4">
            <el-button
              :loading="store.fetching"
              :disabled="store.fetching || !store.message.trim()"
              type="primary"
              @click.stop="doRequest"
              >Request License</el-button
            >
            <el-button :loading="store.fetching" :disabled="store.fetching" @click.stop="doRefresh"
              >Refresh State</el-button
            >
          </div>
        </template>
      </div>
      <div v-else class="h-full min-h-[80vh] flex items-center justify-center">
        <el-result icon="success" :title="I18nT('setup.licenseActivated')"> </el-result>
      </div>
    </el-scrollbar>
  </div>
</template>
<script lang="ts" setup>
  import { computed } from 'vue'
  import { AppStore } from '@/store/app'
  import { SetupStore } from '@/components/Setup/store'
  import { I18nT } from '@shared/lang'

  const { shell } = require('@electron/remote')

  const store = SetupStore()
  const app = AppStore()
  const lang = computed(() => {
    return app.config.setup.lang
  })

  const toUrl = (url: string) => {
    shell.openExternal(url)
  }
  const doRequest = () => {
    store.postRequest()
  }
  const doRefresh = () => {
    store.refreshState()
  }
</script>
