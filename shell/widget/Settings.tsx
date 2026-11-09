import { pinned, setPinned, iconSize, setIconSize, appInfo } from "./Dock"
import app from "ags/gtk4/app"
import { Gtk, Gdk } from "ags/gtk4"
import { createState, For } from "ags"
import { execAsync } from "ags/process"
import GLib from "gi://GLib"
import Gio from "gi://Gio"
import GdkPixbuf from "gi://GdkPixbuf"

const V = Gtk.Orientation.VERTICAL
const HOME = GLib.get_home_dir()
const WALL = `${HOME}/aster/wallpapers`
const THEME = `${HOME}/aster/config/scripts/aster-theme`
const sh = (c: string) => execAsync(["sh", "-c", c]).catch(console.error)

// ---------- current light/dark ----------
const iface = new Gio.Settings({ schema_id: "org.gnome.desktop.interface" })
const isDark = () => iface.get_string("color-scheme") === "prefer-dark"
const [dark, setDark] = createState(isDark())
iface.connect("changed::color-scheme", () => setDark(isDark()))

// ---------- wallpapers ----------
function listWallpapers(): string[] {
  const out: string[] = []
  try {
    const en = Gio.File.new_for_path(WALL).enumerate_children("standard::name", Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null)
    let info: Gio.FileInfo | null
    while ((info = en.next_file(null))) {
      const n = info.get_name()
      if (n.endsWith(".jpg") && n !== "light.jpg" && n !== "dark.jpg") out.push(n)
    }
  } catch {}
  return out.sort()
}
const readPick = (mode: string) => {
  try { return GLib.file_read_link(`${WALL}/${mode}.jpg`) } catch { return "" }
}
const [lightPick, setLightPick] = createState(readPick("light"))
const [darkPick, setDarkPick] = createState(readPick("dark"))

// Small cached thumbnails (the originals are 5-20 MB each)
const thumbs = new Map<string, Gdk.Texture>()
function thumb(name: string): Gdk.Texture | null {
  if (!name) return null
  let t = thumbs.get(name)
  if (!t) {
    const pb = GdkPixbuf.Pixbuf.new_from_file_at_scale(`${WALL}/${name}`, 320, 200, true)
    t = Gdk.Texture.new_for_pixbuf(pb)
    thumbs.set(name, t)
  }
  return t
}

function setWallpaper(mode: "light" | "dark", name: string) {
  ;(mode === "light" ? setLightPick : setDarkPick)(name)
  sh(`cd '${WALL}' && ln -sf '${name}' ${mode}.jpg && [ "$('${THEME}' get)" = ${mode} ] && '${THEME}' ${mode}`)
}

// ---------- pieces ----------
function ThemeCard({ mode }: { mode: "light" | "dark" }) {
  const pick = mode === "light" ? lightPick : darkPick
  return (
    <button
      class={dark((d) => (d === (mode === "dark") ? "theme-card selected" : "theme-card"))}
      onClicked={() => sh(`'${THEME}' ${mode}`)}
    >
      <box orientation={V} spacing={6}>
        <Gtk.Picture contentFit={Gtk.ContentFit.COVER} widthRequest={200} heightRequest={125} paintable={pick((p) => thumb(p))} />
        <label label={mode === "light" ? "Light" : "Dark"} />
      </box>
    </button>
  )
}

function WallGrid({ mode }: { mode: "light" | "dark" }) {
  const pick = mode === "light" ? lightPick : darkPick
  return (
    <Gtk.FlowBox maxChildrenPerLine={3} minChildrenPerLine={3} selectionMode={Gtk.SelectionMode.NONE} columnSpacing={10} rowSpacing={10} homogeneous>
      {listWallpapers().map((n) => (
        <button class={pick((p) => (p === n ? "wall selected" : "wall"))} tooltipText={n.replace(".jpg", "")} onClicked={() => setWallpaper(mode, n)}>
          <Gtk.Picture contentFit={Gtk.ContentFit.COVER} widthRequest={150} heightRequest={94} paintable={thumb(n)} />
        </button>
      ))}
    </Gtk.FlowBox>
  )
}

// ---------- window ----------
const PAGES: [string, string, string][] = [
  ["appearance", "Appearance", "preferences-desktop-appearance-symbolic"],
  ["dock", "Dock", "user-desktop-symbolic"],
  ["displays", "Displays", "video-display-symbolic"],
  ["apps", "Default Apps", "application-x-executable-symbolic"],
]

function movePin(id: string, delta: number) {
  const list = [...pinned.get()]
  const i = list.indexOf(id)
  const j = i + delta
  if (i < 0 || j < 0 || j >= list.length) return
  ;[list[i], list[j]] = [list[j], list[i]]
  setPinned(list)
}

