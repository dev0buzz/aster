import { createBinding } from "ags"
import Notifd from "gi://AstalNotifd"

const notifd = Notifd.get_default()
export const appKey = (n: Notifd.Notification) =>
  (n.desktopEntry || n.appName || "").toLowerCase()

// Map of app id -> number of notifications not yet dismissed
export const unreadByApp = createBinding(notifd, "notifications")((ns) => {
  const m = new Map<string, number>()
  for (const n of ns) m.set(appKey(n), (m.get(appKey(n)) ?? 0) + 1)
  return m
})
