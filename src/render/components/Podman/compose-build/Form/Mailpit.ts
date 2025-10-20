import { reactive } from 'vue'
import { currentTimeZone } from '@/components/Podman/compose-build/Form/Base'
import Base from './Base'
import { OfficialImages } from '@/components/Podman/officialImages'

// --- Mailpit Configuration ---
const Mailpit = reactive({
  enable: false,
  persistence: false, // Mailpit is typically used for temporary email storage
  version: 'latest',
  ports: [
    { in: '1025', out: '1025' }, // SMTP port
    { in: '8025', out: '8025' } // Web UI port
  ],
  volumes: [],
  environment: {
    TZ: currentTimeZone,
    MP_MAX_MESSAGES: 500 // Limit stored messages
  },
  check() {
    return ''
  },
  async build() {
    const mirror = Base.mirrorHost()
    const image = OfficialImages.mailpit!.image

    const mailpit: any = {
      image: `${mirror}${image}:${Mailpit.version}`,
      ports: Mailpit.ports.map((p) => `${p.out}:${p.in}`),
      environment: Mailpit.environment,
      networks: ['flyenv-network']
    }

    return { mailpit }
  }
})

export default Mailpit
