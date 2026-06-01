// dashboard public API. 라이브/리플레이 화면이 DataSourceProvider 로 ds 를 주입하고
// DashboardApp 을 렌더한다 (화면 wiring 은 다음 통합 마일스톤).

export { DashboardApp, type DashboardAppProps } from './DashboardApp';
export { DataSourceProvider, useDataSource } from './shared/DataSourceContext';
export {
  DriversProvider,
  useDrivers,
  useSessionDrivers,
  teamColorOf,
  type DriversMap,
} from './shared/DriversContext';
export type { DashboardMode } from './panels/SessionHeader';
export {
  selectDriver,
  clearSelection,
  getSelectedDriver,
  useSelectedDriver,
} from './shared/selectionStore';
