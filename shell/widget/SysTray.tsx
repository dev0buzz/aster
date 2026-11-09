import { Gtk } from "ags/gtk4"
import { createBinding, For } from "ags"
import Tray from "gi://AstalTray"

const tray = Tray.get_default()

// Hook each tray app's D-Bus menu into a GTK menubutton
function setup(btn: Gtk.MenuButton, item: Tray.TrayItem) {
  btn.menuModel = item.menuModel
  btn.insert_action_group("dbusmenu", item.actionGroup)
  item.connect("notify::action-group", () => {
    btn.insert_action_group("dbusmenu", item.actionGroup)
  })
  item.connect("notify::menu-model", () => {
    btn.menuModel = item.menuModel
  })
}

export default function SysTray() {
  const items = createBinding(tray, "items")
  return (
    <box class="tray" spacing={2}>
      <For each={items}>
        {(item) => (
          <menubutton
            class="tray-item"
            tooltipMarkup={createBinding(item, "tooltipMarkup")}
            $={(self: Gtk.MenuButton) => setup(self, item)}
          >
            <image gicon={createBinding(item, "gicon")} pixelSize={16} />
          </menubutton>
        )}
      </For>
    </box>
  )
}
