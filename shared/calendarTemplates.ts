/* ============================================================
   Templates de calendário — presets prontos de settings de RPG
   (e o gregoriano). Aplicar um template é um retcon seguro: as
   datas internas (seriais) não mudam, só a exibição.
   ============================================================ */

import type { TimelineCalendar, TimelineMoon } from './timeline';
import { GREGORIAN_CALENDAR } from './timeline';

export interface CalendarTemplate {
  id: string;
  name: string;
  description: string;
  calendar: TimelineCalendar;
  moons: Omit<TimelineMoon, 'id'>[];
}

export const CALENDAR_TEMPLATES: CalendarTemplate[] = [
  {
    id: 'gregorian',
    name: 'Gregoriano',
    description: 'Calendário real, 12 meses, 365 dias, semana de 7 dias.',
    calendar: GREGORIAN_CALENDAR,
    moons: [{ name: 'Lua', cycleDays: 29.53, offset: 0, color: '#c9d1d9' }],
  },
  {
    id: 'harptos',
    name: 'Harptos (Reinos Esquecidos)',
    description:
      'Toril: 12 meses de 30 dias + 5 festivais intercalares (modelados como meses de 1 dia). Ano em CV (Cálculo dos Vales).',
    calendar: {
      months: [
        { name: 'Hammer', days: 30 },
        { name: 'Meados do Inverno', days: 1 },
        { name: 'Alturiak', days: 30 },
        { name: 'Ches', days: 30 },
        { name: 'Tarsakh', days: 30 },
        { name: 'Relvaverde', days: 1 },
        { name: 'Mirtul', days: 30 },
        { name: 'Kythorn', days: 30 },
        { name: 'Flamerule', days: 30 },
        { name: 'Meados do Verão', days: 1 },
        { name: 'Eleasis', days: 30 },
        { name: 'Eleint', days: 30 },
        { name: 'Alta-colheita', days: 1 },
        { name: 'Marpenoth', days: 30 },
        { name: 'Uktar', days: 30 },
        { name: 'Festa da Lua', days: 1 },
        { name: 'Nightal', days: 30 },
      ],
      weekDayNames: [],
      yearLabel: 'CV',
    },
    moons: [{ name: 'Selûne', cycleDays: 30.44, offset: 0, color: '#dfe6ee' }],
  },
  {
    id: 'exandria',
    name: 'Exandria (Tal’Dorei)',
    description: 'Critical Role: 11 meses, 328 dias, semana de 7 dias. Luas Catha e Ruidus.',
    calendar: {
      months: [
        { name: 'Horisal', days: 29 },
        { name: 'Misuthar', days: 30 },
        { name: 'Dualahei', days: 30 },
        { name: 'Thunsheer', days: 31 },
        { name: 'Unndilar', days: 28 },
        { name: 'Brussendar', days: 31 },
        { name: 'Sydenstar', days: 32 },
        { name: 'Fessuran', days: 29 },
        { name: 'Quen’pillar', days: 27 },
        { name: 'Cuersaar', days: 29 },
        { name: 'Duscar', days: 32 },
      ],
      weekDayNames: ['Miresen', 'Grissen', 'Whelsen', 'Conthsen', 'Folsen', 'Yulisen', 'Da’leysen'],
      yearLabel: 'p.D.',
    },
    moons: [
      { name: 'Catha', cycleDays: 30.4, offset: 0, color: '#dfe6ee' },
      { name: 'Ruidus', cycleDays: 328, offset: 0, color: '#d96a5f' },
    ],
  },
  {
    id: 'golarion',
    name: 'Golarion (Pathfinder)',
    description: 'Absalom Reckoning: 12 meses, semana de 7 dias, ano em AR.',
    calendar: {
      months: [
        { name: 'Abadius', days: 31 },
        { name: 'Calistril', days: 28 },
        { name: 'Pharast', days: 31 },
        { name: 'Gozran', days: 30 },
        { name: 'Desnus', days: 31 },
        { name: 'Sarenith', days: 30 },
        { name: 'Erastus', days: 31 },
        { name: 'Arodus', days: 31 },
        { name: 'Rova', days: 30 },
        { name: 'Lamashan', days: 31 },
        { name: 'Neth', days: 30 },
        { name: 'Kuthona', days: 31 },
      ],
      weekDayNames: ['Moonday', 'Toilday', 'Wealday', 'Oathday', 'Fireday', 'Starday', 'Sunday'],
      yearLabel: 'AR',
    },
    moons: [{ name: 'Somal', cycleDays: 28, offset: 0, color: '#c9d1d9' }],
  },
];
