import { canTransition, ORDER_TRANSITIONS } from './order-state-machine';

describe('order state machine', () => {
  it('follows the frozen primary lifecycle', () => {
    const path = [
      'PENDING',
      'RESTAURANT_ACCEPTED',
      'PREPARING',
      'READY_FOR_PICKUP',
      'RIDER_ASSIGNED',
      'PICKED_UP',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
    ] as const;
    path.slice(1).forEach((to, index) => {
      expect(canTransition(path[index] ?? 'DELIVERED', to)).toBe(true);
    });
  });

  it('never skips a step or goes backwards', () => {
    expect(canTransition('PENDING', 'PREPARING')).toBe(false);
    expect(canTransition('PREPARING', 'RESTAURANT_ACCEPTED')).toBe(false);
    expect(canTransition('READY_FOR_PICKUP', 'PICKED_UP')).toBe(false);
    expect(canTransition('OUT_FOR_DELIVERY', 'PENDING')).toBe(false);
  });

  it('allows cancellation only for the permitted actor per state', () => {
    expect(canTransition('PENDING', 'CANCELLED_BY_RESTAURANT')).toBe(true);
    expect(canTransition('RESTAURANT_ACCEPTED', 'CANCELLED_BY_RESTAURANT')).toBe(false);
    expect(canTransition('RESTAURANT_ACCEPTED', 'CANCELLED_BY_CUSTOMER')).toBe(true);
    expect(canTransition('PREPARING', 'CANCELLED_BY_CUSTOMER')).toBe(false);
    for (const state of [
      'PENDING',
      'PREPARING',
      'READY_FOR_PICKUP',
      'RIDER_ASSIGNED',
      'PICKED_UP',
      'OUT_FOR_DELIVERY',
    ] as const) {
      expect(canTransition(state, 'CANCELLED_BY_ADMIN')).toBe(true);
    }
  });

  it('treats delivered and cancelled orders as final', () => {
    for (const state of [
      'DELIVERED',
      'CANCELLED_BY_CUSTOMER',
      'CANCELLED_BY_RESTAURANT',
      'CANCELLED_BY_ADMIN',
    ] as const) {
      expect(ORDER_TRANSITIONS[state]).toEqual([]);
    }
  });
});
