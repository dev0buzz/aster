-- Aster: hyprland.lua (week 2, mac-style base)
-- VMware screen: real pixels, no 2x scaling
hl.monitor({ output = "Virtual-1", mode = "1600x900@60", position = "0x0", scale = 1 })

local mainMod  = "SUPER"          -- Super acts as Cmd
local terminal = "kitty"
local files    = "nautilus"
local launcher = "fuzzel"         -- temporary, replaced in week 9

hl.env("LIBGL_ALWAYS_SOFTWARE", "1")   -- VMware only: Hyprland can't import vmwgfx GPU buffers. REMOVE on the AMD PC.
hl.env("XCURSOR_SIZE", "24")
hl.env("HYPRCURSOR_SIZE", "24")

hl.config({
  cursor = { no_hardware_cursors = true },   -- needed in VMware
  general = { gaps_in = 6, gaps_out = 12, border_size = 1, resize_on_border = true },
  decoration = {
    rounding = 12,
    blur   = { enabled = true, size = 8, passes = 2, vibrancy = 0.17 },
    shadow = { enabled = true, range = 20, render_power = 3 },
  },
  misc  = { force_default_wallpaper = 0, disable_hyprland_logo = true },
  input = { kb_layout = "us", follow_mouse = 1 },
})

-- Every window floats, like macOS
hl.window_rule({ name = "aster-float-all", match = { class = ".*" }, float = true })

-- Alt+Tab: next window, raised to the top
hl.bind("ALT + Tab", function()
  hl.dispatch(hl.dsp.window.cycle_next())
  hl.dispatch(hl.dsp.window.bring_to_top())
end)

-- Alt+Shift+Tab: previous window
hl.bind("ALT + SHIFT + Tab", function()
  hl.dispatch(hl.dsp.window.cycle_next({ next = false }))
  hl.dispatch(hl.dsp.window.bring_to_top())
end)

-- Ctrl+Super+F: full screen
hl.bind("CTRL + " .. mainMod .. " + F", hl.dsp.window.fullscreen({ mode = "fullscreen", action = "toggle" }))

-- mac-like motion: quick ease-out, windows pop in
hl.curve("macOut", { type = "bezier", points = { {0.16, 1}, {0.3, 1} } })
hl.animation({ leaf = "windowsIn",  enabled = true, speed = 3, bezier = "macOut", style = "popin 90%" })
hl.animation({ leaf = "windowsOut", enabled = true, speed = 2, bezier = "macOut", style = "popin 90%" })
hl.animation({ leaf = "fade",       enabled = true, speed = 3, bezier = "macOut" })
hl.animation({ leaf = "workspaces", enabled = true, speed = 4, bezier = "macOut", style = "slide" })

-- Keys (Super = Cmd)
hl.bind(mainMod .. " + SHIFT + R", hl.dsp.exec_cmd("/home/danim/aster/config/scripts/aster-panel-restart"))
hl.bind(mainMod .. " + Q",       hl.dsp.window.close())          -- Cmd+Q quit
hl.bind(mainMod .. " + W",       hl.dsp.window.close())          -- Cmd+W close
hl.bind(mainMod .. " + space",   hl.dsp.exec_cmd(launcher))      -- Cmd+Space
hl.bind(mainMod .. " + Return",  hl.dsp.exec_cmd(terminal))
hl.bind(mainMod .. " + E",       hl.dsp.exec_cmd(files))
hl.bind(mainMod .. " + T",       hl.dsp.window.float({ action = "toggle" }))  -- tile/float
hl.bind(mainMod .. " + SHIFT + Q", hl.dsp.exit())                -- Cmd+Shift+Q log out
hl.bind(mainMod .. " + mouse:272", hl.dsp.window.drag(),   { mouse = true })
hl.bind(mainMod .. " + mouse:273", hl.dsp.window.resize(), { mouse = true })
for i = 1, 5 do
  hl.bind(mainMod .. " + " .. i,           hl.dsp.focus({ workspace = i }))
  hl.bind(mainMod .. " + SHIFT + " .. i,   hl.dsp.window.move({ workspace = i }))
end

-- Autostart
hl.on("hyprland.start", function()
  hl.exec_cmd("ags run /home/danim/aster/shell")   -- inside hl.on("hyprland.start")
  hl.exec_cmd("/usr/libexec/polkit-mate-authentication-agent-1")  -- check path from step 1
  -- Super+Shift+R: restart the panel while developing
  hl.bind(mainMod .. " + SHIFT + R", hl.dsp.exec_cmd("pkill -f 'ags run'; ags run /home/danim/aster/shell"))
end)

-- Volume / brightness keys (OSD shows automatically)
local volUp   = "wpctl set-volume -l 1 @DEFAULT_AUDIO_SINK@ 5%+"
local volDown = "wpctl set-volume @DEFAULT_AUDIO_SINK@ 5%-"
local mute    = "wpctl set-mute @DEFAULT_AUDIO_SINK@ toggle"

hl.bind("XF86AudioRaiseVolume", hl.dsp.exec_cmd(volUp),   { locked = true, repeating = true })
hl.bind("XF86AudioLowerVolume", hl.dsp.exec_cmd(volDown), { locked = true, repeating = true })
hl.bind("XF86AudioMute",        hl.dsp.exec_cmd(mute),    { locked = true })
hl.bind(mainMod .. " + F12", hl.dsp.exec_cmd(volUp),   { repeating = true })
hl.bind(mainMod .. " + F11", hl.dsp.exec_cmd(volDown), { repeating = true })
hl.bind(mainMod .. " + F10", hl.dsp.exec_cmd(mute))

-- Brightness: no backlight in the VM; tested on the AMD PC in week 15
hl.bind("XF86MonBrightnessUp",   hl.dsp.exec_cmd("brightnessctl set 5%+"), { locked = true, repeating = true })
hl.bind("XF86MonBrightnessDown", hl.dsp.exec_cmd("brightnessctl set 5%-"), { locked = true, repeating = true })
