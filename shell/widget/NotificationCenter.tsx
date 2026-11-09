import app from "ags/gtk4/app"
import { Astal, Gtk } from "ags/gtk4"
import { createBinding, createState, For } from "ags"
import Notifd from "gi://AstalNotifd"
import NotificationCard from "./NotificationCard"
import { appKey } from "../lib/unread"

const notifd = Notifd.get_default()
const V = Gtk.Orientation.VERTICAL

export function toggleCenter() {
  const w = app.get_window("notification-center")
  if (w) w.visible = !w.visible
}

function Group({ items }: { items: Notifd.Notification[] }) {
  const [open, setOpen] = createState(false)
  const first = items[0]
  return (
    <box class="group" orientation={V} spacing={6}>
      <box class="group-header">
        <label class="group-title" label={first.appName || "Notification"} hexpand xalign={0} />
        <button class="group-toggle" visible={items.length > 1} onClicked={() => setOpen(!open.get())}>
          <label label={open((o) => (o ? "Show less" : `${items.length - 1} more`))} />
        </button>
        <button class="group-clear" onClicked={() => items.forEach((n) => n.dismiss())}>
          <image iconName="window-close-symbolic" />
        </button>
      </box>
      <NotificationCard n={first} />
      <box orientation={V} spacing={6} visible={open}>
        {items.slice(1).map((n) => <NotificationCard n={n} />)}
      </box>
    </box>
  )
}

export default function NotificationCenter() {
  const { TOP, RIGHT, BOTTOM } = Astal.WindowAnchor
  const list = createBinding(notifd, "notifications")
  const dnd = createBinding(notifd, "dontDisturb")

  // newest app first; inside each app, newest notification first
  const groups = list((ns) => {
    const m = new Map<string, Notifd.Notification[]>()
    for (const n of [...ns].sort((a, b) => b.time - a.time)) {
      const k = appKey(n)
      m.set(k, [...(m.get(k) ?? []), n])
    }
    return [...m.values()]
  })

  return (
    <window
      name="notification-center"
      class="NotificationCenter"
      anchor={TOP | RIGHT | BOTTOM}
      visible={false}
      application={app}
    >
      <box class="center" orientation={V} widthRequest={380}>
        <box class="center-header">
          <label class="title" label="Notifications" hexpand xalign={0} />
          <label class="dnd-label" label="Do Not Disturb" />
          <Gtk.Switch
            valign={Gtk.Align.CENTER}
            active={dnd}
            onNotifyActive={(s: Gtk.Switch) => (notifd.dontDisturb = s.active)}
          />
        </box>
        <Gtk.ScrolledWindow vexpand hscrollbarPolicy={Gtk.PolicyType.NEVER}>
          <box orientation={V} spacing={12}>
            <For each={groups}>{(items) => <Group items={items} />}</For>
          </box>
        </Gtk.ScrolledWindow>
        <label class="empty" label="No notifications" visible={list((ns) => ns.length === 0)} />
        <button class="clear" onClicked={() => notifd.notifications.forEach((n) => n.dismiss())}>
          <label label="Clear All" />
        </button>
      </box>
    </window>
  )
}
