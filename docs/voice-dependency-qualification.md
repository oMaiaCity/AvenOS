# Voice dependency qualification

Status: implementation record, 2026-08-27

This record freezes the dependency-sensitive choices required by phase 0 of the
software-first duplex voice specification. Versions are exact in the production
crate manifests and are updated only with a new qualification run.

## Qualified components

- `sonora = 0.2.0` (BSD-3-Clause, MSRV 1.91): provides the pure-Rust WebRTC M145
  audio-processing pipeline, mono 48 kHz capture/render configuration, exact
  10 ms calls, AEC3, high-pass filtering, and statistics. Noise suppression and
  AGC2 remain disabled. The dependency is kept behind the runtime `software-aec`
  feature so semantic and fake-host tests remain hardware- and DSP-independent.
- `rubato = 5.0.0` (MIT): its asynchronous sinc resampler accepts a bounded
  adjustable ratio and has a preallocated `process_into_buffer` path. Logging is
  disabled. Runtime drift correction is limited to 1,000 ppm and ramped.
- `crossbeam-queue = 0.3.13` (MIT/Apache-2.0): `ArrayQueue` allocates fixed storage
  at construction, has non-blocking push/pop, and supports replacing the oldest
  complete item with `force_push`.
- `cpal = 0.18.2` (Apache-2.0): supplies the single shared duplex host. Stream
  construction and device enumeration stay on the host-control worker; streams
  are started only after both ports and DSP state exist. Linux enables CPAL's
  PulseAudio backend so PipeWire/Pulse desktop routes are used when available,
  with ALSA retained as CPAL's fallback. Direct ALSA through the Pulse plugin is
  not qualified: on the reference XPS it produced an unpaced output loop and a
  backend-error storm.
- `ts-rs = 12.0.1` (MIT): Rust protocol types generate the checked TypeScript
  contract. A drift test compares generated text byte-for-byte.
- `ort = 2.0.0-rc.13` with ONNX Runtime `1.28.0`: Linux uses Microsoft's
  official shared CPU/CUDA archives, selected by the existing provisioning
  utility and verified by pinned SHA-256. Tauri bundles the native `.so`,
  provider library, license, and third-party notices as resources. macOS and
  iOS retain the statically linked distribution required by those targets.

## Executed qualification evidence

- Callback allocation tests: zero allocations in steady-state capture and
  render callbacks.
- Deterministic software AEC fixture: at least 15 dB attenuation through the
  delayed echo path; clipping, delay movement, and discontinuity fixtures pass.
- Virtual stress: 180,000 ten-millisecond intervals (30 minutes) complete with
  fixed queue capacities and zero synthetic overruns.
- Real Linux model compatibility with the provisioned ONNX Runtime 1.28:
  Nemotron cold-open 5.61 s; Silero model load 0.10 s; Supertonic produces
  1.72 s of speech in 245 ms at the production two-step setting on this host.
- A Tauri debug application build succeeds with the ONNX resource mapping and
  default CPAL composition enabled.

## Frozen VoiceConfigV1 values

- AEC minimum contiguous adaptation: 300 ms.
- Stable delay interval before convergence: 200 ms.
- Supported aligned delay history: 500 ms.
- Software-AEC convergence requires at least 15 dB echo-return-loss enhancement
  continuously for the 200 ms stability interval after initial adaptation.
- Render silence floor: -60 dBFS RMS.
- Saturation boundary: 1% clipped samples in a 10 ms frame; three consecutive
  saturated frames degrade the echo path.
- Maximum drift correction: 1,000 ppm; changes are limited to 50 ppm per second.
- Convergence requires uninterrupted reference/capture continuity, stable delay,
  elapsed adaptation, qualified residual-echo reduction, no saturation streak,
  and no processor or clock fault. A timer alone cannot qualify a route.

These values are conservative initial gates. Physical qualification may make
them stricter. It must never make the lexical confirmation or echo-safety policy
weaker without updating the normative specification.

The current two-user tester deployment accepts the XPS laptop calibration below
as sufficient representative hardware evidence, so automatic full-duplex
barge-in is enabled by default on every route. This deployment decision does not
bypass continuous AEC convergence or lexical-ASR confirmation.

## Known qualification boundary

Automated synthetic fixtures validate API contracts, delay, continuity,
generations, cancellation, and fixed memory. Acoustic corpus, CPU, deployment
floor, and device-route release gates require the physical qualification phase
and are not represented as passing merely because software tests pass.

## Tester deployment policy

Full-duplex barge-in is enabled without an environment setting for the current
tester deployment. A tester can temporarily force guarded turn-taking while
diagnosing a device by setting:

