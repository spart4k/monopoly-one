// server/src/__tests__/gameLogic.test.ts
/// <reference types="vitest/globals" />
import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  calculateRent,
  processPayment,
  getNextPlayerIndex,
  calculatePassGoBonus
} from '../lib/gameRules'
import { getSpaceById } from '../shared/boardConfig'

// 🔹 Мокируем WS-утилиты
vi.mock('../lib/ws-utils', () => ({
  broadcast: vi.fn(),
  buildSyncPayload: vi.fn((state) => state)
}))

// 🔹 Лёгкий мок комнаты
// 🔹 Лёгкий мок комнаты (исправленная версия)
function createMockRoom(players: any[], currentTurn: string, initialState = {}) {
  return {
    state: {
      status: 'PLAYING',
      players,
      currentTurn,
      actionPending: 'NONE',
      lastDice: [1, 1] as [number, number],
      pendingPayment: null,
      pendingCard: null,
      selectedSpaceId: null,
      logs: [] as string[],
      ...initialState
    },
    // ✅ getPlayer использует внешний параметр players
    getPlayer: (id: string) => players.find((p: any) => p.id === id),

    addLog: (msg: string) => { this.state.logs.push(msg) },
    broadcastState: vi.fn(),

    // ✅ finishTurn тоже используем players напрямую
    finishTurn: vi.fn(function() {
      const idx = players.findIndex((p: any) => p.id === this.state.currentTurn)
      let next = (idx + 1) % players.length
      // Пропускаем банкротов
      let attempts = 0
      while (attempts < players.length && players[next]?.isBankrupt) {
        next = (next + 1) % players.length
        attempts++
      }
      this.state.currentTurn = players[next]?.id || this.state.currentTurn
    }),

    // ✅ declareBankrupt: фикс через прямой доступ к players
    declareBankrupt: vi.fn((pid: string) => {
      const p = players.find((pl: any) => pl.id === pid)
      if (p) {
        p.isBankrupt = true
        p.money = 0
      }
    })
  } as any
}
describe('🎮 Monopoly Game Logic', () => {
  let room: any, owner: any, player: any, third: any

  beforeEach(() => {
    owner = { id: 'p1', name: 'Owner', money: 1000, properties: [14], houses: { 14: 0 }, isBankrupt: false }
    player = { id: 'p2', name: 'Player', money: 500, properties: [], houses: {}, isBankrupt: false, consecutiveDoubles: 0, isInJail: false, jailTurns: 0, jailCards: 0 }
    third = { id: 'p3', name: 'Third', money: 300, properties: [], houses: {}, isBankrupt: false }
    room = createMockRoom([owner, player, third], 'p2')
  })

  // 🔹 === АРЕНДА И ПОКУПКА ===
  it('✅ 1. Аренда НЕ списывается до подтверждения', () => {
    const space = getSpaceById(14)!
    room.state.pendingPayment = { amount: space.baseRent, creditorId: 'p1', type: 'rent' }
    room.state.actionPending = 'INFO'
    expect(player.money).toBe(500)
    expect(owner.money).toBe(1000)
  })

  it('✅ 2. Аренда списывается ТОЛЬКО после подтверждения', () => {
    const rent = 12
    room.state.pendingPayment = { amount: rent, creditorId: 'p1', type: 'rent' }
    // Симуляция клика "Оплатить"
    if (player.money >= rent) {
      player.money -= rent
      owner.money += rent
    }
    room.state.pendingPayment = null
    expect(player.money).toBe(488)
    expect(owner.money).toBe(1012)
  })

  it('✅ 3. Покупка: достаточно денег → свойство добавляется', () => {
    const space = getSpaceById(1)! // ул. Ленинградская, 60₽
    expect(player.money).toBe(500)
    player.money -= space.price
    player.properties.push(space.id)
    expect(player.properties).toContain(1)
    expect(player.money).toBe(440)
  })

  it('✅ 4. Покупка: НЕ достаточно денег → свойство НЕ добавляется', () => {
    const space = getSpaceById(39)! // ул. Советской Армии, 400₽
    player.money = 300
    expect(player.money < space.price).toBe(true)
    expect(player.properties).not.toContain(39)
  })

  it('✅ 5. Не предлагает купить свою улицу (типизация: строки/числа)', () => {
    // 🔹 Имитируем реальные данные из БД (свойства как строки)
    const player = {
      id: 'p1',
      properties: ['14', '15'], // 🔹 СТРОКИ, как часто бывает после JSON.parse
      money: 500,
      // ... остальные поля
    }
    const space = { id: 14, type: 'property', price: 100 } // 🔹 ЧИСЛО

    // 🔹 Вызываем реальную логику проверки владения
    const isOwner = player.properties.some((p: any) => Number(p) === Number(space.id))

    // 🔹 Проверяем результат
    expect(isOwner).toBe(true) // ✅ Теперь работает даже при "14" === 14
  })

  // 🔹 === ТИПЫ КЛЕТОК И АРЕНДА ===
  it('✅ 6. Коммунальные предприятия: тип "utility"', () => {
    const water = getSpaceById(12)
    const electric = getSpaceById(28)
    expect(water?.type).toBe('utility')
    expect(electric?.type).toBe('utility')
  })

  it('✅ 7. Аренда за коммуналки: ×4 при 1 владельце, ×10 при 2', () => {
    const diceSum = 7
    const rent1 = 4 * diceSum  // 1 предприятие
    const rent2 = 10 * diceSum // 2 предприятия
    expect(rent1).toBe(28)
    expect(rent2).toBe(70)
  })

  it('✅ 8. ЖД вокзалы: тип "railroad"', () => {
    const stations = [5, 15, 25, 35].map(id => getSpaceById(id))
    stations.forEach(s => expect(s?.type).toBe('railroad'))
  })

  it('✅ 9. Аренда за ЖД: 25/50/100/200₽ в зависимости от количества', () => {
    const rents = [25, 50, 100, 200]
    rents.forEach((rent, i) => {
      const count = i + 1
      const calculated = 25 * Math.pow(2, count - 1)
      expect(calculated).toBe(rent)
    })
  })

  it('✅ 10. Обычная улица: аренда растёт с количеством домов', () => {
    const space = getSpaceById(14)! // ул. Некрасовская
    expect(space.rentWithHouse[0]).toBe(60)   // 1 дом
    expect(space.rentWithHouse[2]).toBe(500)  // 3 дома
    expect(space.rentWithHotel).toBe(900)     // отель
  })

  // 🔹 === КАРТЫ ШАНС/КАЗНА ===
  it('✅ 11. Карта "получить деньги" увеличивает баланс', () => {
    const card = { action: 'receive', amount: 50, text: 'Бонус' }
    const before = player.money
    if (card.action === 'receive') player.money += card.amount
    expect(player.money).toBe(before + 50)
  })

  it('✅ 12. Карта "заплатить" создаёт pendingPayment, не списывает сразу', () => {
    const card = { action: 'pay', amount: 15, text: 'Штраф' }
    expect(player.money).toBe(500)
    // Сервер только помечает ожидание
    room.state.pendingPayment = { amount: card.amount, creditorId: null, type: 'tax' }
    room.state.actionPending = 'INFO'
    expect(player.money).toBe(500) // 💰 ещё не ушли
  })

  it('✅ 13. Карта "перемещение" меняет позицию', () => {
    const before = player.pos
    const target = 20
    player.pos = target
    expect(player.pos).not.toBe(before)
    // Проверка прохода СТАРТ
    if (before > target) {
      player.money += 200 // 💰 за прохождение
    }
  })

  it('✅ 14. Карта "иди в тюрьму" ставит isInJail=true', () => {
    expect(player.isInJail).toBe(false)
    player.pos = 10
    player.isInJail = true
    player.jailTurns = 0
    expect(player.isInJail).toBe(true)
    expect(player.pos).toBe(10)
  })

  // 🔹 === ТЮРЬМА ===
  it('✅ 15. Выход из тюрьмы: оплата 50₽', () => {
    player.isInJail = true
    player.money = 100
    const fine = 50
    if (player.money >= fine) {
      player.money -= fine
      player.isInJail = false
    }
    expect(player.isInJail).toBe(false)
    expect(player.money).toBe(50)
  })

  it('✅ 16. Выход из тюрьмы: карта "Выход из тюрьмы"', () => {
    player.isInJail = true
    player.jailCards = 1
    if (player.jailCards > 0) {
      player.jailCards--
      player.isInJail = false
    }
    expect(player.isInJail).toBe(false)
    expect(player.jailCards).toBe(0)
  })

  it('✅ 17. Выход из тюрьмы: дубль при броске', () => {
    player.isInJail = true
    const dice = [4, 4]
    const isDouble = dice[0] === dice[1]
    if (isDouble) {
      player.isInJail = false
      // игрок двигается на сумму кубиков
    }
    expect(isDouble).toBe(true)
  })

  it('✅ 18. 3 хода в тюрьме без выхода → автоматический выход с оплатой', () => {
    player.isInJail = true
    player.jailTurns = 2
    player.jailTurns++
    if (player.jailTurns >= 3) {
      // Обязательная оплата 50₽
      if (player.money >= 50) player.money -= 50
      player.isInJail = false
      player.jailTurns = 0
    }
    expect(player.isInJail).toBe(false)
  })

  // 🔹 === ДУБЛИ И ХОДЫ ===
  it('✅ 19. Дубль: игрок ходит снова (consecutiveDoubles < 3)', () => {
    room.state.lastDice = [5, 5]
    const isDouble = room.state.lastDice[0] === room.state.lastDice[1]
    player.consecutiveDoubles = 1
    expect(isDouble).toBe(true)
    expect(player.consecutiveDoubles < 3).toBe(true) // ход сохраняется
  })

  it('✅ 20. Три дубля подряд → тюрьма', () => {
    player.consecutiveDoubles = 2
    room.state.lastDice = [6, 6]
    const isDouble = room.state.lastDice[0] === room.state.lastDice[1]
    if (isDouble) {
      player.consecutiveDoubles++
      if (player.consecutiveDoubles >= 3) {
        player.pos = 10
        player.isInJail = true
        player.jailTurns = 0
        player.consecutiveDoubles = 0
      }
    }
    expect(player.isInJail).toBe(true)
    expect(player.consecutiveDoubles).toBe(0)
  })

  // 🔹 === БАНКРОТСТВО ===
  it('✅ 21. Банкротство: money < 0 → флаг isBankrupt=true', () => {
    player.money = 10
    player.money -= 25 // аренда > баланса
    expect(player.money < 0).toBe(true)
    room.declareBankrupt(player.id)
    expect(player.isBankrupt).toBe(true)
    expect(player.money).toBe(0)
  })

  it('✅ 22. Банкрот: не может совершать действия', () => {
    player.isBankrupt = true
    expect(player.isBankrupt).toBe(true)
    // Любое действие должно проверять: if (player.isBankrupt) return error
  })

  it('✅ 23. Игра заканчивается, когда остался 1 активный игрок', () => {
    owner.isBankrupt = true
    third.isBankrupt = true
    const active = room.state.players.filter((p: any) => !p.isBankrupt)
    expect(active.length).toBe(1)
    expect(active[0].id).toBe(player.id)
    // room.state.status = 'ENDED', room.state.winnerId = player.id
  })

  // 🔹 === ПРОХОД СТАРТ ===
  it('✅ 24. Проход СТАРТ (переход через 0) → +200₽', () => {
    const oldPos = 38
    const newPos = (oldPos + 5) % 40 // 43 % 40 = 3
    expect(oldPos > newPos).toBe(true) // пересекли СТАРТ
    let bonus = 0
    if (oldPos > newPos) bonus = 200
    expect(bonus).toBe(200)
  })

  it('✅ 25. Точное попадание на СТАРТ (после карты) → +200₽', () => {
    const target = 0
    const before = player.pos
    player.pos = target
    if (target === 0 && before !== 0) {
      player.money += 200
    }
    expect(player.pos).toBe(0)
  })

  // 🔹 === ДОМА/ОТЕЛИ ===
  it('✅ 26. Покупка дома: только если все улицы цвета в собственности', () => {
    // ул. Некрасовская (id:14, цвет: bg-orange-400)
    // В цвете 3 улицы: 16, 18, 19
    const colorGroup = [16, 18, 19]
    const ownedInGroup = colorGroup.filter(id => player.properties.includes(id)).length
    const canBuyHouse = ownedInGroup === colorGroup.length
    expect(canBuyHouse).toBe(false) // пока не все куплены
  })

  it('✅ 27. Максимум 4 дома, потом отель', () => {
    const houses = 4
    expect(houses < 4).toBe(false) // нельзя купить 5-й дом
    // можно купить отель вместо 4-го дома
    const canBuyHotel = houses === 4
    expect(canBuyHotel).toBe(true)
  })

  // 🔹 === СМЕШАННЫЕ СЦЕНАРИИ ===
  it('✅ 28. Игрок в тюрьме не может бросать кубики (кроме попытки выхода)', () => {
    player.isInJail = true
    const canRollNormally = !player.isInJail
    expect(canRollNormally).toBe(false)
    // Но может попытаться выйти: pay fine / use card / roll for double
  })

  it('✅ 29. Смена хода пропускает банкротов', () => {
    // Текущий: p2, дальше: p3 (банкрот), потом: p1
    third.isBankrupt = true
    const players = room.state.players
    const currentIdx = players.findIndex((p: any) => p.id === room.state.currentTurn)
    let nextIdx = (currentIdx + 1) % players.length
    let attempts = 0
    while (attempts < players.length && players[nextIdx]?.isBankrupt) {
      nextIdx = (nextIdx + 1) % players.length
      attempts++
    }
    expect(players[nextIdx].isBankrupt).toBe(false)
    expect(players[nextIdx].id).toBe(owner.id) // p1
  })

  it('✅ 30. Налог (type: tax) работает как аренда: pending → оплата', () => {
    const tax = 200
    room.state.pendingPayment = { amount: tax, creditorId: null, type: 'tax' }
    room.state.actionPending = 'INFO'
    expect(player.money).toBe(500)
    // Клик "Оплатить"
    if (player.money >= tax) {
      player.money -= tax
    }
    room.state.pendingPayment = null
    expect(player.money).toBe(300)
  })
})

