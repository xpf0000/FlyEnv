import {
  MessageError as PublicMessageError,
  MessageSuccess as PublicMessageSuccess
} from '@/util/Element'

// Public Element helpers render HTML. Keep database/process errors as plain text.
const escape = (message: string) =>
  message.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[character]!
  )
export const MessageError = (message: string) => PublicMessageError(escape(message))
export const MessageSuccess = (message: string) => PublicMessageSuccess(escape(message))
