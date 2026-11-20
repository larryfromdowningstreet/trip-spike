// One realistic day of changes, to measure how much fits in a QR Code.
// Field names follow the spec's item fields; values are made up for testing.

const day = '2027-03-11';
const at = (time: string) => Date.parse(`${day}T${time}:00+09:00`);

const items = [
  { start: '08:30', type: 'gather', title: '飯店大廳集合', place: '京都車站附近飯店', addressLocal: '京都府京都市下京区東塩小路町', note: '帶護照' },
  { start: '09:10', end: '11:30', type: 'sight', title: '伏見稻荷大社', addressLocal: '京都府京都市伏見区深草藪之内町68', lat: 34.9671, lng: 135.7727, transport: 'JR 奈良線到稻荷站，約 5 分鐘' },
  { start: '12:00', end: '13:00', type: 'meal', title: '午餐：豆腐料理', addressLocal: '京都府京都市東山区', transport: '京阪電車到祇園四條', booking: '訂位代號 K7Q2', note: '4 人' },
  { start: '13:30', end: '15:30', type: 'sight', title: '清水寺', addressLocal: '京都府京都市東山区清水1丁目294', lat: 34.9949, lng: 135.785, transport: '步行約 20 分鐘' },
  { start: '15:40', end: '17:00', type: 'sight', title: '二年坂・三年坂散步', lat: 34.9965, lng: 135.7808 },
  { start: '17:30', end: '18:30', type: 'sight', title: '八坂神社', addressLocal: '京都府京都市東山区祇園町北側625', lat: 35.0037, lng: 135.7785 },
  { start: '19:00', end: '20:30', type: 'meal', title: '晚餐：京都燒肉', addressLocal: '京都府京都市中京区', transport: '步行約 10 分鐘', booking: '訂位代號 Y3M8' },
  { start: '21:00', type: 'stay', title: '回飯店', place: '京都車站附近飯店', addressLocal: '京都府京都市下京区東塩小路町', transport: '市營巴士 206 號' },
];

export const sample = {
  v: 1,
  trip: 'kyoto-2027',
  ops: items.map((value, i) => ({
    seq: i + 1,
    t: at('07:00') + i * 60_000,
    op: 'add',
    id: `d2-${i + 1}`,
    value: { date: day, owner: '小明', ...value },
  })),
};
