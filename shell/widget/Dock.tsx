import app from "ags/gtk4/app"
import { Astal, Gtk } from "ags/gtk4"
import { createBinding, createState, For } from "ags"
import { execAsync } from "ags/process"
import GLib from "gi://GLib"
import Gio from "gi://Gio"
import Hyprland from "gi://AstalHyprland"
import { badges, findBadge } from "../lib/badges"
import GLib from "gi://GLib"

const hypr = Hyprland.get_default()
const V = Gtk.Orientation.VERTICAL

// ---------- pinned apps, saved in ~/.config/aster/dock.json ----------
const CONF_DIR = `${GLib.get_user_config_dir()}/aster`
const CONF = `${CONF_DIR}/dock.json`
const DEFAULT_PINNED = ["org.mozilla.firefox", "org.gnome.Nautilus", "kitty"]

type DockConf = { pinned: string[]; iconSize: number }
function loadConf(): DockConf {
  try {
    const [ok, bytes] = GLib.file_get_contents(CONF)
    if (ok) {
      const c = JSON.parse(new TextDecoder().decode(bytes))
      return { pinned: c.pinned ?? DEFAULT_PINNED, iconSize: c.iconSize ?? 48 }
    }
  } catch {}
  return { pinned: DEFAULT_PINNED, iconSize: 48 }
}
const conf = loadConf()
function saveConf() {
  GLib.mkdir_with_parents(CONF_DIR, 0o755)
  GLib.file_set_contents(CONF, JSON.stringify({ pinned: pinned.get(), iconSize: iconSize.get() }, null, 2))
}

// ---------- helpers ----------
const same = (a?: string | null, b?: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase()
// The Settings window belongs to the shell process; show it as "aster-settings"
const classOf = (c: Hyprland.Client) => (c.class === "io.Astal.ags" ? "aster-settings" : c.class)

function appInfo(id: string): Gio.DesktopAppInfo | null {
  // 1) exact desktop file: "<id>.desktop"
  for (const cand of [id, id.toLowerCase()]) {
    try {
      const i = Gio.DesktopAppInfo.new(`${cand}.desktop`)
      if (i) return i
    } catch {}
  }
  // 2) search all apps: StartupWMClass, or "something.<id>.desktop" (firefox -> org.mozilla.firefox)
  const lid = id.toLowerCase()
  for (const a of Gio.AppInfo.get_all()) {
    const d = a as Gio.DesktopAppInfo
    const appId = (d.get_id() ?? "").toLowerCase()
    const wm = (d.get_startup_wm_class?.() ?? "").toLowerCase()
    if (wm === lid || appId === `${lid}.desktop` || appId.endsWith(`.${lid}.desktop`)) return d
  }
  return null
}

function launch(id: string) {
  const info = appInfo(id)
  // the app's own command, without desktop-file placeholders like %U / %F
  const cmd = (info?.get_commandline() ?? id).replace(/\s*%[fFuUdDnNickvm]/g, "").trim()
  dispatch(`hl.dsp.exec_cmd(${JSON.stringify(cmd)})`)
}

const windowsOf = (id: string) => hypr.get_clients().filter((c) => same(classOf(c), id))
const dispatch = (lua: string) => execAsync(["hyprctl", "dispatch", lua]).catch(console.error)

function focusClient(c: Hyprland.Client) {
  const addr = c.address.startsWith("0x") ? c.address : `0x${c.address}`
  dispatch(`hl.dsp.focus({ window = "address:${addr}" })`)
  dispatch(`hl.dsp.window.bring_to_top()`)
}

// ---------- dock contents ----------
const [pinned, setPinnedState] = createState<string[]>(conf.pinned)
const [iconSize, setIconSizeState] = createState<number>(conf.iconSize)
type Item = { id: string; sep?: boolean }
const [items, setItems] = createState<Item[]>([])

// Layer windows grow on their own but don't shrink: recompute after the list changes
let dockWin: Astal.Window | null = null
const shrinkDock = () =>
  GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => { dockWin?.set_default_size(1, 1); return false })

function refresh() {
  const p = pinned.get()
  const running: string[] = []
  for (const c of hypr.get_clients())
    if (classOf(c) && !running.some((r) => same(r, classOf(c)))) running.push(classOf(c))
  const extra = running.filter((r) => !p.some((x) => same(x, r)))
  setItems([
    ...p.map((id) => ({ id })),
    ...(extra.length ? [{ id: "__sep__", sep: true }] : []),
    ...extra.map((id) => ({ id })),
  ])
  shrinkDock()
}

function setPinned(list: string[]) {
  setPinnedState(list)
  saveConf()
  refresh()
}
function setIconSize(px: number) {
  setIconSizeState(px)
  saveConf()
  shrinkDock()
}

