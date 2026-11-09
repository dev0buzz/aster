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
            <label class="soon" label="Coming soon" visible={page((p) => p === "displays" || p === "apps")} />
          </box>
        </Gtk.ScrolledWindow>
      </box>
    </Gtk.Window>
  )
}
