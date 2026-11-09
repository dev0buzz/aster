import { Gtk } from "ags/gtk4"
import { createBinding, createState, For } from "ags"
import { execAsync } from "ags/process"
import Pango from "gi://Pango"
import Wp from "gi://AstalWp"
import Network from "gi://AstalNetwork"
import Bluetooth from "gi://AstalBluetooth"
import Mpris from "gi://AstalMpris"
import Gio from "gi://Gio"

const V = Gtk.Orientation.VERTICAL
const wp = Wp.get_default()!
const speaker = wp.defaultSpeaker
const network = Network.get_default()
const bt = Bluetooth.get_default()
const mpris = Mpris.get_default()
const sh = (c: string) => execAsync(["sh", "-c", c]).catch(console.error)

// ---------- panel icons ----------
// Use whichever connection is actually in use (wired vs Wi-Fi)
const useWifi = () => network.primary === Network.Primary.WIFI && network.wifi

function NetworkIcon() {
  const dev = useWifi() ? network.wifi : network.wired
  if (!dev) return <image iconName="network-offline-symbolic" />
  return <image iconName={createBinding(dev, "iconName")} />
}

function VolumeIcon() {
  if (!speaker) return <image iconName="audio-volume-muted-symbolic" />
  return <image iconName={createBinding(speaker, "volumeIcon")} />
}

// ---------- tiles ----------
function Tile(p: { icon: any; title: string; subtitle: any; active?: any; onClicked: () => void; sensitive?: boolean }) {
  return (
    <button
      class={p.active ? p.active((a: boolean) => (a ? "tile active" : "tile")) : "tile"}
      hexpand
      sensitive={p.sensitive ?? true}
      onClicked={p.onClicked}
    >
      <box spacing={8}>
        <image iconName={p.icon} pixelSize={18} />
        <box orientation={V}>
          <label class="tile-title" label={p.title} xalign={0} />
          <label class="tile-sub" label={p.subtitle} xalign={0} ellipsize={Pango.EllipsizeMode.END} maxWidthChars={14} />
        </box>
      </box>
    </button>
  )
}

function NetworkTile() {
  const wifi = useWifi() ? network.wifi : null
  if (!wifi)
    return <Tile icon="network-wired-symbolic" title="Network" subtitle={network.wired ? "Wired" : "Offline"} onClicked={() => sh("nm-connection-editor")} />
  return (
    <Tile
      icon={createBinding(wifi, "iconName")}
      title="Wi-Fi"
      subtitle={createBinding(wifi, "ssid")((s) => s || "Not connected")}
      active={createBinding(wifi, "enabled")}
      onClicked={() => (wifi.enabled = !wifi.enabled)}
    />
  )
}

function BluetoothTile() {
  if (!bt.adapter)
    return <Tile icon="bluetooth-disabled-symbolic" title="Bluetooth" subtitle="Not available" sensitive={false} onClicked={() => {}} />
  const on = createBinding(bt, "isPowered")
  return (
    <Tile
      icon={on((p) => (p ? "bluetooth-active-symbolic" : "bluetooth-disabled-symbolic"))}
      title="Bluetooth"
      subtitle={on((p) => (p ? "On" : "Off"))}
      active={on}
      onClicked={() => bt.toggle()}
    />
  )
}

// Placeholder until week 8: only flips the app colour scheme
// Dark Mode: reads the real system setting, switches via aster-theme
const iface = new Gio.Settings({ schema_id: "org.gnome.desktop.interface" })
const isDark = () => iface.get_string("color-scheme") === "prefer-dark"
const [dark, setDark] = createState(isDark())
iface.connect("changed::color-scheme", () => setDark(isDark()))

function DarkTile() {
  return (
    <Tile
      icon="weather-clear-night-symbolic"
      title="Dark Mode"
      subtitle={dark((d) => (d ? "On" : "Off"))}
      active={dark}
      onClicked={() => sh("/home/danim/aster/config/scripts/aster-theme toggle")}
    />
  )
}

// Plain GTK slider, wired by hand: drag -> volume, volume -> slider
function VolumeSlider() {
  return (
    <Gtk.Scale
      hexpand
      drawValue={false}
      $={(s: Gtk.Scale) => {
        s.set_range(0, 1)
        s.set_increments(0.02, 0.1)
        s.set_value(speaker.volume)
        let syncing = false
        s.connect("value-changed", () => {
          if (!syncing) speaker.volume = s.get_value()
        })
        speaker.connect("notify::volume", () => {
          syncing = true
          s.set_value(speaker.volume)
          syncing = false
        })
      }}
    />
  )
}

// ---------- sound ----------
function Sound() {
  if (!speaker) return <label label="No audio device" />
  const speakers = createBinding(wp.audio, "speakers")
  return (
    <box class="section" orientation={V} spacing={6}>
      <label class="section-title" label="Sound" xalign={0} />
      <box spacing={6}>
        <button class="mute" onClicked={() => (speaker.mute = !speaker.mute)}>
          <image iconName={createBinding(speaker, "volumeIcon")} />
        </button>
	<VolumeSlider />
      </box>
      <For each={speakers}>
        {(ep) => (
          <button class="output" onClicked={() => ep.set_is_default(true)}>
            <box spacing={6}>
              <image iconName="object-select-symbolic" opacity={createBinding(ep, "isDefault")((d) => (d ? 1 : 0))} />
              <label label={createBinding(ep, "description")} xalign={0} hexpand ellipsize={Pango.EllipsizeMode.END} maxWidthChars={34} />
            </box>
          </button>
        )}
      </For>
    </box>
  )
}

// ---------- now playing ----------
function NowPlaying() {
  const first = createBinding(mpris, "players")((ps) => ps.slice(0, 1))
  return (
    <box class="section" orientation={V} visible={createBinding(mpris, "players")((ps) => ps.length > 0)}>
      <For each={first}>
        {(p) => (
          <box class="media" spacing={10}>
            <image file={createBinding(p, "coverArt")} pixelSize={48} />
            <box orientation={V} hexpand valign={Gtk.Align.CENTER}>
              <label class="media-title" label={createBinding(p, "title")} xalign={0} ellipsize={Pango.EllipsizeMode.END} maxWidthChars={22} />
              <label class="media-artist" label={createBinding(p, "artist")} xalign={0} ellipsize={Pango.EllipsizeMode.END} maxWidthChars={22} />
            </box>
            <button onClicked={() => p.previous()}><image iconName="media-skip-backward-symbolic" /></button>
            <button onClicked={() => p.play_pause()}>
              <image iconName={createBinding(p, "playbackStatus")((s) =>
                s === Mpris.PlaybackStatus.PLAYING ? "media-playback-pause-symbolic" : "media-playback-start-symbolic")} />
            </button>
            <button onClicked={() => p.next()}><image iconName="media-skip-forward-symbolic" /></button>
          </box>
        )}
      </For>
    </box>
  )
}

// ---------- the panel button + popover ----------
export default function ControlCenter() {
  return (
    <menubutton class="cc-button">
      <box spacing={8}>
        <NetworkIcon />
        <VolumeIcon />
      </box>
      <popover hasArrow={false}>
        <box class="cc" orientation={V} spacing={10} widthRequest={320}>
          <box spacing={8} homogeneous>
            <NetworkTile />
            <BluetoothTile />
          </box>
          <box spacing={8} homogeneous>
            <DarkTile />
            <box />
          </box>
          <Sound />
          <NowPlaying />
        </box>
      </popover>
    </menubutton>
  )
}
