# TRINARY

A three-player co-op starship game for a home arcade cabinet. One ship, three
stations, one per control on the panel:

| Station | Control | Does |
|---|---|---|
| **Pilot** | Player 1 stick | Stick flies the ship. **B1** boost, **B2** brake, **B3** nose cannon (fires where the ship points). |
| **Gunner** | Trackball | Roll to aim the turret anywhere on screen. **Left** fires lasers (watch the heat). **Right** is the tractor beam: reels in pickups and escape pods, or reels the *ship* onto a docking beacon. |
| **Engineer** | Player 2 stick | Stick aims the shield arc. **B1/B2/B3** route power to Engines / Weapons / Shields. **B4** hold to repair hull (drains shield). **B5** EMP blast (clears bullets, stuns enemies). **B6** cycles power. |

The shield only covers part of the ship, the turret overheats, and the hull is
shared, so the crew has to talk to each other.

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

- **Game controllers** (USB encoders): first controller is the pilot, second is
  the engineer. Buttons 1-6 are B1-B6. If the two are the wrong way round,
  press **F2** to swap them (it is remembered).
- **Keyboard encoders** (I-PAC etc., MAME default keys): P1 = arrows +
  LCtrl, LAlt, Space, LShift, Z, X. P2 = R/F/D/G + A, S, Q, W, I, K.
  Start = 1 or 2 (pauses during play).

The title screen shows a live input check for all three stations, so you can
see what each stick and button is doing before you start.

To change the mapping, trackball sensitivity, or dead zone, edit the `CFG`
block at the top of `src/input.js`. If your encoder reports the stick as a POV
hat rather than axes, set `hatAxis` there. Adding `?nolock` to the URL stops the
game capturing the trackball pointer.

## Files

- `index.html` - page shell
- `src/input.js` - sticks, buttons, trackball
- `src/audio.js` - synthesized sound and music (no audio files)
- `src/game.js` - everything else; missions are the `MISSIONS` list