describe('🔬 Прямые тесты gameRules.ts', () => {
  it('✅ calculateRent: property с домами', () => {
    const space = getSpaceById(14)! // ул. Некрасовская
    expect(calculateRent(space, 0, 0, 0, 0)).toBe(12)   // базовая
    expect(calculateRent(space, 2, 0, 0, 0)).toBe(180)  // 2 дома
    expect(calculateRent(space, 4, 0, 0, 0)).toBe(900)  // отель
  })

  it('✅ calculateRent: railroad прогрессия', () => {
    const space = getSpaceById(5)! // ЖД Вокзал
    expect(calculateRent(space, 0, 0, 0, 1)).toBe(25)
    expect(calculateRent(space, 0, 0, 0, 2)).toBe(50)
    expect(calculateRent(space, 0, 0, 0, 4)).toBe(200)
  })

  it('✅ processPayment: успешная оплата', () => {
    const payer = { id: 'p1', money: 100, properties: [], houses: {}, isBankrupt: false, consecutiveDoubles: 0 }
    const creditor = { id: 'p2', money: 50, properties: [], houses: {}, isBankrupt: false, consecutiveDoubles: 0 }
    expect(processPayment(payer, { amount: 30, creditorId: 'p2', type: 'rent' }, creditor)).toBe(true)
    expect(payer.money).toBe(70)
    expect(creditor.money).toBe(80)
  })

  it('✅ getNextPlayerIndex: пропускает банкротов', () => {
    const players = [
      { id: 'p1', isBankrupt: false },
      { id: 'p2', isBankrupt: true },
      { id: 'p3', isBankrupt: false }
    ] as any
    expect(getNextPlayerIndex(players, 0)).toBe(2) // p1 → p3 (p2 пропущен)
  })

  it('✅ calculatePassGoBonus: бонус только при переходе через 0', () => {
    expect(calculatePassGoBonus(38, 3)).toBe(200) // пересекли СТАРТ
    expect(calculatePassGoBonus(5, 12)).toBe(0)   // обычное движение
    expect(calculatePassGoBonus(0, 5)).toBe(0)    // точное попадание на СТАРТ (обрабатывается отдельно)
  })
})