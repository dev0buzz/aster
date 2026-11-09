import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { createState, For } from "ags"
import { execAsync } from "ags/process"
import Pango from "gi://Pango"
import Apps from "gi://AstalApps"
import GLib from "gi://GLib"

const V = Gtk.Orientation.VERTICAL
const apps = new Apps.Apps()
const [query, setQuery] = createState("")

type Result = { icon: string; title: string; subtitle: string; run: () => void; first?: boolean }

// Launch through Hyprland (same as the dock) so apps get the full session environment
const execCmd = (cmd: string) =>
  execAsync(["hyprctl", "dispatch", `hl.dsp.exec_cmd(${JSON.stringify(cmd)})`]).catch(console.error)
const hide = () => {
  const w = app.get_window("spotlight")
  if (w) w.visible = false
}

// Tiny calculator: digits, + - * / ^ % ( ) only
function calc(q: string): string | null {
  if (!/^[\d\s+\-*/().,%^]+$/.test(q) || !/\d/.test(q) || !/[+\-*/%^]/.test(q)) return null
  try {
    const v = Function(`"use strict"; return (${q.replace(/\^/g, "**").replace(/,/g, ".")})`)()
    return Number.isFinite(v) ? String(Math.round(v * 1e10) / 1e10) : null
  } catch {
    return null
  }
}

// Recently opened files (GTK's own recent list), matched by name
const recent = Gtk.RecentManager.get_default()
function recentFiles(t: string): Result[] {
  const q = t.toLowerCase()
  return recent.get_items()
    .filter((i) => i.exists() && i.get_display_name().toLowerCase().includes(q))
    .sort((a, b) => b.get_modified().to_unix() - a.get_modified().to_unix())
    .slice(0, 3)
    .map((i) => ({
      icon: i.get_mime_type().startsWith("image/") ? "image-x-generic" : "text-x-generic",
      title: i.get_display_name(),
      subtitle: `Recent file · ${i.get_uri_display() ?? ""}`,
      run: () => execCmd(`xdg-open ${JSON.stringify(i.get_uri())}`),
    }))
}

function search(q: string): Result[] {
  const t = q.trim()
  if (!t) return []
  const out: Result[] = []
  const c = calc(t)
  if (c !== null)
    out.push({ icon: "accessories-calculator", title: `= ${c}`, subtitle: "Press Enter to copy",
               run: () => execAsync(["wl-copy", c]).catch(console.error) })
  for (const a of apps.fuzzy_query(t).slice(0, 7))
    out.push({
      icon: a.iconName || "application-x-executable",
      title: a.name,
      subtitle: a.description || "Application",
      run: () => execCmd(a.executable.replace(/\s*%[fFuUdDnNickvm]/g, "").trim()),
    })
  out.push(...recentFiles(t))
  out.push({ icon: "web-browser", title: `Search the web for “${t}”`, subtitle: "DuckDuckGo",
             run: () => execCmd(`xdg-open https://duckduckgo.com/?q=${encodeURIComponent(t)}`) })
  out[0].first = true
  return out
}

const results = query(search)
function runFirst() {
  const r = search(query.get())[0]
  if (r) { r.run(); hide() }
}

export default function Spotlight() {
  let entry: Gtk.Entry
  let win: Astal.Window
  // Layer windows grow on their own but don't shrink: ask GTK to recompute the size
  const shrink = () =>
    GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => { win?.set_default_size(1, 1); return false })
  return (
    <window
      name="spotlight"
      class="Spotlight"
      visible={false}
      application={app}
      anchor={Astal.WindowAnchor.TOP}
      marginTop={180}
      layer={Astal.Layer.OVERLAY}
      keymode={Astal.Keymode.EXCLUSIVE}
      onNotifyVisible={(self: Astal.Window) => {
        if (self.visible) { apps.reload(); entry.set_text(""); entry.grab_focus() }
      }}
      $={(self: Astal.Window) => {
        win = self
        const k = new Gtk.EventControllerKey()
        k.connect("key-pressed", (_c, keyval: number) => {
          if (keyval === Gdk.KEY_Escape) { self.visible = false; return true }
          return false
        })
        self.add_controller(k)
      }}
    >
      <box class="spotlight" orientation={V} widthRequest={640}>
        <box class="spot-search" spacing={10}>
          <image iconName="system-search-symbolic" pixelSize={22} />
          <entry
            hexpand
            placeholderText="Spotlight Search"
            $={(e: Gtk.Entry) => (entry = e)}
            onChanged={(e: Gtk.Entry) => { setQuery(e.text); shrink() }}
            onActivate={runFirst}
          />
        </box>
        <box class="spot-results" orientation={V} visible={results((r) => r.length > 0)}>
          <For each={results}>
            {(r) => (
              <button class={r.first ? "spot-row first" : "spot-row"} onClicked={() => { r.run(); hide() }}>
                <box spacing={12}>
                  <image iconName={r.icon} pixelSize={32} />
                  <box orientation={V} valign={Gtk.Align.CENTER}>
                    <label class="spot-title" label={r.title} xalign={0} ellipsize={Pango.EllipsizeMode.END} maxWidthChars={50} />
                    <label class="spot-sub" label={r.subtitle} xalign={0} ellipsize={Pango.EllipsizeMode.END} maxWidthChars={60} />
                  </box>
                </box>
              </button>
            )}
          </For>
        </box>
      </box>
    </window>
  )
}
