// 全局状态（单例）。渲染读取、actions 修改后调用 render 刷新。
export const state = {
  home: null,
  cwd: null,
  parent: null,
  entries: [],
  selected: new Set(),
  history: [],
  filter: '',
  sortBy: 'name',
  showHidden: localStorage.getItem('showHidden') === '1',
  clipboard: null, // { mode: 'copy'|'cut', items: [path] }
  tags: [], // 多关键字标签过滤（OR）
  lastSelected: null,
};