hypr.connect("notify::clients", refresh)
hypr.connect("client-added", refresh)
hypr.connect("client-removed", refresh)
refresh()

// ---------- right-click menu (plain GTK) ----------
function attachMenu(anchor: Gtk.Widget, id: string) {
  const pop = new Gtk.Popover({ hasArrow: false })
  pop.set_parent(anchor)
  const box = new Gtk.Box({ orientation: V, spacing: 2 })
  box.add_css_class("dock-menu")
  pop.set_child(box)

  const add = (label: string, fn: () => void) => {
    const b = new Gtk.Button()
    b.set_child(new Gtk.Label({ label, xalign: 0 })) // left-aligned like a real menu
    b.connect("clicked", () => {
      pop.popdown()
      fn()
    })
    box.append(b)
  }

  const rebuild = () => {
    let child = box.get_first_child()
    while (child) {
      const next = child.get_next_sibling()
      box.remove(child)
      child = next
    }
    const title = new Gtk.Label({ label: appInfo(id)?.get_name() ?? id, xalign: 0 })
    title.add_css_class("dock-menu-title")
    box.append(title)
    add("New Window", () => launch(id))
    const isPinned = pinned.get().some((p) => same(p, id))
    add(isPinned ? "Remove from Dock" : "Keep in Dock", () =>
      setPinned(isPinned ? pinned.get().filter((p) => !same(p, id)) : [...pinned.get(), id]),
    )
    if (windowsOf(id).length > 0) {
      box.append(new Gtk.Separator({ orientation: Gtk.Orientation.HORIZONTAL }))
      add("Quit", () => windowsOf(id).forEach((c) => execAsync(["kill", `${c.pid}`]).catch(console.error)))
    }
  }

  const g = new Gtk.GestureClick({ button: 3 })
  g.connect("pressed", () => {
    rebuild()
    pop.popup()
  })
  anchor.add_controller(g)
  anchor.connect("destroy", () => pop.unparent())
}

// ---------- one dock icon ----------
function DockItem({ id }: { id: string }) {
  const info = appInfo(id)
  const wins = createBinding(hypr, "clients")((cs) => cs.filter((c) => same(classOf(c), id)))
  const badge = badges((all) => findBadge(all, id))

  const onClick = () => {
    const list = windowsOf(id)
    if (list.length === 0) return launch(id)
    const f = hypr.focusedClient
    const i = list.findIndex((c) => f && c.address === f.address)
    focusClient(list[(i + 1) % list.length])
  }

  const icon = info
    ? <image gicon={info.get_icon()!} pixelSize={iconSize} />
    : <image iconName="application-x-executable" pixelSize={iconSize} />
  const count = (
    <label
      class="badge"
      halign={Gtk.Align.END}
      valign={Gtk.Align.START}
      label={badge((b) => (b.count > 99 ? "99+" : `${b.count}`))}
      visible={badge((b) => b.count > 0)}
    />
  )
  const bar = (
    <Gtk.ProgressBar
      class="dock-progress"
      valign={Gtk.Align.END}
      marginBottom={4}
      marginStart={6}
      marginEnd={6}
      fraction={badge((b) => b.progress ?? 0)}
      visible={badge((b) => b.progress !== null)}
    />
  )

  return (
    <box
      class={badge((b) => (b.urgent ? "dock-item urgent" : "dock-item"))}
      orientation={V}
      $={(self: Gtk.Box) => attachMenu(self, id)}
    >
      <button class="dock-btn" tooltipText={info?.get_name() ?? id} onClicked={onClick}>
        <Gtk.Overlay
          $={(o: Gtk.Overlay) => {
            o.set_child(icon as Gtk.Widget)
            o.add_overlay(count as Gtk.Widget)
            o.add_overlay(bar as Gtk.Widget)
          }}
        />
      </button>
      <box class="dot" halign={Gtk.Align.CENTER} visible={wins((w) => w.length > 0)} />
    </box>
  )
}

export default function Dock() {
  return (
    <window
      visible
      name="dock"
      class="Dock"
      anchor={Astal.WindowAnchor.BOTTOM}
      exclusivity={Astal.Exclusivity.EXCLUSIVE}
      marginBottom={6}
      application={app}
      $={(self: Astal.Window) => (dockWin = self)}
    >
      <box class="dock" spacing={4}>
        <For each={items}>
          {(it) => (it.sep ? <Gtk.Separator orientation={V} class="dock-sep" /> : <DockItem id={it.id} />)}
        </For>
      </box>
    </window>
  )
}

export { pinned, setPinned, iconSize, setIconSize, appInfo }
