// System notifications: Android notification shade in the app (Capacitor), browser notifications on the web.
// shortcut: notifications are posted by the running app when it sees new data, so a fully closed app gets them
// on next open. True background push needs Firebase Cloud Messaging (google-services.json + server key).
import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { reportClient } from '../store/store'

export const isNative = Capacitor.isNativePlatform()
const KEY = 'medicub:notified'

/** Asks once (onboarding "Allow reminders"). Returns whether notifications may be shown. */
export async function askNotifyPermission(): Promise<boolean> {
  try {
    if (isNative) return (await LocalNotifications.requestPermissions()).display === 'granted'
    if ('Notification' in window) return (await Notification.requestPermission()) === 'granted'
  } catch (e) {
    reportClient('warn', 'notify.permission_failed', String(e))
  }
  return false
}

function seen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

/** Posts a system notification once per `key` (survives reloads). Never throws. */
export async function notifyOnce(key: string, title: string, body: string) {
  const done = seen()
  if (done.has(key)) return
  done.add(key)
  try {
    localStorage.setItem(KEY, JSON.stringify([...done].slice(-200)))
  } catch {
    /* worst case a notification repeats after reload */
  }
  try {
    if (isNative) {
      if ((await LocalNotifications.checkPermissions()).display !== 'granted') return
      // Android ids are 32-bit ints; derive a stable one from the key.
      let id = 0
      for (const ch of key) id = (id * 31 + ch.charCodeAt(0)) | 0
      await LocalNotifications.schedule({ notifications: [{ id: Math.abs(id) || 1, title, body }] })
    } else if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      new Notification(title, { body, tag: key })
    }
  } catch (e) {
    reportClient('warn', 'notify.failed', String(e))
  }
}
