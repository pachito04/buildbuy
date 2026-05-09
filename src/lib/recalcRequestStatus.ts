import { supabase } from '@/integrations/supabase/client';
import { QueryClient } from '@tanstack/react-query';

export async function recalcRequestStatus(
  requestId: string,
  currentStatus: string,
  userId: string | undefined,
  companyId: string | null,
  queryClient: QueryClient
): Promise<void> {
  if (currentStatus === 'rechazado') return;

  const { data: items, error } = await supabase
    .from('request_items')
    .select('status')
    .eq('request_id', requestId);

  if (error) {
    console.error('Failed to fetch items for auto-transition:', error);
    return;
  }

  if (!items || items.length === 0) return;

  const allRecibido = items.every(i => i.status === 'recibido');
  const allSinPedir = items.every(i => i.status === 'sin_pedir');

  const newStatus = allRecibido
    ? 'procesado_total'
    : allSinPedir
      ? 'pendiente'
      : 'procesado_parcial';

  if (newStatus === currentStatus) {
    queryClient.invalidateQueries({ queryKey: ['requests', companyId] });
    queryClient.invalidateQueries({ queryKey: ['request-detail', requestId] });
    return;
  }

  const { error: updateError } = await supabase
    .from('requests')
    .update({ status: newStatus as any })
    .eq('id', requestId);

  if (updateError) {
    console.error('Auto-transition failed:', updateError);
    return;
  }

  try {
    await supabase.from('requerimiento_evento').insert({
      request_id: requestId,
      tipo: newStatus,
      descripcion: 'Transicion automatica por actualizacion de items',
      created_by: userId ?? null,
    });
  } catch (e) {
    console.error('Failed to insert auto-transition event:', e);
  }

  queryClient.invalidateQueries({ queryKey: ['requests', companyId] });
  queryClient.invalidateQueries({ queryKey: ['request-detail', requestId] });
}
