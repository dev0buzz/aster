import { Gtk } from "ags/gtk4"
import GLib from "gi://GLib"
import Notifd from "gi://AstalNotifd"

const hhmm = (t: number) => GLib.DateTime.new_from_unix_local(t).format("%H:%M") ?? ""
const isPath = (s: string) => s.startsWith("/") || s.startsWith("file://")

// Sender picture (e.g. a Telegram avatar): a file path or an icon name
function Thumb({ n }: { n: Notifd.Notification }) {
  if (!n.image) return <box visible={false} />
  return isPath(n.image)
    ? <image class="thumb" file={n.image.replace("file://", "")} pixelSize={40} valign={Gtk.Align.START} />
    : <image class="thumb" iconName={n.image} pixelSize={40} valign={Gtk.Align.START} />
}

export default function NotificationCard({ n }: { n: Notifd.Notification }) {
  const V = Gtk.Orientation.VERTICAL
  return (
    <box class="notif" orientation={V}>
      <box class="header">
        <image iconName={n.appIcon || n.desktopEntry || "dialog-information-symbolic"} pixelSize={16} />
        <label class="app" label={n.appName || "Notification"} hexpand xalign={0} />
        <label class="time" label={hhmm(n.time)} />
        <button class="close" onClicked={() => n.dismiss()}>
          <image iconName="window-close-symbolic" />
        </button>
      </box>
      <box spacing={10}>
        <Thumb n={n} />
        <box orientation={V} hexpand>
          <label class="summary" label={n.summary} xalign={0} wrap />
          <label class="body" label={n.body} xalign={0} wrap visible={n.body !== ""} />
        </box>
      </box>
      <box class="actions" spacing={6} visible={n.actions.length > 0}>
        {n.actions.map((a) => (
          <button hexpand onClicked={() => n.invoke(a.id)}>
            <label label={a.label} />
          </button>
        ))}
      </box>
    </box>
  )
}