```sh
AVEN_VOICE_FULL_DUPLEX_BARGE_IN=0 bun run dev:app:linux
```

The route still reports full-duplex barge-in as unavailable until software AEC
reaches `converged`. Default-on deployment does not bypass echo health,
generation, or lexical-ASR confirmation gates.

For the two known testers only, a separate default-off fallback can be enabled:

```sh
AVEN_VOICE_TESTER_ADAPTING_BARGE_IN=1 bun run dev:app:linux
```

This does not mark the route or AEC as converged. It permits cancellation in
the `adapting` state only after the minimum fault-free adaptation interval,
five continuous post-AEC frames whose clean signal remains within 6 dB of the
raw microphone signal, lexical ASR evidence, and rejection of exact or fuzzy
matches against the active narration text. Bypassed or degraded AEC remains
blocked. This mode trades some false-interruption risk for tester feedback and
must not be enabled in a production release without revisiting the normative
policy.

The latest reference calibration on the built-in PulseAudio microphone and
speaker passed at -18 dBFS with a 5.72 dB PRBS signal-to-ambient ratio, 0.3725
correlation, 25.27 ms estimated echo delay, 0.0058 percent clipped capture, and
zero callback faults. The raised microphone level also produced a high
-17.44 dBFS ambient floor, so the conversational lab defaults to 6 dB of
test-host-only capture attenuation and reports worst-frame clipping. For this
limited tester population, that result authorizes testing on other devices
without a per-device launch gate. It does not mark an unqualified AEC route as
converged.

Before launching the app, run the standalone host probe from the repository
root. It opens the real default microphone and speaker, renders silence, and
prints one machine-readable JSON record. It does not load Tauri, ASR, TTS, or
the AEC model.

```sh
cargo run --locked \
  --manifest-path libs/aven-voice-host-cpal/Cargo.toml \
  --features cpal-host \
  --bin aven-voice-duplex-probe
```

The default run is 15 seconds. `route_usable: true` requires capture and render
pacing within 20 percent of wall time after the backend's startup prebuffer and
zero route-fatal callback faults. `strict_pass: true` additionally
requires zero callback warnings, including xruns. The report includes the host
backend, device names, formats, callback/frame counts, pacing ratio, and every
coalesced CPAL error category so a failing machine can be diagnosed without GUI
logs. A duration in seconds may be passed after `--` for investigation; the
15-second default is the minimum comparable result.

For an active acoustic calibration, place the laptop in its normal speaking
position, set a comfortable system volume, keep the room quiet, and run:

```sh
cargo run --locked \
  --manifest-path libs/aven-voice-host-cpal/Cargo.toml \
  --features cpal-host \
  --bin aven-voice-duplex-probe -- \
  --calibrate --level-dbfs -24
```

Start at `-24` dBFS. If the result reports less than 3 dB
`probe_signal_to_ambient_db` and capture is not clipping, repeat at `-18` dBFS.
The verifier never permits a digital level above `-18` dBFS. Lower the system
speaker volume and repeat if `clipped_fraction` reaches one percent.

This is opt-in because it audibly plays three click-free deterministic streams:
a pseudo-random probe, a logarithmic chirp, and a multitone signal. The digital
level is clamped to the safe test range from -36 to -18 dBFS. The verifier uses
the exact post-render reference and simultaneous microphone capture to estimate
the route's acoustic echo delay, correlation, ambient floor, capture peak,
clipping, and per-stream signal-to-ambient ratio. `calibrated: true` requires a
usable duplex route, a detected probe with correlation at least 0.15 and signal
energy at least 3 dB above ambient, a delay within the supported 500 ms reference
history, and less than one percent clipped capture. The JSON result is the
route-specific calibration record. `recommended_delay_hint_ms` is the measured
starting point for diagnosing that route; it is not a permanent global override.
Changing the microphone, speaker, system route, or acoustic layout invalidates
the result. The application continues to align clocks and assess AEC convergence
while it runs, so calibration never weakens the continuous echo-safety gate.

### Autonomous conversational duplex lab

The calibration above measures the route. The conversational lab exercises the
complete production AEC, VAD, streaming ASR, generation filtering, lexical
confirmation, and 80 ms cancellation fade without launching Tauri or the web
application:

```sh
bun run test:voice-duplex --required-only
```

