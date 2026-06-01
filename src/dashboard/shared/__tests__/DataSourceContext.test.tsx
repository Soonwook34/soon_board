/// @vitest-environment jsdom
// US-1 — DataSource context 주입 + provider 밖 호출 가드.

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { DataSourceProvider, useDataSource } from '../DataSourceContext';
import type { DataSource } from '../../../shared/DataSource';

afterEach(cleanup);

function Probe() {
  const ds = useDataSource();
  return <div>{String(ds.getDisplayTime().valueOf())}</div>;
}

const fakeDs = { getDisplayTime: () => new Date(1234) } as unknown as DataSource;

describe('DataSourceContext', () => {
  it('provider 안에서 ds 주입', () => {
    render(
      <DataSourceProvider ds={fakeDs}>
        <Probe />
      </DataSourceProvider>,
    );
    expect(screen.getByText('1234')).toBeTruthy();
  });

  it('provider 밖에서 useDataSource → throw', () => {
    expect(() => render(<Probe />)).toThrow(/DataSourceProvider/);
  });
});
