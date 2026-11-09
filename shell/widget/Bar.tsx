import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { execAsync } from "ags/process"
import { createPoll } from "ags/time"
import { createBinding } from "ags"
import Gio from "gi://Gio"
import Hyprland from "gi://AstalHyprland"
import Notifd from "gi://AstalNotifd"
import { toggleCenter } from "./NotificationCenter"

const hypr = Hyprland.get_default()
const notifd = Notifd.get_default()

// "org.gnome.Nautilus" -> "Files", "firefox" -> "Firefox"
function appName(cls?: string | null): string {
  if (!cls) return "Aster"
  try {
    const info = Gio.DesktopAppInfo.new(`${cls}.desktop`)
    if (info) return info.get_name()
  } catch {}
  return cls.charAt(0).toUpperCase() + cls.slice(1)
}

function run(cmd: string) {
  execAsync(["sh", "-c", cmd]).catch(console.error)
}

function MenuItem({ label, cmd }: { label: string; cmd: string }) {
  return (
    <button onClicked={() => run(cmd)}>
      <label label={label} xalign={0} />
    </button>
  )
}

function AsterMenu() {
  return (
    <menubutton class="logo">
      <label label="❖" />
      <popover hasArrow={false}>
        <box class="menu" orientation={Gtk.Orientation.VERTICAL}>
          <MenuItem label="About This Computer" cmd="foot -e sh -c 'cat /etc/os-release; read'" />
          <MenuItem label="Settings…" cmd="foot" />
          <Gtk.Separator />
          <MenuItem label="Sleep" cmd="systemctl suspend" />
          <MenuItem label="Restart…" cmd="systemctl reboot" />
          <MenuItem label="Shut Down…" cmd="systemctl poweroff" />
          <Gtk.Separator />
          <MenuItem label="Log Out" cmd="hyprctl dispatch 'hl.dsp.exit()'" />
        </box>
      </popover>
    </menubutton>
  )
}

export default function Bar(gdkmonitor: Gdk.Monitor) {
  const { TOP, LEFT, RIGHT } = Astal.WindowAnchor
  const focused = createBinding(hypr, "focusedClient")
  const time = createPoll("", 1000, ["date", "+%a %-d %b  %H:%M"])

  return (
    <window
      visible
      name="aster-panel"
      class="Bar"
      gdkmonitor={gdkmonitor}
      exclusivity={Astal.Exclusivity.EXCLUSIVE}
      anchor={TOP | LEFT | RIGHT}
      application={app}
    >
      <centerbox>
        <box $type="start">
          <AsterMenu />
          <label class="app-name" label={focused((c) => appName(c?.class))} />
        </box>
        <box $type="center" />
        <box $type="end">
          <menubutton class="clock">
            <label label={time} />
            <popover hasArrow={false}>
              <Gtk.Calendar />
            </popover>
          </menubutton>
          <button class="bell" onClicked={toggleCenter}>
            <box spacing={4}>
              <image
                iconName={createBinding(notifd, "dontDisturb")((d) =>
                  d ? "notifications-disabled-symbolic" : "preferences-system-notifications-symbolic",
                )}
              />
              <label
                label={createBinding(notifd, "notifications")((ns) => `${ns.length}`)}
                visible={createBinding(notifd, "notifications")((ns) => ns.length > 0)}
              />
            </box>
          </button>
        </box>
      </centerbox>
    </window>
  )
}
