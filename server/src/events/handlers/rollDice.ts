// server/src/events/handlers/rollDice.ts
import type { Room } from '../../rooms/Room'
import type { RoomView } from '../../rooms/RoomManager'
import { broadcast, buildSyncPayload } from '../../lib/ws-utils'
import { getSpaceById } from '../../shared/boardConfig'
import { handleDrawCard } from './cardAction'

export function handleRollDice(room: Room, playerId: string, roomViews: Map<string, RoomView>, targetSpaceId?: number) {
  const player = room.getPlayer(playerId)
  if (!player) return { error: 'Игрок не найден' }

  // 🔒 Блокировка: нельзя ходить, если висит действие (кроме разрешённого дубля)
  if (room.state.actionPending !== 'NONE' && room.state.actionPending !== 'DOUBLE_TURN') {
    return { error: `🚫 Сначала завершите действие: ${room.state.actionPending}` }
  }

  // 🚔 ЛОГИКА ТЮРЬМЫ (вместо блокировки)
  // 🚔 ЛОГИКА ТЮРЬМЫ (в начале handleRollDice)
  if (player.isInJail) {
    let dice: [number, number] = [Math.ceil(Math.random() * 6), Math.ceil(Math.random() * 6)]
    room.state.lastDice = dice
    const isDouble = dice[0] === dice[1]
    const oldPos = player.pos // 10 (Тюрьма)

    room.addLog(`🎲 ${player.name}: ${dice[0]}+${dice[1]}${isDouble ? ' (ДУБЛЬ!)' : ''} → попытка выхода`)

    if (isDouble) {
      // ✅ Дубль → выход и перемещение
      player.isInJail = false
      player.jailTurns = 0
      player.pos = (player.pos + dice[0] + dice[1]) % 40
      room.addLog(`🔓 ${player.name} вышел из тюрьмы по дублю!`)
      broadcast(roomViews, room.id, { type: 'PLAYER_MOVED', playerId, from: oldPos, to: player.pos, dice })
      room.finishTurn()
      broadcast(roomViews, room.id, { type: 'SYNC_STATE', payload: buildSyncPayload(room.state) })
      return { success: true }
    } else {
      // ❌ Не дубль → считаем попытку
      player.jailTurns++
      if (player.jailTurns >= 3) {
        // 3-я неудача → авто-выход за 50₽ (если хватает денег)
        if (player.money >= 50) {
          player.money -= 50
          player.isInJail = false
          player.jailTurns = 0
          player.pos = (player.pos + dice[0] + dice[1]) % 40
          room.addLog(`💸 ${player.name} заплатил 50₽ за авто-выход из тюрьмы`)
          broadcast(roomViews, room.id, { type: 'PLAYER_MOVED', playerId, from: oldPos, to: player.pos, dice })
        } else {
          room.addLog(`💀 ${player.name} не может заплатить 50₽. Остаётся в тюрьме`)
        }
      } else {
        room.addLog(`❌ ${player.name} не выбросил дубль. Попытка ${player.jailTurns}/3`)
      }
      room.finishTurn()
      broadcast(roomViews, room.id, { type: 'SYNC_STATE', payload: buildSyncPayload(room.state) })
      return { success: true }
    }
  }

  // 🎲 ОБЫЧНЫЙ ХОД (игрок НЕ в тюрьме)
  let dice: [number, number] = [Math.ceil(Math.random() * 6), Math.ceil(Math.random() * 6)]
  let finalPos = player.pos

  if (targetSpaceId !== undefined) {
    let steps = (targetSpaceId - player.pos + 40) % 40
    if (steps === 0) steps = 40
    steps = Math.max(2, Math.min(12, steps))
    dice = [Math.floor(steps / 2), steps - Math.floor(steps / 2)]
    finalPos = targetSpaceId
  } else {
    finalPos = (player.pos + dice[0] + dice[1]) % 40
  }

  const oldPos = player.pos
  player.pos = finalPos
  room.state.lastDice = dice

  const isDouble = dice[0] === dice[1]
  const doubleLog = isDouble ? ' (ДУБЛЬ!)' : ''
  room.addLog(`🎲 ${player.name}: ${dice[0]}+${dice[1]}${doubleLog} → ${finalPos}`)
  room.state.lastRollWasDouble = isDouble

  // 💰 Проход через СТАРТ
  if (finalPos < oldPos || finalPos === 0) {
    player.money += 200
    room.addLog(`💰 ${player.name} получил 200₽ за СТАРТ`)
  }

  const space = getSpaceById(player.pos)
  if (!space) {
    if (!isDouble) room.finishTurn()
    else room.state.actionPending = 'DOUBLE_TURN'
    broadcast(roomViews, room.id, { type: 'PLAYER_MOVED', playerId, from: oldPos, to: player.pos, dice })
    broadcast(roomViews, room.id, { type: 'SYNC_STATE', payload: buildSyncPayload(room.state) })
    return { success: true }
  }

  let actionRequired = false

  // 🏠 Недвижимость
  if (space.type === 'property' || space.type === 'railroad') {
    const owner = room.state.players.find(p => p.properties?.includes(space.id))
    if (!owner) {
      room.state.actionPending = 'BUY'
      actionRequired = true
      broadcast(roomViews, room.id, { type: 'OFFER_BUY', playerId, spaceId: space.id, price: space.price, name: space.name })
    } else if (owner.id !== playerId) {
      let rent = 0
      const houseCount = owner.houses?.[space.id] || 0

      if (space.type === 'railroad') {
        const rrCount = owner.properties.filter(id => [5,15,25,35].includes(id)).length
        rent = 25 * Math.pow(2, rrCount - 1)
      } else if ([12,28].includes(space.id)) {
        const utilCount = owner.properties.filter(id => [12,28].includes(id)).length
        rent = (dice[0]+dice[1]) * (utilCount === 2 ? 10 : 4)
      } else {
        // 🔑 Аренда с учётом домов/отелей
        if (houseCount === 0) rent = space.baseRent
        else if (houseCount <= 4 && space.rentWithHouse) rent = space.rentWithHouse[houseCount - 1]
        else if (houseCount === 5) rent = space.rentWithHotel || space.baseRent * 10
      }

      if (rent > 0) {
        const paid = Math.min(player.money, rent)
        owner.money += paid
        player.money -= paid
        const label = houseCount > 0 ? (houseCount === 5 ? '🏨 Отель' : `🏠 Дом ${houseCount}`) : ''
        room.addLog(`💸 ${player.name} заплатил ${paid}₽ аренды ${space.name} ${label}`)
        room.state.actionPending = 'INFO'
        actionRequired = true
        broadcast(roomViews, room.id, {
          type: 'ACTION_REQUIRED',
          title: '💸 Аренда',
          message: `Оплачено ${paid}₽`,
          icon: '💸',
          spaceId: space.id,
          amount: paid // 🔑 Фактическая сумма аренды
        })
      }
    }
  }
  // 📉 Налоги
  // 📉 Налоги
  else if (space.type === 'tax') {
    const tax = space.id === 4 ? 200 : 100
    player.money -= tax
    room.addLog(`📉 ${player.name} заплатил налог ${tax}₽`)
    room.state.actionPending = 'INFO'
    actionRequired = true
    broadcast(roomViews, room.id, {
      type: 'ACTION_REQUIRED',
      title: '📉 Налог',
      message: `Налог ${tax}₽ списан`,
      icon: '📉',
      spaceId: space.id,
      amount: tax // 🔑 КРИТИЧНО: сумма для клиента
    })
  }
  // 🃏 Карты
  else if (space.type === 'chance' || space.type === 'community') {
    return handleDrawCard(room, playerId, space.type, roomViews)
  }
  // 🚔 Попадание на "ИДИ В ТЮРЬМУ"
  else if (space.type === 'go_to_jail') {
    player.pos = 10
    player.isInJail = true
    player.jailTurns = 0
    room.addLog(`🚔 ${player.name} отправлен в тюрьму!`)
    broadcast(roomViews, room.id, { type: 'GO_TO_JAIL', playerId })
    room.finishTurn()
    broadcast(roomViews, room.id, { type: 'SYNC_STATE', payload: buildSyncPayload(room.state) })
    return { success: true }
  }

  // 🔄 Обработка дублей (если нет обязательного действия)
  if (!actionRequired) {
    if (isDouble) {
      player.consecutiveDoubles++; // Копим счётчик, НЕ сбрасываем при actionRequired
      if (player.consecutiveDoubles >= 3) {
        // 3 дубля подряд → Тюрьма (срабатывает мгновенно, даже если висит покупка)
        player.pos = 10; player.isInJail = true; player.jailTurns = 0; player.consecutiveDoubles = 0;
        room.addLog(`🚔 ${player.name} выбросил 3 дубля подряд → Тюрьма!`);
        broadcast(roomViews, room.id, { type: 'GO_TO_JAIL', playerId });
        room.finishTurn();
      } else {
        // 1 или 2 дубля → оставляем ход у игрока
        // Если уже висит действие (BUY/INFO), не меняем его. Иначе ставим DOUBLE_TURN
        if (!actionRequired) {
          room.state.actionPending = 'DOUBLE_TURN';
          broadcast(roomViews, room.id, { type: 'DOUBLE_ROLLED', playerId });
        }
      }
    } else {
      // Не дубль → сбрасываем счётчик и передаём ход (если нет другого действия)
      player.consecutiveDoubles = 0;
      if (!actionRequired) {
        room.finishTurn();
      }
    }

    // 📡 Рассылка движения и стейта
    broadcast(roomViews, room.id, { type: 'PLAYER_MOVED', playerId, from: oldPos, to: player.pos, dice })
    if (!actionRequired || room.state.actionPending === 'NONE') {
      broadcast(roomViews, room.id, { type: 'SYNC_STATE', payload: buildSyncPayload(room.state) })
    }
  } else {
    player.consecutiveDoubles = 0
  }

  broadcast(roomViews, room.id, { type: 'PLAYER_MOVED', playerId, from: oldPos, to: player.pos, dice })
  broadcast(roomViews, room.id, { type: 'SYNC_STATE', payload: buildSyncPayload(room.state) })

  return { success: true, actionRequired }
}