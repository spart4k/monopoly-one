export type TCardType = 'chance' | 'community'
export type TCardEffect =
  | 'move_to' | 'move_to_nearest' | 'move_backward'
  | 'pay_bank' | 'receive_bank' | 'pay_player'
  | 'go_to_jail' | 'jail_card' | 'repair'

export interface ICard {
  id: string
  type: TCardType
  text: string
  effect: TCardEffect
  value?: number
}

export const CHANCE_CARDS: ICard[] = [
  { id: 'c1', type: 'chance', text: 'Отправляйтесь на СТАРТ', effect: 'move_to', value: 0 },
  { id: 'c2', type: 'chance', text: 'Банковская ошибка в вашу пользу. Получите 200₽', effect: 'receive_bank', value: 200 },
  { id: 'c3', type: 'chance', text: 'Оплата услуг врача. Заплатите 50₽', effect: 'pay_bank', value: 50 },
  { id: 'c4', type: 'chance', text: 'Штраф за превышение скорости. Заплатите 15₽', effect: 'pay_bank', value: 15 },
  { id: 'c5', type: 'chance', text: 'Отправляйтесь в Тюрьму', effect: 'go_to_jail' },
  { id: 'c6', type: 'chance', text: 'Вы наследуете 100₽', effect: 'receive_bank', value: 100 },
  { id: 'c7', type: 'chance', text: 'Продажа акций. Получите 50₽', effect: 'receive_bank', value: 50 },
  { id: 'c8', type: 'chance', text: 'Отправляйтесь на пр. Кирова', effect: 'move_to', value: 6 },
  { id: 'c9', type: 'chance', text: 'Отправляйтесь на пр. Ленина', effect: 'move_to', value: 26 },
  { id: 'c10', type: 'chance', text: 'Идите на ближайший Вокзал', effect: 'move_to_nearest', value: 5 },
  { id: 'c11', type: 'chance', text: 'Идите на ближайшую Коммуналку', effect: 'move_to_nearest', value: 12 },
  { id: 'c12', type: 'chance', text: 'Карта "Выход из тюрьмы"', effect: 'jail_card' },
  { id: 'c13', type: 'chance', text: 'Вернитесь на 3 клетки назад', effect: 'move_backward', value: 3 },
  { id: 'c14', type: 'chance', text: 'Ремонт недвижимости. Заплатите 50₽', effect: 'repair', value: 50 },
  { id: 'c15', type: 'chance', text: 'Ваш фонд выиграл 150₽', effect: 'receive_bank', value: 150 },
  { id: 'c16', type: 'chance', text: 'Вы выиграли конкурс. Получите 100₽', effect: 'receive_bank', value: 100 },
]

export const COMMUNITY_CARDS: ICard[] = [
  { id: 'cc1', type: 'community', text: 'Отправляйтесь на СТАРТ', effect: 'move_to', value: 0 },
  { id: 'cc2', type: 'community', text: 'Ошибка банка в вашу пользу. Получите 200₽', effect: 'receive_bank', value: 200 },
  { id: 'cc3', type: 'community', text: 'Медицинские услуги. Заплатите 50₽', effect: 'pay_bank', value: 50 },
  { id: 'cc4', type: 'community', text: 'Продажа акций. Получите 50₽', effect: 'receive_bank', value: 50 },
  { id: 'cc5', type: 'community', text: 'Отправляйтесь в Тюрьму', effect: 'go_to_jail' },
  { id: 'cc6', type: 'community', text: 'Вы наследуете 100₽', effect: 'receive_bank', value: 100 },
  { id: 'cc7', type: 'community', text: 'Страхование. Заплатите 100₽', effect: 'pay_bank', value: 100 },
  { id: 'cc8', type: 'community', text: 'Вам вернули налог. Получите 20₽', effect: 'receive_bank', value: 20 },
  { id: 'cc9', type: 'community', text: 'День рождения! Каждый игрок платит вам 10₽', effect: 'pay_player', value: 10 },
  { id: 'cc10', type: 'community', text: 'Оплата обучения. Заплатите 150₽', effect: 'pay_bank', value: 150 },
  { id: 'cc11', type: 'community', text: 'Карта "Выход из тюрьмы"', effect: 'jail_card' },
  { id: 'cc12', type: 'community', text: 'Отправляйтесь на ул. Советской Армии', effect: 'move_to', value: 39 },
  { id: 'cc13', type: 'community', text: 'Ремонт. Заплатите 40₽ за каждый дом', effect: 'repair', value: 40 },
  { id: 'cc14', type: 'community', text: 'Штраф за парковку. Заплатите 15₽', effect: 'pay_bank', value: 15 },
  { id: 'cc15', type: 'community', text: 'Ваш вклад погашен. Получите 100₽', effect: 'receive_bank', value: 100 },
  { id: 'cc16', type: 'community', text: 'Вы выиграли кроссворд. Получите 100₽', effect: 'receive_bank', value: 100 },
]

export function shuffleDeck<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}