import { ALL_API_ERROR_CODES } from './api';
import { ORDER_STATUSES } from './order';
import { ROLES } from './roles';

// Guards against accidental edits to frozen vocabulary (CLAUDE.md §5, §12).
describe('frozen vocabulary', () => {
  it('exposes exactly the six frozen roles', () => {
    expect(ROLES).toEqual([
      'CUSTOMER',
      'RESTAURANT_OWNER',
      'RESTAURANT_OPERATOR',
      'RIDER',
      'ADMIN',
      'SUPER_ADMIN',
    ]);
  });

  it('exposes the frozen order lifecycle followed by cancellation states', () => {
    expect(ORDER_STATUSES).toEqual([
      'PENDING',
      'RESTAURANT_ACCEPTED',
      'PREPARING',
      'READY_FOR_PICKUP',
      'RIDER_ASSIGNED',
      'PICKED_UP',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
      'CANCELLED_BY_CUSTOMER',
      'CANCELLED_BY_RESTAURANT',
      'CANCELLED_BY_ADMIN',
    ]);
  });

  it('has no duplicate API error codes', () => {
    expect(new Set(ALL_API_ERROR_CODES).size).toBe(ALL_API_ERROR_CODES.length);
  });
});
