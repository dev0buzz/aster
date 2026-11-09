import { createState } from "ags"
import Gio from "gi://Gio"
import GLib from "gi://GLib"
import Notifd from "gi://AstalNotifd"
import { appKey } from "./unread"

export type Badge = { count: number; progress: number | null; urgent: boolean }
type Entry = { count: number; countVisible: boolean; progress: number; progressVisible: boolean; urgent: boolean }

const notifd = Notifd.get_default()
const launcher = new Map<string, Entry>() // raw LauncherEntry state, by app id
const [badges, setBadges] = createState<Record<string, Badge>>({})
export { badges }

// "application://org.telegram.desktop.desktop" -> "org.telegram.desktop"
const idFromUri = (uri: string) => uri.replace(/^application:\/\//, "").replace(/\.desktop$/, "").toLowerCase()

function recompute() {
  const out: Record<string, Badge> = {}
  for (const [k, e] of launcher)
    out[k] = { count: e.countVisible ? e.count : 0, progress: e.progressVisible ? e.progress : null, urgent: e.urgent }
  // Fallback: apps without their own badge get their unread-notification count
  for (const n of notifd.notifications) {
    const k = appKey(n)
    if (!k || launcher.get(k)?.countVisible) continue
    const b = (out[k] ??= { count: 0, progress: null, urgent: false })
    b.count += 1
  }
  setBadges(out)
}

Gio.DBus.session.signal_subscribe(
  null, "com.canonical.Unity.LauncherEntry", "Update", null, null, Gio.DBusSignalFlags.NONE,
  (_c, _sender, _path, _iface, _signal, params: GLib.Variant) => {
    const [uri, props] = params.recursiveUnpack() as [string, Record<string, any>]
    const id = idFromUri(uri)
    const e = launcher.get(id) ?? { count: 0, countVisible: false, progress: 0, progressVisible: false, urgent: false }
    if ("count" in props) e.count = Number(props["count"])
    if ("count-visible" in props) e.countVisible = !!props["count-visible"]
    if ("progress" in props) e.progress = Number(props["progress"])
    if ("progress-visible" in props) e.progressVisible = !!props["progress-visible"]
    if ("urgent" in props) e.urgent = !!props["urgent"]
    launcher.set(id, e)
    recompute()
  },
)
notifd.connect("notify::notifications", recompute)
recompute()

// Match a dock id to a badge key: "firefox" ~ "org.mozilla.firefox"
const fits = (k: string, id: string) => k === id || id.endsWith(`.${k}`) || k.endsWith(`.${id}`)
export function findBadge(all: Record<string, Badge>, id: string): Badge {
  const lid = id.toLowerCase()
  const k = Object.keys(all).find((key) => fits(key, lid))
  return k ? all[k] : { count: 0, progress: null, urgent: false }
}
