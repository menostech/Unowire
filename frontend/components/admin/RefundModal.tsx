'use client';

export interface RefundModalProps {
  orderId: number;
  order: { id: number; amount_cents: number; currency: string; status: string; gateway: string; gateway_order_id: string | null; created_at: string; updated_at: string; payments: { id: number; type: string; status: string; amount_cents: number; gateway_payment_id: string | null; created_at: string }[] };
  onClose: () => void;
  onSuccess: () => void;
}

export function RefundModal({ orderId, order, onClose, onSuccess }: RefundModalProps) {
  return <div className="text-sm text-gray-500">Refund modal (Task 8 will implement)</div>;
}
