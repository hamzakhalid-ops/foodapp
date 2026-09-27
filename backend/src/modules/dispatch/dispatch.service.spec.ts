import { money } from '../../common/money/money';
import { pickWithinExpandingRadius } from './dispatch.service';

const settings = { initialRadius: money(2), radiusIncrement: money(1.5), maximumRadius: money(5) };

describe('pickWithinExpandingRadius', () => {
  it('prefers the nearest rider inside the initial radius', () => {
    expect(
      pickWithinExpandingRadius(
        [
          { riderId: 'far', distanceKm: 1.9 },
          { riderId: 'near', distanceKm: 0.4 },
        ],
        settings,
      ),
    ).toEqual({ riderId: 'near', distanceKm: 0.4, radiusKm: 2 });
  });

  it('widens by the increment and stops at the maximum', () => {
    expect(pickWithinExpandingRadius([{ riderId: 'a', distanceKm: 3.4 }], settings)).toMatchObject({
      radiusKm: 3.5,
    });
    expect(pickWithinExpandingRadius([{ riderId: 'a', distanceKm: 4.9 }], settings)).toMatchObject({
      radiusKm: 5,
    });
    expect(pickWithinExpandingRadius([{ riderId: 'a', distanceKm: 5.1 }], settings)).toBeNull();
    expect(pickWithinExpandingRadius([], settings)).toBeNull();
  });
});
