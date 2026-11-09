import app from "ags/gtk4/app"
import { Astal, Gtk } from "ags/gtk4"
import { createState, For } from "ags"
import { timeout } from "ags/time"
import Notifd from "gi://AstalNotifd"
import NotificationCard from "./NotificationCard"

const notifd = Notifd.get_default()
const [popups, setPopups] = createState<Notifd.Notification[]>([])
const remove = (id: number) => setPopups(popups.get().filter((n) => n.id !== id))

notifd.connect("notified", (_, id: number) => {
  if (notifd.dontDisturb) return
  const n = notifd.get_notification(id)
  if (!n) return
  setPopups([n, ...popups.get().filter((x) => x.id !== id)].slice(0, 3))
  timeout(5000, () => remove(id))
})
notifd.connect("resolved", (_, id: number) => remove(id))

export default function NotificationPopups() {
  const { TOP, RIGHT } = Astal.WindowAnchor
  return (
    <window
      name="notification-popups"
      class="NotificationPopups"
      anchor={TOP | RIGHT}
      visible={popups((p) => p.length > 0)}
      application={app}
    >
      <box orientation={Gtk.Orientation.VERTICAL} spacing={8}>
        <For each={popups}>{(n) => <NotificationCard n={n} />}</For>
      </box>
    </window>
  )
}
