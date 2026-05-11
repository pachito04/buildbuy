export interface InventoryRow {
  quantity: number;
  reserved: number;
  min_stock: number;
}

export interface RemitoItem {
  quantity: number;
  quantity_delivered: number;
}

export interface ReceptionInput {
  accepted: number;
  rejected: number;
  pending: number;
}

export function availableStock(row: InventoryRow): number {
  return Math.max(0, row.quantity - row.reserved);
}

export function isLowStock(row: InventoryRow): boolean {
  return availableStock(row) <= row.min_stock;
}

export function reservationCalc(requested: number, available: number) {
  const toReserve = Math.min(requested, Math.max(0, available));
  const remaining = requested - toReserve;
  return {
    toReserve,
    remaining,
    hasStock: toReserve > 0,
    needsRfq: remaining > 0,
    fullyStocked: remaining === 0,
  };
}

export function dispatchCalc(item: RemitoItem, toDispatch: number) {
  const pending = item.quantity - item.quantity_delivered;
  const clamped = Math.min(Math.max(0, toDispatch), pending);
  return {
    pending,
    dispatched: clamped,
    newDelivered: item.quantity_delivered + clamped,
    remainingAfter: pending - clamped,
    isComplete: pending - clamped === 0,
  };
}

export function inventoryAfterDispatch(
  row: InventoryRow,
  dispatched: number
) {
  return {
    quantity: Math.max(0, row.quantity - dispatched),
    reserved: Math.max(0, row.reserved - dispatched),
  };
}

export function receptionValidation(input: ReceptionInput) {
  const total = input.accepted + input.rejected;
  return {
    valid: total <= input.pending && total > 0,
    overPending: total > input.pending,
    empty: total === 0,
    newQuantityReceived: input.accepted,
  };
}

export function inventoryAfterReception(
  currentQuantity: number,
  accepted: number
) {
  return currentQuantity + accepted;
}
