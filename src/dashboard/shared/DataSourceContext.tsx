// dashboard §5 — 단일 DataSource 인스턴스를 맵 + 모든 패널에 주입하는 React Context.
// 라이브/리플레이 화면이 자신의 DataSource(Live/Replay)를 Provider 로 감싸고, 패널들은
// useDataSource() 로 받는다. 인스턴스가 하나라 중복 fetch 없음 (§5).

import { createContext, useContext, type ReactNode } from 'react';
import type { DataSource } from '../../shared/DataSource';

const DataSourceContext = createContext<DataSource | null>(null);

export function DataSourceProvider({ ds, children }: { ds: DataSource; children: ReactNode }) {
  return <DataSourceContext.Provider value={ds}>{children}</DataSourceContext.Provider>;
}

export function useDataSource(): DataSource {
  const ds = useContext(DataSourceContext);
  if (!ds) throw new Error('useDataSource must be used within a DataSourceProvider');
  return ds;
}
