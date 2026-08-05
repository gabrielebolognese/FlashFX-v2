# Devlog

## 2026-08-05

Video/playback + audio-sync work. Not yet committed at time of writing; this entry covers the working tree (14 files changed, +373/−119; ~392 new lines of engine code across 6 files; 4 Node verify harnesses).

- Video playback stops freezing a few seconds in.
  - Number: cap of 12 open decoded frames per asset. Before, only a 512MB byte budget bounded it, so ~60 frames could pile up.
  - Hard part: it wasn't a leak or a logic error. A hardware VideoDecoder silently stops emitting once too many output frames are held open (~16–24), and a VideoFrame that's been transferred still holds its decoder pool slot until `.close()`. The fix is a frame-COUNT cap plus an eviction order that keeps the frames nearest each layer's playhead. Byte accounting alone never touched it.

- New toggle for audio-synced playback (AudioLines button in the preview bar, default off).
  - Number: 392 lines of new engine code; 3 pure-logic harnesses, 24 assertions. Old path unchanged when off.
  - Hard part: none of it runs in the dev environment — no WebAudio/WebCodecs/WebGPU. So the clock, the frame-selection, and the audio-scheduling math were pulled out into pure functions and proven in Node instead. Also the picture has to be shown at the clock reading minus output latency, not the raw reading, or it leads the sound by 20–200ms.

- Video clips with sound play audio on load, and the VU meters move.
  - Number: collapsed onto 1 shared AudioContext (was a second, private one).
  - Internal cause: the private context was created suspended and never resumed, so video-clip audio was silent and the meters read zero. Ships regardless of the toggle.

- Pausing, seeking, or crossing a clip boundary no longer clicks.
  - Number: 8ms gain ramp to zero before every stop.
  - Hard part: a source with a fixed duration ends on its own and fires its `ended` event before the stop path runs, so attaching teardown only in the stop path leaked the audio nodes on the master graph. An adversarial review found it; fixed by attaching teardown when the source is scheduled, not when it's stopped.

- Deleting one half of a split clip no longer freezes or mutes the other half.
  - Number: +17/−2 in the delete action.
  - Hard part: the texture is per-layer so it's always safe to drop, but the decoder registration and audio element are per-asset — they must only be torn down when no surviving layer still points at that asset, and the release has to be deduped so deleting both halves at once doesn't over-release the audio refcount.

- Pressing play with the playhead parked mid-clip on a pitch-shifted audio clip starts at the right sample.
  - Number: one shared scheduling function now used by preview; export left alone (its bounding is already exact, and a harness proves the two agree).
  - Hard part: pitch shift is a resample, so it changes how fast the buffer is consumed. The resume offset into the buffer has to be scaled by that rate. The old code advanced it unscaled.

- Field-sampled layers run at the composition frame rate and show their inspector tab.
  - Number: 2-line type/resolve change; 1-line renderer change; 1-line inspector condition.
  - Internal: the CPU field renderer was hardcoded to 30fps and the Field tab was hidden unconditionally.
