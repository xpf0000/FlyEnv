import { HermesProviders } from '../src/render/components/Hermes/providers'

const minimax = HermesProviders.find((provider) => provider.name === 'MiniMax')
if (!minimax) throw new Error('MiniMax provider is missing')
if (minimax.models?.join(',') !== 'MiniMax-M3,MiniMax-M2.7') throw new Error('MiniMax model IDs are incomplete')
if (minimax.endpoints?.length !== 4) throw new Error('MiniMax regional endpoints are incomplete')
if (minimax.modelDetails?.length !== 2) throw new Error('MiniMax model metadata is incomplete')
const m3 = minimax.modelDetails.find((model) => model.id === 'MiniMax-M3')
const m27 = minimax.modelDetails.find((model) => model.id === 'MiniMax-M2.7')
if (!m3 || m3.contextWindow !== 1000000 || m3.pricingUsdPerMillionTokens.output !== 2.4 || m3.inputModalities.join(',') !== 'text,image,video' || m3.thinking.join(',') !== 'adaptive,disabled') throw new Error('MiniMax-M3 metadata is incorrect')
if (!m27 || m27.contextWindow !== 204800 || m27.pricingUsdPerMillionTokens.cacheWrite !== 0.375 || m27.thinking.join(',') !== 'always_on') throw new Error('MiniMax-M2.7 metadata is incorrect')
console.log('Hermes provider metadata checks passed')
