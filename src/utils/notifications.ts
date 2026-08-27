/**
 * Thin wrapper around the browser Notification API. Fires real OS-level
 * notifications while the app tab is open. This does NOT cover true push
 * when the tab/browser is fully closed — that would require a Service
 * Worker + Push API + VAPID keys + a backend push sender, which is a
 * separate, larger undertaking.
 */

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!isNotificationSupported()) return 'unsupported';
  try {
    const result = await Notification.requestPermission();
    return result;
  } catch {
    return Notification.permission;
  }
}

export function sendBrowserNotification(title: string, options?: NotificationOptions): void {
  if (!isNotificationSupported()) return;
  if (Notification.permission !== 'granted') return;
  try {
    const n = new Notification(title, {
      icon: '/favicon.ico',
      ...options,
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch (err) {
    console.error('sendBrowserNotification error:', err);
  }
}
