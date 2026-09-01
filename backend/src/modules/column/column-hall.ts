/**
 * 分组枚举示例(定死,不建表)
 *
 * 模板默认给 1 个示例分组 'demo'。column_item.category 存 key。
 * 真实项目按需在此增删分组(如多分组/多板块);动态增删再升为表。
 *
 * 前端同款声明见 web/src/config/column-hall.config.ts(前后端各自声明,不建 packages/shared)。
 */
export interface ColumnHall {
  key: string;
  name: string;
  subtitle: string;
}

export const COLUMN_HALLS: ColumnHall[] = [
  { key: 'demo', name: '示例分组', subtitle: '示例动态' }
];

/** 合法分组 key 集合(校验用) */
export const COLUMN_HALL_KEYS = new Set(COLUMN_HALLS.map((h) => h.key));

export const isHallKey = (key: string): boolean => COLUMN_HALL_KEYS.has(key);