function DockPage() {
  return (
    <box orientation={V} spacing={18}>
      <label class="page-title" label="Dock" xalign={0} />

      <label class="section-title" label="Icon size" xalign={0} />
      <box spacing={10}>
        <label class="hint" label="Small" />
        <Gtk.Scale
          hexpand
          drawValue={false}
          $={(s: Gtk.Scale) => {
            s.set_range(32, 72)
            s.set_increments(4, 8)
            s.set_value(iconSize.get())
            s.connect("value-changed", () => setIconSize(Math.round(s.get_value())))
          }}
        />
        <label class="hint" label="Large" />
      </box>

      <label class="section-title" label="Pinned apps" xalign={0} />
      <box class="pin-list" orientation={V}>
        <For each={pinned}>
          {(id) => {
            const info = appInfo(id)
            return (
              <box class="pin-row" spacing={10}>
                {info ? <image gicon={info.get_icon()!} pixelSize={28} /> : <image iconName="application-x-executable" pixelSize={28} />}
                <label label={info?.get_name() ?? id} hexpand xalign={0} />
                <button class="pin-btn" tooltipText="Move up" onClicked={() => movePin(id, -1)}>
                  <image iconName="go-up-symbolic" />
                </button>
                <button class="pin-btn" tooltipText="Move down" onClicked={() => movePin(id, 1)}>
                  <image iconName="go-down-symbolic" />
                </button>
                <button class="pin-btn" tooltipText="Remove from Dock" onClicked={() => setPinned(pinned.get().filter((p) => p !== id))}>
                  <image iconName="list-remove-symbolic" />
                </button>
              </box>
            )
          }}
        </For>
      </box>
      <label class="hint" label="To add an app: right-click it in the dock → Keep in Dock." xalign={0} />
    </box>
  )
}

// ---------- Default Apps ----------
const GROUPS: [string, string, string[]][] = [
  ["Web browser", "web-browser-symbolic", ["x-scheme-handler/http", "x-scheme-handler/https", "text/html"]],
  ["Files", "system-file-manager-symbolic", ["inode/directory"]],
  ["Text editor", "accessories-text-editor-symbolic", ["text/plain", "text/markdown"]],
  ["Images", "image-x-generic-symbolic", ["image/jpeg", "image/png", "image/webp", "image/gif"]],
]

function DefaultRow({ title, icon, mimes }: { title: string; icon: string; mimes: string[] }) {
  const apps = Gio.AppInfo.get_all_for_type(mimes[0]).filter((a) => a.should_show())
  const cur = Gio.AppInfo.get_default_for_type(mimes[0], false)
  return (
    <box class="pin-row" spacing={10}>
      <image iconName={icon} />
      <label label={title} hexpand xalign={0} />
      <Gtk.DropDown
        $={(dd: Gtk.DropDown) => {
          dd.set_model(Gtk.StringList.new(apps.map((a) => a.get_display_name())))
          const i = apps.findIndex((a) => cur && a.get_id() === cur.get_id())
          if (i >= 0) dd.set_selected(i)
          dd.connect("notify::selected", () => {
            const a = apps[dd.get_selected()]
            if (a) for (const m of mimes) a.set_as_default_for_type(m)
          })
        }}
      />
    </box>
  )
}

function AppsPage() {
  return (
    <box orientation={V} spacing={18}>
      <label class="page-title" label="Default Apps" xalign={0} />
      <box class="pin-list" orientation={V}>
        {GROUPS.map(([t, i, m]) => <DefaultRow title={t} icon={i} mimes={m} />)}
      </box>
      <label class="hint" label="Used when you open a file or link from any app." xalign={0} />
    </box>
  )
}

// ---------- Displays ----------
type Mon = { name: string; description: string; width: number; height: number; refreshRate: number;
             scale: number; x: number; y: number; availableModes: string[] }
const MONCONF = `${HOME}/.config/aster/monitors.lua`
const SCALES = [1, 1.25, 1.5, 2]
const [mons, setMons] = createState<Mon[]>([])
const reloadMons = () =>
  execAsync(["hyprctl", "monitors", "-j"]).then((out) => setMons(JSON.parse(out))).catch(console.error)

const luaFor = (m: Mon, mode: string, scale: number) =>
  `hl.monitor({ output = "${m.name}", mode = "${mode}", position = "${m.x}x${m.y}", scale = ${scale} })`

async function applyMonitor(m: Mon, mode: string, scale: number) {
  const line = luaFor(m, mode, scale)
  const res = await execAsync(["hyprctl", "eval", line])
  if (res.trim() !== "ok") console.error("hyprctl eval:", res)
  // Save: keep other monitors' lines, replace this one
  let lines: string[] = []
  try {
    const [ok, b] = GLib.file_get_contents(MONCONF)
    if (ok) lines = new TextDecoder().decode(b).split("\n")
      .filter((l) => l.startsWith("hl.monitor") && !l.includes(`output = "${m.name}"`))
  } catch {}
  lines.push(line)
  GLib.mkdir_with_parents(`${HOME}/.config/aster`, 0o755)
  GLib.file_set_contents(MONCONF, "-- written by Aster Settings\n" + lines.join("\n") + "\n")
}

