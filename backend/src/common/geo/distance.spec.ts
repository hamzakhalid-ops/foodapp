import { boundingBox, straightLineKm } from './distance';

describe('straightLineKm', () => {
  it('is zero for the same point', () => {
    expect(
      straightLineKm({ latitude: 31.5, longitude: 74.3 }, { latitude: 31.5, longitude: 74.3 }),
    ).toBe(0);
  });

  it('matches the known Lahore–Karachi great-circle distance (~1,030 km)', () => {
    const km = straightLineKm(
      { latitude: 31.5204, longitude: 74.3587 },
      { latitude: 24.8607, longitude: 67.0011 },
    );
    expect(km).toBeGreaterThan(1020);
    expect(km).toBeLessThan(1040);
  });

  it('keeps points within the radius inside the bounding box', () => {
    const center = { latitude: 31.5204, longitude: 74.3587 };
    const box = boundingBox(center, 5);
    const east = { latitude: 31.5204, longitude: box.maxLongitude };
    expect(straightLineKm(center, east)).toBeGreaterThanOrEqual(4.99);
  });
});
