import app from "ags/gtk4/app"
import { Astal, Gtk } from "ags/gtk4"
import { createBinding, createState, For } from "ags"
import { execAsync } from "ags/process"
import GLib from "gi://GLib"
import Gio from "gi://Gio"
import Hyprland from "gi://AstalHyprland"

const hypr = Hyprland.get_default()
const V = Gtk.Orientation.VERTICAL

// ---------- pinned apps, saved in ~/.config/aster/dock.json ----------
const CONF_DIR = `${GLib.get_user_config_dir()}/aster`
const CONF = `${CONF_DIR}/dock.json`
const DEFAULT_PINNED = ["org.mozilla.firefox", "org.gnome.Nautilus", "kitty"]

function loadPinned(): string[] {
  try {
    const [ok, bytes] = GLib.file_get_contents(CONF)
    if (ok) return JSON.parse(new TextDecoder().decode(bytes)).pinned
  } catch {}
  return DEFAULT_PINNED
}
function savePinned(list: string[]) {
  GLib.mkdir_with_parents(CONF_DIR, 0o755)
  GLib.file_set_contents(CONF, JSON.stringify({ pinned: list }, null, 2))
}

// ---------- helpers ----------
const same = (a?: string | null, b?: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase()

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

const windowsOf = (id: string) => hypr.get_clients().filter((c) => same(c.class, id))
const dispatch = (lua: string) => execAsync(["hyprctl", "dispatch", lua]).catch(console.error)

function focusClient(c: Hyprland.Client) {
  const addr = c.address.startsWith("0x") ? c.address : `0x${c.address}`
  dispatch(`hl.dsp.focus({ window = "address:${addr}" })`)
  dispatch(`hl.dsp.window.bring_to_top()`)
}

// ---------- dock contents ----------
const [pinned, setPinnedState] = createState<string[]>(loadPinned())
type Item = { id: string; sep?: boolean }
const [items, setItems] = createState<Item[]>([])

function refresh() {
  const p = pinned.get()
  const running: string[] = []
  for (const c of hypr.get_clients())
    if (c.class && !running.some((r) => same(r, c.class))) running.push(c.class)
  const extra = running.filter((r) => !p.some((x) => same(x, r)))
  setItems([
    ...p.map((id) => ({ id })),
    ...(extra.length ? [{ id: "__sep__", sep: true }] : []),
    ...extra.map((id) => ({ id })),
  ])
}
function setPinned(list: string[]) {
  setPinnedState(list)
  savePinned(list)
  refresh()
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
  const wins = createBinding(hypr, "clients")((cs) => cs.filter((c) => same(c.class, id)))

  const onClick = () => {
    const list = windowsOf(id)
    if (list.length === 0) return launch(id)
    const f = hypr.focusedClient
    const i = list.findIndex((c) => f && c.address === f.address)
    focusClient(list[(i + 1) % list.length]) // not focused -> first; focused -> next
  }

  return (
    <box class="dock-item" orientation={V} $={(self: Gtk.Box) => attachMenu(self, id)}>
      <button class="dock-btn" tooltipText={info?.get_name() ?? id} onClicked={onClick}>
        {info ? <image gicon={info.get_icon()!} pixelSize={48} /> : <image iconName="application-x-executable" pixelSize={48} />}
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
    >
      <box class="dock" spacing={4}>
        <For each={items}>
          {(it) => (it.sep ? <Gtk.Separator orientation={V} class="dock-sep" /> : <DockItem id={it.id} />)}
        </For>
      </box>
    </window>
  )
}
