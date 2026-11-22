import { act, render, waitFor, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ constructor: vi.fn(), complete: null as null | (() => void) }));
vi.mock('@/components/constructor/Constructor', () => ({ Constructor: (props: unknown) => { mocks.constructor(props); return null; } }));
vi.mock('@/components/constructor/Onboarding', () => ({ Onboarding: ({ onComplete }: { onComplete: () => void }) => { mocks.complete = onComplete; return null; } }));
vi.mock('@/components/constructor/Login', () => ({ Login: () => null }));
vi.mock('@/lib/preview-mode', () => ({ isProjectPreview: () => true }));
import { Route } from '@/routes/index';

afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); mocks.constructor.mockClear(); mocks.complete = null; });
describe('Compile flag is required even on a Preview hostname', () => {
  it('disabled flag calls existing real session API and never mounts demo', async () => {
    vi.stubEnv('VITE_PREVIEW_DEMO', 'false');
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ user: { id: 'real-account', email: 'real@example.test' } }) });
    vi.stubGlobal('fetch', fetcher);
    const Entry = Route.options.component;
    if (typeof Entry !== 'function') throw new Error('Entry missing');
    render(<Entry />);
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' }));
    await waitFor(() => expect(mocks.complete).not.toBeNull());
    act(() => mocks.complete?.());
    await waitFor(() => expect(mocks.constructor).toHaveBeenCalledWith(expect.objectContaining({ userId: 'real-account', preview: false })));
  });
  it('enabled flag mounts isolated demo and makes zero auth requests', async () => {
    vi.stubEnv('VITE_PREVIEW_DEMO', 'true');
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const Entry = Route.options.component;
    if (typeof Entry !== 'function') throw new Error('Entry missing');
    render(<Entry />);
    await waitFor(() => expect(mocks.constructor).toHaveBeenCalledWith(expect.objectContaining({ userId: 'preview-demo-user', preview: true })));
    expect(fetcher).not.toHaveBeenCalled();
  });
});