The lab synthesizes both sides of normal German conversations with the local
Supertonic model; the tester never has to speak. Assistant audio enters the
normal render port and therefore becomes the exact AEC reference. By default,
the separately synthesized user/noise track is mixed into the physical speaker
buffer only after that reference is recorded, so both tracks are audible. The
microphone receives the real acoustic mixture while AEC can remove only the
assistant stream. This is a repeatable one-laptop analogue of near-end speech
during far-end playback, not a replacement for later human double-talk testing
on multiple devices.

For signal-path diagnosis, `--capture-boundary-near-end` injects the synthetic
user at the native capture boundary instead of the speaker. The default
test-host capture attenuation can be changed with `--capture-input-gain-db DB`,
and a calibration candidate can be tested with
`--callback-delay-hint-ms MS`. Both values are written to `report.json`; neither
option changes production CPAL input samples or creates a global device
override.

Pass `--tester-adapting-barge-in` to exercise the explicit tester fallback. It
is intentionally not part of the default lab run:

```sh
bun run test:voice-duplex --required-only --tester-adapting-barge-in
```

The required corpus proves that assistant-only playback and household-like
click/cough noise do not interrupt, clear lexical speech during an answer does
interrupt and completes the exact fade, a follow-up after playback is submitted
without a false barge-in, and speech that starts before echo safety converges is
conservatively discarded. The extended corpus adds quiet, muffled, and
telephone-band interruptions. Use `--list`, `--scenario NAME`, or no filter to
run the entire corpus.

Every run writes `assistant-reference.wav`, `injected-near-end.wav`, and
`planned-speaker-mix.wav` per scenario plus a `report.json` containing observed
partials/finals, confirmation and fade times, echo convergence, signal levels,
queue faults, callback faults, AEC return-loss metrics, and clipping. Required
failures produce exit code 2, so the same host can be used manually on tester
laptops and as an opt-in hardware gate. The report directory defaults to a
timestamped directory under the system temporary directory and can be selected
with `--output-dir`.

On the current Linux reference laptop, the audible clear-interruption scenario
recognized the synthetic second track as “Stock, meinst du das”, but measured
only 3.24 dB of echo-return-loss enhancement. The safety gate therefore kept
full duplex disabled and did not cancel the assistant. This is a useful failed
hardware qualification: it proves autonomous double-talk reaches ASR while an
unqualified echo path cannot recreate the former feedback loop. It is not a
reason to lower the 15 dB production threshold.

### Anonymous speaker diarization

The optional speaker layer uses the official WeSpeaker VoxCeleb ResNet34 ONNX
checkpoint (`voxceleb_resnet34.onnx`, SHA-256
`9fea6516d7ad6bf0a76c7689f5a49b65d330fad6dde96c91bb4435ffbfe056a1`).
WeSpeaker publishes its VoxCeleb checkpoints under CC BY 4.0. The native
frontend follows the published 16 kHz, 25 ms window, 10 ms frame-shift, 80-bin
filterbank and mean-normalization inference path. If the optional checkpoint
cannot be downloaded, loaded, or evaluated, transcription continues without a
speaker label.

This is session-local diarization, not speaker identification: labels are only
`speaker-1` through `speaker-3`, embeddings never cross IPC or persist, and all
clusters reset with the voice session or input route. The post-AEC worker emits
an embedding observation, but the semantic core assigns it only after lexical
confirmation. Echo, noise, stale generations, and otherwise discarded input
therefore cannot create or update a speaker profile.

Qualification evidence covers both layers. Direct inference with the real
checkpoint and local Supertonic voices produced cosine similarity 0.836 for
two different F3 sentences and 0.233 for the same sentence spoken by F3 and M3.
The physical laptop lab then assigned three separately synthesized voices F3,
M3, and F5 to three stable, distinct anonymous labels from their post-AEC
captures. The clustering gate is deliberately bounded to three people and uses
a 0.55 match threshold plus a 0.06 previous-speaker margin to avoid label churn.
These are initial conversational heuristics, not biometric accuracy claims;
multi-device tester feedback remains part of duplex qualification.

### Application attribution persistence

The full-stack release gate carries two deterministic silent fixtures through the
production voice semantic state machine and the real Rust/Tauri application. The
first emits a confirmed final with a session-local anonymous speaker label. The
second starts assistant playback, confirms a lexical interruption and its cancellation
fade, then emits a follow-up from a different anonymous speaker. The browser journey
proves that both labels reach chat state and that the speaker-attributed contributions
persist in the selected customer's Intent history.

This rail proves event ordering, session-scoped label correlation, duplex cancellation
semantics, frontend rendering, and persistence. Its PCM is synthetic and silent, so it
does not prove microphone capture, acoustic echo cancellation, diarization accuracy,
or a physical device route. The autonomous conversational lab above remains the
acoustic qualification path.
