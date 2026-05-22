/// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { Route, Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { ReplayScreen } from '../ReplayScreen';
import { _resetCatalogStore } from '../../main/stores/catalogStore';

afterEach(() => {
  cleanup();
  _resetCatalogStore();
  vi.restoreAllMocks();
});

describe('ReplayScreen — CORS gate (critic P0-4)', () => {
  it('renders CorsFailedNotice and does NOT mount dashboard placeholder when ping fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const pingImpl = vi.fn(async () => false);
    const { hook } = memoryLocation({ path: '/replay/9472', record: true });
    render(
      <Router hook={hook}>
        <Route path="/replay/:key">{() => <ReplayScreen pingImpl={pingImpl} />}</Route>
      </Router>,
    );
    await waitFor(() => expect(pingImpl).toHaveBeenCalledTimes(1));
    expect(await screen.findByTestId('cors-failed-notice')).toBeTruthy();
    expect(screen.queryByTestId('dashboard-placeholder')).toBeNull();
  });
});
