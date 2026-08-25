import { describe, it, expect } from 'vitest';
import { generateGoogleCalendarUrl, generateICalSubscriptionUrl } from '../src/utils/calendar-links';

describe('Google Calendar & iCal Utilities', () => {
  it('should generate a valid 1-click Google Calendar TEMPLATE URL', () => {
    const url = generateGoogleCalendarUrl({
      title: 'Material A Delivery',
      description: 'Mesh upper delivery to factory',
      startDate: '2026-10-10T00:00:00.000Z',
      department: 'Production',
      isCritical: true,
    });

    expect(url).toContain('https://calendar.google.com/render?action=TEMPLATE');
    expect(url).toContain('text=%E2%9A%A1%20Material%20A%20Delivery');
    expect(url).toContain('dates=20261010T000000Z');
  });

  it('should generate an iCal subscription feed URL', () => {
    const feedUrl = generateICalSubscriptionUrl('user-123');
    expect(feedUrl).toContain('calendar-feed?token=user-123');
  });
});
