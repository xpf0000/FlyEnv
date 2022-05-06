import is from 'electron-is'
import logger from 'electron-log'

logger.transports.file.level = is.production() ? 'warn' : 'silly'
logger.info('Logger init')
logger.warn('[WebMaker] Logger init')

export default logger