function MonitorCard({ m }: { m: Mon }) {
  // "1920x1080@60.00Hz" -> unique "1920x1080@60.00", biggest first
  const modes = [...new Set(m.availableModes.map((s) => s.replace(/Hz$/, "")))]
    .sort((a, b) => {
      const [aw, ah] = a.split("@")[0].split("x").map(Number)
      const [bw, bh] = b.split("@")[0].split("x").map(Number)
      return bw * bh - aw * ah || parseFloat(b.split("@")[1]) - parseFloat(a.split("@")[1])
    })
  const label = (s: string) => {
    const [res, hz] = s.split("@")
    return `${res.replace("x", " × ")} @ ${Math.round(parseFloat(hz))} Hz`
  }
  let modeSel = Math.max(0, modes.findIndex((s) => s.startsWith(`${m.width}x${m.height}@`)))
  let scaleSel = Math.max(0, SCALES.findIndex((s) => Math.abs(s - m.scale) < 0.01))

  return (
    <box class="pin-list mon-card" orientation={V} spacing={10}>
      <box spacing={10}>
        <image iconName="video-display-symbolic" pixelSize={28} />
        <box orientation={V}>
          <label class="section-title" label={m.name} xalign={0} />
          <label class="hint" label={m.description || "Display"} xalign={0} />
        </box>
      </box>
      <box class="pin-row" spacing={10}>
        <label label="Resolution" hexpand xalign={0} />
        <Gtk.DropDown $={(dd: Gtk.DropDown) => {
          dd.set_model(Gtk.StringList.new(modes.map(label)))
          dd.set_selected(modeSel)
          dd.connect("notify::selected", () => (modeSel = dd.get_selected()))
        }} />
      </box>
      <box class="pin-row" spacing={10}>
        <label label="Scale" hexpand xalign={0} />
        <Gtk.DropDown $={(dd: Gtk.DropDown) => {
          dd.set_model(Gtk.StringList.new(SCALES.map((s) => `${s * 100}%`)))
          dd.set_selected(scaleSel)
          dd.connect("notify::selected", () => (scaleSel = dd.get_selected()))
        }} />
      </box>
      <button class="apply" halign={Gtk.Align.END}
        onClicked={() => applyMonitor(m, modes[modeSel], SCALES[scaleSel]).then(reloadMons)}>
        <label label="Apply" />
      </button>
    </box>
  )
}

function DisplaysPage() {
  reloadMons()
  return (
    <box orientation={V} spacing={18}>
      <label class="page-title" label="Displays" xalign={0} />
      <For each={mons}>{(m) => <MonitorCard m={m} />}</For>
      <label class="hint" label="Changes apply immediately and are kept after you log in again." xalign={0} />
    </box>
  )
}

export default function Settings() {
  const [page, setPage] = createState("appearance")
  return (
    <Gtk.Window name="settings" title="Aster Settings" class="Settings" defaultWidth={900} defaultHeight={640} hideOnClose visible={false} application={app} $={(self: Gtk.Window) => self.set_titlebar(new Gtk.HeaderBar({ showTitleButtons: true }))}>
      <box>
        <box class="sidebar" orientation={V} widthRequest={210} spacing={2}>
          {PAGES.map(([id, label, icon]) => (
            <button class={page((p) => (p === id ? "side-item selected" : "side-item"))} onClicked={() => setPage(id)}>
              <box spacing={10}>
                <image iconName={icon} />
                <label label={label} xalign={0} />
              </box>
            </button>
          ))}
        </box>
        <Gtk.ScrolledWindow hexpand vexpand hscrollbarPolicy={Gtk.PolicyType.NEVER}>
          <box class="content" orientation={V} spacing={18}>
            <box orientation={V} spacing={18} visible={page((p) => p === "appearance")}>
              <label class="page-title" label="Appearance" xalign={0} />
              <box spacing={16}>
                <ThemeCard mode="light" />
                <ThemeCard mode="dark" />
              </box>
              <label class="section-title" label="Light wallpaper" xalign={0} />
              <WallGrid mode="light" />
              <label class="section-title" label="Dark wallpaper" xalign={0} />
              <WallGrid mode="dark" />
            </box>
            <box visible={page((p) => p === "dock")}>
              <DockPage />
            </box>
            <box visible={page((p) => p === "apps")}>
              <AppsPage />
            </box>
            <box visible={page((p) => p === "displays")}>
              <DisplaysPage />
            </box>
          </box>
        </Gtk.ScrolledWindow>
      </box>
    </Gtk.Window>
  )
}
