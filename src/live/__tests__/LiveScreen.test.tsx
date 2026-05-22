/// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Route, Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { LiveScreen } from '../LiveScreen';
import { _resetCatalogStore } from '../../main/stores/catalogStore';

afterEach(() => {
  cleanup();
  _resetCatalogStore();
  vi.restoreAllMocks();
});

function renderAtLive(pingImpl: () => Promise<boolean>) {
  const { hook } = memoryLocation({ path: '/live/9472', record: true });
  return render(
    <Router hook={hook}>
      <Route path="/live/:key">{(params) => <LiveScreen pingImpl={pingImpl} key={params.key} />}</Route>
    </Router>,
  );
}

describe('LiveScreen — CORS gate (critic P0-4)', () => {
  it('renders CorsFailedNotice when pingImpl resolves false', async () => {
    const pingImpl = vi.fn(async () => false);
    renderAtLive(pingImpl);
    await waitFor(() => expect(pingImpl).toHaveBeenCalledTimes(1));
    expect(await screen.findByTestId('cors-failed-notice')).toBeTruthy();
  });

  it('does NOT mount countdown overlay or live-map when ping fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const pingImpl = vi.fn(async () => false);
    renderAtLive(pingImpl);
    await screen.findByTestId('cors-failed-notice');
    // CountdownOverlay renders a role="dialog" — must not be in DOM
    expect(screen.queryByRole('dialog')).toBeNull();
    // No "Loading session…" leak past CORS gate
    expect(screen.queryByText(/Loading session/)).toBeNull();
  });

  it('re-invokes pingImpl when user clicks retry button', async () => {
    let callCount = 0;
    const pingImpl = vi.fn(async () => {
      callCount += 1;
      return false;
    });
    renderAtLive(pingImpl);
    await screen.findByTestId('cors-failed-notice');
    expect(callCount).toBe(1);
    await act(async () => {
      fireEvent.click(screen.getByText('다시 시도'));
    });
    await waitFor(() => expect(callCount).toBe(2));
  });
});
