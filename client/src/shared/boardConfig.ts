export type TSpaceType =
  | 'go' | 'property' | 'community' | 'tax' | 'jail'
  | 'railroad' | 'chance' | 'free_parking' | 'go_to_jail'

export interface ISpaceData {
  id: number
  name: string
  type: TSpaceType
  color: string      // bg- класс
  textColor: string  // text- класс для контраста
  price: number
  baseRent: number
  rentWithHouse: [number, number, number, number]
  rentWithHotel: number
  houseCost: number
  mortgageValue: number
  description?: string
}

export const STARTING_MONEY = 1500
export const GO_MONEY = 200
export const JAIL_FINE = 50

export const BOARD_CONFIG: ISpaceData[] = [
  { id: 0, name: 'СТАРТ', type: 'go', color: 'bg-gray-200', textColor: 'text-gray-800', price: 0, baseRent: 0, rentWithHouse: [0,0,0,0], rentWithHotel: 0, houseCost: 0, mortgageValue: 0, description: 'Получите 200₽ при проходе' },
  { id: 1, name: 'Ленинградская', type: 'property', color: 'bg-amber-800', textColor: 'text-white', price: 60, baseRent: 2, rentWithHouse: [10,30,90,160], rentWithHotel: 250, houseCost: 50, mortgageValue: 30 },
  { id: 2, name: 'Казна', type: 'community', color: 'bg-blue-200', textColor: 'text-blue-900', price: 0, baseRent: 0, rentWithHouse: [0,0,0,0], rentWithHotel: 0, houseCost: 0, mortgageValue: 0 },
  { id: 3, name: 'Вилоновская', type: 'property', color: 'bg-amber-800', textColor: 'text-white', price: 60, baseRent: 4, rentWithHouse: [20,60,180,320], rentWithHotel: 450, houseCost: 50, mortgageValue: 30 },
  { id: 4, name: 'Подоходный налог', type: 'tax', color: 'bg-gray-100', textColor: 'text-gray-800', price: 0, baseRent: 0, rentWithHouse: [0,0,0,0], rentWithHotel: 0, houseCost: 0, mortgageValue: 0, description: 'Заплатите 200₽' },
  { id: 5, name: 'ЖД Вокзал', type: 'railroad', color: 'bg-gray-800', textColor: 'text-white', price: 200, baseRent: 25, rentWithHouse: [0,0,0,0], rentWithHotel: 0, houseCost: 0, mortgageValue: 100, description: '25₽ за 1 вокзал, 50₽ за 2, 100₽ за 3, 200₽ за 4' },
  { id: 6, name: 'пр. Кирова', type: 'property', color: 'bg-sky-400', textColor: 'text-gray-900', price: 100, baseRent: 6, rentWithHouse: [30,90,270,400], rentWithHotel: 550, houseCost: 50, mortgageValue: 50 },
  { id: 7, name: 'Шанс', type: 'chance', color: 'bg-orange-200', textColor: 'text-orange-900', price: 0, baseRent: 0, rentWithHouse: [0,0,0,0], rentWithHotel: 0, houseCost: 0, mortgageValue: 0 },
  { id: 8, name: 'ул. Куйбышева', type: 'property', color: 'bg-sky-400', textColor: 'text-gray-900', price: 100, baseRent: 6, rentWithHouse: [30,90,270,400], rentWithHotel: 550, houseCost: 50, mortgageValue: 50 },
  { id: 9, name: 'Мичурина', type: 'property', color: 'bg-sky-400', textColor: 'text-gray-900', price: 120, baseRent: 8, rentWithHouse: [40,100,300,450], rentWithHotel: 600, houseCost: 50, mortgageValue: 60 },
  { id: 10, name: 'ТЮРЬМА', type: 'jail', color: 'bg-gray-200', textColor: 'text-gray-800', price: 0, baseRent: 0, rentWithHouse: [0,0,0,0], rentWithHotel: 0, houseCost: 0, mortgageValue: 0 },
  { id: 11, name: 'Галактионовская', type: 'property', color: 'bg-pink-400', textColor: 'text-gray-900', price: 140, baseRent: 10, rentWithHouse: [50,150,450,625], rentWithHotel: 750, houseCost: 100, mortgageValue: 70 },
  { id: 12, name: 'Водоканал', type: 'utility', color: 'bg-gray-300', textColor: 'text-gray-900', price: 150, baseRent: 4, rentWithHouse: [0,0,0,0], rentWithHotel: 0, houseCost: 0, mortgageValue: 75, description: 'Аренда = 4 × кубики (1 комуналка) или 10 × кубики (2)' },
  { id: 13, name: 'Купеческая', type: 'property', color: 'bg-pink-400', textColor: 'text-gray-900', price: 140, baseRent: 10, rentWithHouse: [50,150,450,625], rentWithHotel: 750, houseCost: 100, mortgageValue: 70 },
  { id: 14, name: 'Некрасовская', type: 'property', color: 'bg-pink-400', textColor: 'text-gray-900', price: 160, baseRent: 12, rentWithHouse: [60,180,500,700], rentWithHotel: 900, houseCost: 100, mortgageValue: 80 },
  { id: 15, name: 'Речной Вокзал', type: 'railroad', color: 'bg-gray-800', textColor: 'text-white', price: 200, baseRent: 25, rentWithHouse: [0,0,0,0], rentWithHotel: 0, houseCost: 0, mortgageValue: 100 },
  { id: 16, name: 'ул. Полевая', type: 'property', color: 'bg-orange-400', textColor: 'text-gray-900', price: 180, baseRent: 14, rentWithHouse: [70,200,550,750], rentWithHotel: 950, houseCost: 100, mortgageValue: 90 },
  { id: 17, name: 'Казна', type: 'community', color: 'bg-blue-200', textColor: 'text-blue-900', price: 0, baseRent: 0, rentWithHouse: [0,0,0,0], rentWithHotel: 0, houseCost: 0, mortgageValue: 0 },
  { id: 18, name: 'Братьев Коростылевых', type: 'property', color: 'bg-orange-400', textColor: 'text-gray-900', price: 180, baseRent: 14, rentWithHouse: [70,200,550,750], rentWithHotel: 950, houseCost: 100, mortgageValue: 90 },
  { id: 19, name: 'Красноармейская', type: 'property', color: 'bg-orange-400', textColor: 'text-gray-900', price: 200, baseRent: 16, rentWithHouse: [80,220,600,800], rentWithHotel: 1000, houseCost: 100, mortgageValue: 100 },
  { id: 20, name: 'БЕСПЛАТНАЯ СТОЯНКА', type: 'free_parking', color: 'bg-gray-200', textColor: 'text-gray-800', price: 0, baseRent: 0, rentWithHouse: [0,0,0,0], rentWithHotel: 0, houseCost: 0, mortgageValue: 0 },
  { id: 21, name: 'ул. Осипенко', type: 'property', color: 'bg-red-500', textColor: 'text-white', price: 220, baseRent: 18, rentWithHouse: [90,250,700,875], rentWithHotel: 1050, houseCost: 150, mortgageValue: 110 },
  { id: 22, name: 'Шанс', type: 'chance', color: 'bg-orange-200', textColor: 'text-orange-900', price: 0, baseRent: 0, rentWithHouse: [0,0,0,0], rentWithHotel: 0, houseCost: 0, mortgageValue: 0 },
  { id: 23, name: 'ул. Садовая', type: 'property', color: 'bg-red-500', textColor: 'text-white', price: 220, baseRent: 18, rentWithHouse: [90,250,700,875], rentWithHotel: 1050, houseCost: 150, mortgageValue: 110 },
  { id: 24, name: 'Аэродромная', type: 'property', color: 'bg-red-500', textColor: 'text-white', price: 240, baseRent: 20, rentWithHouse: [100,300,750,925], rentWithHotel: 1100, houseCost: 150, mortgageValue: 120 },
  { id: 25, name: 'Автовокзал', type: 'railroad', color: 'bg-gray-800', textColor: 'text-white', price: 200, baseRent: 25, rentWithHouse: [0,0,0,0], rentWithHotel: 0, houseCost: 0, mortgageValue: 100 },
  { id: 26, name: 'пр. Ленина', type: 'property', color: 'bg-yellow-400', textColor: 'text-gray-900', price: 260, baseRent: 22, rentWithHouse: [110,330,800,975], rentWithHotel: 1150, houseCost: 150, mortgageValue: 130 },
  { id: 27, name: 'ул. Спортивная', type: 'property', color: 'bg-yellow-400', textColor: 'text-gray-900', price: 260, baseRent: 22, rentWithHouse: [110,330,800,975], rentWithHotel: 1150, houseCost: 150, mortgageValue: 130 },
  { id: 28, name: 'Электросети', type: 'utility', color: 'bg-gray-300', textColor: 'text-gray-900', price: 150, baseRent: 4, rentWithHouse: [0,0,0,0], rentWithHotel: 0, houseCost: 0, mortgageValue: 75, description: 'Аренда = 4 × кубики (1 комуналка) или 10 × кубики (2)' },
  { id: 29, name: 'Арцыбушевская', type: 'property', color: 'bg-yellow-400', textColor: 'text-gray-900', price: 280, baseRent: 24, rentWithHouse: [120,360,850,1025], rentWithHotel: 1200, houseCost: 150, mortgageValue: 140 },
  { id: 30, name: 'ИДИ В ТЮРЬМУ', type: 'go_to_jail', color: 'bg-gray-200', textColor: 'text-gray-800', price: 0, baseRent: 0, rentWithHouse: [0,0,0,0], rentWithHotel: 0, houseCost: 0, mortgageValue: 0 },
  { id: 31, name: 'ул. Ново-Садовая', type: 'property', color: 'bg-green-600', textColor: 'text-white', price: 300, baseRent: 26, rentWithHouse: [130,390,900,1100], rentWithHotel: 1275, houseCost: 200, mortgageValue: 150 },
  { id: 32, name: 'ул. Стара-Загора', type: 'property', color: 'bg-green-600', textColor: 'text-white', price: 300, baseRent: 26, rentWithHouse: [130,390,900,1100], rentWithHotel: 1275, houseCost: 200, mortgageValue: 150 },
  { id: 33, name: 'Казна', type: 'community', color: 'bg-blue-200', textColor: 'text-blue-900', price: 0, baseRent: 0, rentWithHouse: [0,0,0,0], rentWithHotel: 0, houseCost: 0, mortgageValue: 0 },
  { id: 34, name: 'ул. Мичурина', type: 'property', color: 'bg-green-600', textColor: 'text-white', price: 320, baseRent: 28, rentWithHouse: [150,450,1000,1200], rentWithHotel: 1400, houseCost: 200, mortgageValue: 160 },
  { id: 35, name: 'Аэропорт Курумоч', type: 'railroad', color: 'bg-gray-800', textColor: 'text-white', price: 200, baseRent: 25, rentWithHouse: [0,0,0,0], rentWithHotel: 0, houseCost: 0, mortgageValue: 100 },
  { id: 36, name: 'Шанс', type: 'chance', color: 'bg-orange-200', textColor: 'text-orange-900', price: 0, baseRent: 0, rentWithHouse: [0,0,0,0], rentWithHotel: 0, houseCost: 0, mortgageValue: 0 },
  { id: 37, name: 'ул. Фрунзе', type: 'property', color: 'bg-blue-700', textColor: 'text-white', price: 350, baseRent: 35, rentWithHouse: [175,500,1100,1300], rentWithHotel: 1500, houseCost: 200, mortgageValue: 175 },
  { id: 38, name: 'Налог на роскошь', type: 'tax', color: 'bg-gray-100', textColor: 'text-gray-800', price: 0, baseRent: 0, rentWithHouse: [0,0,0,0], rentWithHotel: 0, houseCost: 0, mortgageValue: 0, description: 'Заплатите 100₽' },
  { id: 39, name: 'ул. Советской Армии', type: 'property', color: 'bg-blue-700', textColor: 'text-white', price: 400, baseRent: 50, rentWithHouse: [200,600,1400,1700], rentWithHotel: 2000, houseCost: 200, mortgageValue: 200 },
]

export function getSpaceById(id: number): ISpaceData | undefined {
  return BOARD_CONFIG.find(s => s.id === id)
}