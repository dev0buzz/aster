import app from "ags/gtk4/app"
import Gio from "gi://Gio"
import style from "./style.scss"
import Bar from "./widget/Bar"
import NotificationPopups from "./widget/NotificationPopups"
import NotificationCenter from "./widget/NotificationCenter"
import OSD from "./widget/OSD"
import Dock from "./widget/Dock"
import Spotlight from "./widget/Spotlight"

// Follow the system colour scheme (set by aster-theme)
const iface = new Gio.Settings({ schema_id: "org.gnome.desktop.interface" })
function applyScheme() {
  const dark = iface.get_string("color-scheme") === "prefer-dark"
  for (const w of app.get_windows()) {
    if (dark) w.add_css_class("dark")
    else w.remove_css_class("dark")
  }
}

app.start({
  css: style,
  main() {
    app.get_monitors().map(Bar)
    NotificationPopups()
    NotificationCenter()
    OSD()
    Dock()
    Spotlight()
    iface.connect("changed::color-scheme", applyScheme)
    applyScheme()
  },
})
