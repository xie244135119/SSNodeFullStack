/**
 * 分组枚举示例(定死,不建表)
 *
 * 模板默认给 1 个示例分组 'demo'。column.category 存 key。
 * 真实项目按需在此增删分组(如多分组/多板块);动态增删再升为表。
 * 与 backend/src/modules/column/column-hall.ts 同口径(前后端各自声明,不建 packages/shared)。
 */
export interface ColumnHall {
  key: string;
  name: string;
  subtitle: string;
}

export const COLUMN_HALLS: ColumnHall[] = [
  { key: 'demo', name: '示例分组', subtitle: '示例动态' }
];

export const COLUMN_HALL_KEYS = COLUMN_HALLS.map((h) => h.key);

/** key → 名称 */
export const COLUMN_HALL_MAP = COLUMN_HALLS.reduce<Record<string, ColumnHall>>(
  (acc, h) => {
    acc[h.key] = h;
    return acc;
  },
  {}
);

/** 状态 enum(英文,与 DB/API 一致)+ 中文标签 + 语义色(AntD Tag preset) */
export type ColumnStatus = 'designing' | 'confirming' | 'done';

export const COLUMN_STATUS_OPTIONS: {
  value: ColumnStatus;
  label: string;
  color: string;
}[] = [
  { value: 'designing', label: '设计中', color: 'warning' },
  { value: 'confirming', label: '设计确认中', color: 'cyan' },
  { value: 'done', label: '设计完成', color: 'success' }
];

export const COLUMN_STATUS_MAP = COLUMN_STATUS_OPTIONS.reduce<
  Record<string, { label: string; color: string }>
>((acc, o) => {
  acc[o.value] = { label: o.label, color: o.color };
  return acc;
}, {});
