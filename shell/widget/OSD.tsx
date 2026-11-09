import app from "ags/gtk4/app"
import { Astal, Gtk } from "ags/gtk4"
import { createState } from "ags"
import { timeout } from "ags/time"
import Wp from "gi://AstalWp"

const speaker = Wp.get_default()!.defaultSpeaker
const [visible, setVisible] = createState(false)
const [icon, setIcon] = createState("audio-volume-high-symbolic")
const [level, setLevel] = createState(0)
let hideTimer: { cancel(): void } | null = null

// Call this from anywhere (brightness will use it in week 15)
export function showOsd(iconName: string, value: number) {
  setIcon(iconName)
  setLevel(value)
  setVisible(true)
  hideTimer?.cancel()
  hideTimer = timeout(1500, () => setVisible(false))
}

if (speaker) {
  let ready = false // don't pop up while the shell is starting
  timeout(1000, () => (ready = true))
  const update = () => ready && showOsd(speaker.volumeIcon, speaker.mute ? 0 : speaker.volume)
  speaker.connect("notify::volume", update)
  speaker.connect("notify::mute", update)
}

export default function OSD() {
  return (
    <window
      name="osd"
      class="OSD"
      anchor={Astal.WindowAnchor.BOTTOM}
      marginBottom={120}
      layer={Astal.Layer.OVERLAY}
      visible={visible}
      application={app}
    >
      <box class="osd" spacing={12}>
        <image iconName={icon} pixelSize={22} />
        <Gtk.LevelBar widthRequest={200} valign={Gtk.Align.CENTER} value={level} />
      </box>
    </window>
  )
}
