import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockUpdate = vi.fn();
const mockInsert = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'request_items') {
        return {
          select: mockSelect.mockReturnValue({
            eq: mockEq,
          }),
        };
      }
      if (table === 'requests') {
        return {
          update: mockUpdate.mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
      if (table === 'requerimiento_evento') {
        return { insert: mockInsert.mockResolvedValue({ error: null }) };
      }
      return {};
    }),
  },
}));

import { recalcRequestStatus } from '../recalcRequestStatus';

describe('recalcRequestStatus', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient();
    vi.spyOn(queryClient, 'invalidateQueries').mockImplementation(async () => {});
  });

  it('returns early for rechazado status without any DB calls', async () => {
    await recalcRequestStatus('req-1', 'rechazado', 'user-1', 'comp-1', queryClient);

    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
  });

  it('returns early when no items exist', async () => {
    mockEq.mockResolvedValue({ data: [], error: null });

    await recalcRequestStatus('req-1', 'pendiente', 'user-1', 'comp-1', queryClient);

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
  });

  it('transitions to procesado_total when all items are recibido', async () => {
    mockEq.mockResolvedValue({
      data: [{ status: 'recibido' }, { status: 'recibido' }],
      error: null,
    });

    await recalcRequestStatus('req-1', 'pendiente', 'user-1', 'comp-1', queryClient);

    expect(mockUpdate).toHaveBeenCalledWith({ status: 'procesado_total' });
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      request_id: 'req-1',
      tipo: 'procesado_total',
    }));
    expect(queryClient.invalidateQueries).toHaveBeenCalled();
  });

  it('transitions to pendiente when all items are sin_pedir', async () => {
    mockEq.mockResolvedValue({
      data: [{ status: 'sin_pedir' }, { status: 'sin_pedir' }],
      error: null,
    });

    await recalcRequestStatus('req-1', 'procesado_parcial', 'user-1', 'comp-1', queryClient);

    expect(mockUpdate).toHaveBeenCalledWith({ status: 'pendiente' });
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      tipo: 'pendiente',
    }));
  });

  it('transitions to procesado_parcial for mixed items', async () => {
    mockEq.mockResolvedValue({
      data: [{ status: 'sin_pedir' }, { status: 'recibido' }],
      error: null,
    });

    await recalcRequestStatus('req-1', 'pendiente', 'user-1', 'comp-1', queryClient);

    expect(mockUpdate).toHaveBeenCalledWith({ status: 'procesado_parcial' });
  });

  it('does not update when computed status equals current status', async () => {
    mockEq.mockResolvedValue({
      data: [{ status: 'sin_pedir' }, { status: 'recibido' }],
      error: null,
    });

    await recalcRequestStatus('req-1', 'procesado_parcial', 'user-1', 'comp-1', queryClient);

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
    expect(queryClient.invalidateQueries).toHaveBeenCalled();
  });

  it('logs error and returns when item fetch fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockEq.mockResolvedValue({ data: null, error: { message: 'network error' } });

    await recalcRequestStatus('req-1', 'pendiente', 'user-1', 'comp-1', queryClient);

    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to fetch items for auto-transition:',
      expect.anything()
    );
    expect(mockUpdate).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('logs error but does not throw when status update fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockEq.mockResolvedValue({
      data: [{ status: 'recibido' }],
      error: null,
    });

    const { supabase } = await import('@/integrations/supabase/client');
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'request_items') {
        return { select: mockSelect.mockReturnValue({ eq: mockEq }) } as any;
      }
      if (table === 'requests') {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: { message: 'update failed' } }),
          }),
        } as any;
      }
      return {} as any;
    });

    await recalcRequestStatus('req-1', 'pendiente', 'user-1', 'comp-1', queryClient);

    expect(consoleSpy).toHaveBeenCalledWith('Auto-transition failed:', expect.anything());
    consoleSpy.mockRestore();
  });
});
