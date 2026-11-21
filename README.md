# TRINARY

A three-player co-op starship game for a home arcade cabinet. One ship, three
stations, one per control on the panel:

| Station | Control | Does |
|---|---|---|
| **Pilot** | Left stick | Point the stick to fly that way. **B1** boost (limited, recharges), **B2** brake, **B3** hold for the attractor field: pulls pickups and escape pods toward the ship, and reels the ship onto the docking beacon. No weapons. |
| **Gunner** | Trackball | The only weapons on the ship. Roll to aim anywhere on screen. **Left** is a rapid cannon (weak, overheats if held). **Right** is a heavy torpedo that flies through the crosshair and bursts on whatever it hits, with a slow reload. |
| **Engineer** | Right stick | Stick aims the shield arc. **B1** hold to repair hull (drains shield). **B2** emergency pulse: a shockwave that heavily damages everything around the ship, with a 30 second recharge. |

The shield only covers part of the ship, breaks after a few hits and recharges
slowly. The cannon overheats, the attractor field slows the ship down while it
is on, and the hull is shared, so the crew has to talk to each other.

Difficulty (Easy / Normal / Hard) is chosen on the title screen with either
stick, left or right, and is remembered. Harder settings score more.

Six missions, then it loops harder: asteroid belt run, escape-pod rescue,
pirate ambush, docking inside a spinning station, a mined asteroid run, and a
dreadnought boss. Any station nobody touches for a few seconds goes on AUTO
(weaker than a human), so it is playable with one or two people.

## Running it

Double-click **`Play TRINARY.bat`**. It opens the game full screen in Chrome or
Edge. No install, no internet, no build step. (Or open `index.html` in a
browser and press F11.)

### LaunchBox

1. Copy this whole folder somewhere permanent, e.g. `C:\Games\TRINARY`.
2. In LaunchBox: *Add > Add Manually*, and set the application path to
   `Play TRINARY.bat`. Treat it as a Windows game; no emulator is needed.
3. Launch it. Click the trackball button once so the game can capture the trackball.

**Esc** quits. If your cabinet's exit button does not send Esc, LaunchBox's
"close the active window" controller binding works too.

## Controls and wiring

Sticks and buttons are read from both places at once, so most cabinets work
unchanged:

- **Game controllers** (USB encoders): the second controller is the pilot and the first is
  the engineer. Buttons 1-6 are B1-B6. If the two are the wrong way round,
  press **F2** to swap them (it is remembered).
- **Keyboard encoders** (I-PAC etc., MAME default keys): P1 (engineer) = arrows +
  LCtrl (repair), LAlt (pulse), Space, LShift, Z, X. P2 (pilot) = R/F/D/G + A (boost), S (brake), Q (attractor field), W, I, K.
  Start = 1 or 2 (pauses during play).

The title screen shows a live input check for all three stations, so you can
see what each stick and button is doing before you start.

If the sticks feel backwards on your cabinet, swap the numbers in
`PILOT_STICK` / `ENGINEER_STICK` at the top of `src/game.js` (the screen layout stays
the same: pilot left, engineer right). To change the key mapping, trackball sensitivity, or dead zone, edit the `CFG`
block at the top of `src/input.js`. If your encoder reports the stick as a POV
hat rather than axes, set `hatAxis` there. Adding `?nolock` to the URL stops the
game capturing the trackball pointer.

## Files

- `index.html` - page shell
- `src/input.js` - sticks, buttons, trackball
- `src/audio.js` - synthesized sound and music (no audio files)
- `src/game.js` - everything else; missions are the `MISSIONS` list
