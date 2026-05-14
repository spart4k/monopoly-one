// server/src/events/index.ts
// 📦 Централизованный экспорт всех обработчиков событий

// 🎲 Roll Dice
export { handleRollDice } from './handlers/rollDice/index'

// 🏠 Property
export { handleBuyProperty, handlePassAction } from './handlers/buyProperty'

// 🃏 Cards
export { handleDrawCard } from './handlers/cardAction'

// 🏗 Houses
export { handleBuyHouse, handleSellHouse } from './handlers/buildHouse'

// 🔒 Jail
export { handlePayJailFine, useJailCard } from './handlers/jailAction'

// 🔐 Mortgage
export { handleMortgage, handleUnmortgage } from './handlers/mortgageAction'

// 🤝 Trade
export {
  handleTradeInit,
  handleTradeEdit,
  handleTradePropose,
  handleTradeAccept,
  handleTradeDecline
} from './handlers/tradeAction'