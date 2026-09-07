use aven_voice_runtime::{StreamingSincResampler, SynthesizedPcm};

pub const ASSISTANT_LEAD_MS: u32 = 700;
pub const TRAILING_SILENCE_MS: u32 = 2_200;
// The calibration probe selected this as the loudest safe laptop-speaker level.
// It is ten decibels louder than the first lab draft while leaving headroom for
// the qualified microphone's high gain.
const CONVERSATIONAL_ASSISTANT_PEAK_DBFS: f32 = -18.0;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Clarity {
    Clean,
    Telephone,
    Muffled,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Injection {
    None,
    HouseholdNoise {
        start_after_assistant_ms: u32,
        duration_ms: u32,
        peak_dbfs: f32,
    },
    Speech {
        text: &'static str,
        voice: &'static str,
        timing: SpeechTiming,
        peak_dbfs: f32,
        clarity: Clarity,
    },
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SpeechTiming {
    DuringAssistant(u32),
    AfterAssistant(u32),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Expectation {
    NoConfirmation,
    Interrupt { keywords: &'static [&'static str] },
    FollowUp { keywords: &'static [&'static str] },
    UnsafeEarlySpeech,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Scenario {
    pub name: &'static str,
    pub assistant_text: &'static str,
    pub assistant_voice: &'static str,
    pub assistant_peak_dbfs: f32,
    pub injection: Injection,
    pub expectation: Expectation,
    pub required: bool,
}

pub fn built_in_scenarios() -> Vec<Scenario> {
    const ANSWER: &str = "Gern. Ich fasse zuerst die wichtigsten Aufgaben für heute zusammen. Danach können wir gemeinsam entscheiden, womit du anfangen möchtest.";
    vec![
        Scenario {
            name: "assistant_only",
            assistant_text: ANSWER,
            assistant_voice: "M5",
            assistant_peak_dbfs: CONVERSATIONAL_ASSISTANT_PEAK_DBFS,
            injection: Injection::None,
            expectation: Expectation::NoConfirmation,
            required: true,
        },
        Scenario {
            name: "random_household_sounds",
            assistant_text: ANSWER,
            assistant_voice: "M5",
            assistant_peak_dbfs: CONVERSATIONAL_ASSISTANT_PEAK_DBFS,
            injection: Injection::HouseholdNoise {
                start_after_assistant_ms: 900,
                duration_ms: 1_300,
                peak_dbfs: -24.0,
            },
            expectation: Expectation::NoConfirmation,
            required: true,
        },
        Scenario {
            name: "clear_mid_sentence_interrupt",
            assistant_text: ANSWER,
            assistant_voice: "M5",
            assistant_peak_dbfs: CONVERSATIONAL_ASSISTANT_PEAK_DBFS,
            injection: Injection::Speech {
                text: "Stopp, wie meinst du das?",
                voice: "F3",
                timing: SpeechTiming::DuringAssistant(1_150),
                peak_dbfs: -6.0,
                clarity: Clarity::Clean,
            },
            expectation: Expectation::Interrupt {
                keywords: &["stopp", "stop", "meinst"],
            },
            required: true,
        },
        Scenario {
            name: "quiet_mid_sentence_interrupt",
            assistant_text: ANSWER,
            assistant_voice: "M5",
            assistant_peak_dbfs: CONVERSATIONAL_ASSISTANT_PEAK_DBFS,
            injection: Injection::Speech {
                text: "Moment, kannst du das einfacher erklären?",
                voice: "F5",
                timing: SpeechTiming::DuringAssistant(1_450),
                peak_dbfs: -15.0,
                clarity: Clarity::Clean,
            },
            expectation: Expectation::Interrupt {
                keywords: &["moment", "einfach", "erklär"],
            },
            required: false,
        },
        Scenario {
            name: "muffled_mid_sentence_interrupt",
            assistant_text: ANSWER,
            assistant_voice: "M5",
            assistant_peak_dbfs: CONVERSATIONAL_ASSISTANT_PEAK_DBFS,
            injection: Injection::Speech {
                text: "Warte, zeig mir bitte nur die Summe.",
                voice: "M3",
                timing: SpeechTiming::DuringAssistant(1_650),
                peak_dbfs: -9.0,
                clarity: Clarity::Muffled,
            },
            expectation: Expectation::Interrupt {
                keywords: &["warte", "summe", "bitte"],
            },
            required: false,
        },
        Scenario {
            name: "follow_up_after_answer",
            assistant_text: "Das sind die drei wichtigsten Punkte für heute.",
            assistant_voice: "M5",
            assistant_peak_dbfs: CONVERSATIONAL_ASSISTANT_PEAK_DBFS,
            injection: Injection::Speech {
                text: "Und was ist morgen wichtig?",
                voice: "F3",
                timing: SpeechTiming::AfterAssistant(1_200),
                peak_dbfs: -6.0,
                clarity: Clarity::Clean,
            },
            expectation: Expectation::FollowUp {
                keywords: &["morgen", "wichtig"],
            },
            required: true,
        },
        Scenario {
            name: "second_speaker_follow_up",
            assistant_text: "Die Übersicht ist jetzt vollständig.",
            assistant_voice: "M5",
            assistant_peak_dbfs: CONVERSATIONAL_ASSISTANT_PEAK_DBFS,
            injection: Injection::Speech {
                text: "Öffne bitte als Nächstes den Kalender.",
                voice: "M3",
                timing: SpeechTiming::AfterAssistant(1_200),
                peak_dbfs: -6.0,
                clarity: Clarity::Clean,
            },
            expectation: Expectation::FollowUp {
                keywords: &["kalender", "öffne", "nächstes"],
            },
            required: false,
        },
        Scenario {
            name: "third_speaker_follow_up",
            assistant_text: "Die Übersicht ist jetzt vollständig.",
            assistant_voice: "M5",
            assistant_peak_dbfs: CONVERSATIONAL_ASSISTANT_PEAK_DBFS,
            injection: Injection::Speech {
                text: "Welche Termine sind für Freitag geplant?",
                voice: "F5",
                timing: SpeechTiming::AfterAssistant(1_200),
                peak_dbfs: -9.0,
                clarity: Clarity::Clean,
            },
            expectation: Expectation::FollowUp {
                keywords: &["termine", "freitag", "geplant"],
            },
            required: false,
        },
        Scenario {
            name: "speech_before_echo_is_safe",
            assistant_text: ANSWER,
            assistant_voice: "M5",
            assistant_peak_dbfs: CONVERSATIONAL_ASSISTANT_PEAK_DBFS,
            injection: Injection::Speech {
                text: "Stopp, einen Moment bitte.",
                voice: "F3",
                timing: SpeechTiming::DuringAssistant(80),
                peak_dbfs: -6.0,
                clarity: Clarity::Clean,
            },
            expectation: Expectation::UnsafeEarlySpeech,
            required: true,
        },
        Scenario {
            name: "telephone_band_interrupt",
            assistant_text: ANSWER,
            assistant_voice: "M5",
            assistant_peak_dbfs: CONVERSATIONAL_ASSISTANT_PEAK_DBFS,
            injection: Injection::Speech {
                text: "Nein, öffne bitte den Kalender.",
                voice: "M3",
                timing: SpeechTiming::DuringAssistant(1_350),
                peak_dbfs: -9.0,
                clarity: Clarity::Telephone,
            },
            expectation: Expectation::Interrupt {
                keywords: &["nein", "kalender", "öffne"],
            },
            required: false,
        },
    ]
}

#[derive(Clone, Debug)]
pub struct ScenarioTracks {
    pub assistant: Vec<f32>,
    pub injection: Vec<f32>,
    pub injection_start_frame: Option<usize>,
    pub assistant_start_frame: usize,
    pub assistant_end_frame: usize,
}

pub fn resample(pcm: &SynthesizedPcm, output_rate_hz: u32) -> Vec<f32> {
    if pcm.sample_rate_hz == output_rate_hz {
        return pcm.samples.clone();
    }
    let mut resampler = StreamingSincResampler::new(pcm.sample_rate_hz, output_rate_hz)
        .expect("validated synthesis and output rates");
    let mut output = Vec::with_capacity(
        pcm.samples.len() * output_rate_hz as usize / pcm.sample_rate_hz as usize + 32,
    );
    resampler.process(&pcm.samples, &mut output);
    resampler.flush(&mut output);
    output
}

pub fn build_tracks(
    scenario: &Scenario,
    output_rate_hz: u32,
    assistant_pcm: &SynthesizedPcm,
    injected_speech_pcm: Option<&SynthesizedPcm>,
) -> ScenarioTracks {
    let assistant_start_frame = frames(ASSISTANT_LEAD_MS, output_rate_hz);
    let mut assistant_speech = resample(assistant_pcm, output_rate_hz);
    normalize_speech(&mut assistant_speech, scenario.assistant_peak_dbfs);
    let assistant_end_frame = assistant_start_frame + assistant_speech.len();

    let (injection_start_frame, injection_len) = match &scenario.injection {
        Injection::None => (None, 0),
        Injection::HouseholdNoise {
            start_after_assistant_ms,
            duration_ms,
            ..
        } => (
            Some(assistant_start_frame + frames(*start_after_assistant_ms, output_rate_hz)),
            frames(*duration_ms, output_rate_hz),
        ),
        Injection::Speech { timing, .. } => {
            let pcm = injected_speech_pcm.expect("speech scenario has synthesized user audio");
            let start = match timing {
                SpeechTiming::DuringAssistant(offset_ms) => {
                    assistant_start_frame + frames(*offset_ms, output_rate_hz)
                }
                SpeechTiming::AfterAssistant(offset_ms) => {
                    assistant_end_frame + frames(*offset_ms, output_rate_hz)
                }
            };
            (Some(start), resample(pcm, output_rate_hz).len())
        }
    };
    let end = assistant_end_frame
        .max(
            injection_start_frame
                .unwrap_or(0)
                .saturating_add(injection_len),
        )
        .saturating_add(frames(TRAILING_SILENCE_MS, output_rate_hz));
    let mut assistant = vec![0.0; end];
    assistant[assistant_start_frame..assistant_end_frame].copy_from_slice(&assistant_speech);
    let mut injection = vec![0.0; end];

    match &scenario.injection {
        Injection::None => {}
        Injection::HouseholdNoise { peak_dbfs, .. } => {
            let start = injection_start_frame.unwrap();
            let noise = household_noise(injection_len, output_rate_hz, *peak_dbfs);
            injection[start..start + noise.len()].copy_from_slice(&noise);
        }
        Injection::Speech {
            peak_dbfs, clarity, ..
        } => {
            let start = injection_start_frame.unwrap();
            let mut speech = resample(injected_speech_pcm.unwrap(), output_rate_hz);
            apply_clarity(&mut speech, output_rate_hz, *clarity);
            normalize_speech(&mut speech, *peak_dbfs);
            injection[start..start + speech.len()].copy_from_slice(&speech);
        }
    }

    ScenarioTracks {
        assistant,
        injection,
        injection_start_frame,
        assistant_start_frame,
        assistant_end_frame,
    }
}

fn frames(milliseconds: u32, rate: u32) -> usize {
    rate as usize * milliseconds as usize / 1_000
}

fn normalize_peak(samples: &mut [f32], peak_dbfs: f32) {
    let current = samples
        .iter()
        .fold(0.0_f32, |peak, sample| peak.max(sample.abs()));
    if current <= 1.0e-6 {
        return;
    }
    let target = 10.0_f32.powf(peak_dbfs.clamp(-48.0, -3.0) / 20.0);
    let gain = target / current;
    for sample in samples {
        *sample = (*sample * gain).clamp(-1.0, 1.0);
    }
}

/// Speech has a much larger crest factor than the PRBS used by calibration.
/// Raise its active RMS to six decibels below the qualified peak and limit only
/// the rare crests, otherwise a nominal -18 dBFS utterance lands close to the
/// room noise floor even though its single highest sample reaches -18 dBFS.
fn normalize_speech(samples: &mut [f32], peak_dbfs: f32) {
    let peak = samples
        .iter()
        .fold(0.0_f32, |value, sample| value.max(sample.abs()));
    if peak <= 1.0e-6 {
        return;
    }
    let floor = peak * 0.01;
    let (power, count) = samples
        .iter()
        .fold((0.0_f32, 0_usize), |(power, count), sample| {
            if sample.abs() >= floor {
                (power + sample * sample, count + 1)
            } else {
                (power, count)
            }
        });
    let active_rms = (power / count.max(1) as f32).sqrt();
    let peak_limit = 10.0_f32.powf(peak_dbfs.clamp(-48.0, -6.0) / 20.0);
    let target_rms = peak_limit * 0.5;
    let gain = target_rms / active_rms.max(1.0e-6);
    for sample in samples {
        *sample = (*sample * gain).clamp(-peak_limit, peak_limit);
    }
}

fn apply_clarity(samples: &mut [f32], rate: u32, clarity: Clarity) {
    match clarity {
        Clarity::Clean => {}
        Clarity::Muffled => low_pass(samples, rate, 1_500.0),
        Clarity::Telephone => {
            high_pass(samples, rate, 300.0);
            low_pass(samples, rate, 3_200.0);
        }
    }
}

fn low_pass(samples: &mut [f32], rate: u32, cutoff_hz: f32) {
    let dt = 1.0 / rate as f32;
    let rc = 1.0 / (std::f32::consts::TAU * cutoff_hz);
    let alpha = dt / (rc + dt);
    let mut state = 0.0;
    for sample in samples {
        state += alpha * (*sample - state);
        *sample = state;
    }
}

fn high_pass(samples: &mut [f32], rate: u32, cutoff_hz: f32) {
    let dt = 1.0 / rate as f32;
    let rc = 1.0 / (std::f32::consts::TAU * cutoff_hz);
    let alpha = rc / (rc + dt);
    let mut previous_input = 0.0;
    let mut previous_output = 0.0;
    for sample in samples {
        let input = *sample;
        let output = alpha * (previous_output + input - previous_input);
        previous_input = input;
        previous_output = output;
        *sample = output;
    }
}

fn household_noise(len: usize, rate: u32, peak_dbfs: f32) -> Vec<f32> {
    let mut output = vec![0.0; len];
    let mut state = 0x6d2b_79f5_u32;
    for (index, sample) in output.iter_mut().enumerate() {
        state = state.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
        let white = ((state >> 8) as f32 / 8_388_608.0) - 1.0;
        let background = white * 0.05;
        let click_period = (rate as usize / 7).max(1);
        let click_phase = index % click_period;
        let click = if click_phase < 18 {
            white * (1.0 - click_phase as f32 / 18.0)
        } else {
            0.0
        };
        let cough_center = len * 2 / 3;
        let distance = index.abs_diff(cough_center) as f32;
        let cough_width = (rate as f32 * 0.11).max(1.0);
        let cough = white * (-0.5 * (distance / cough_width).powi(2)).exp() * 0.65;
        *sample = background + click + cough;
    }
    low_pass(&mut output, rate, 2_600.0);
    normalize_peak(&mut output, peak_dbfs);
    output
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pcm(samples: usize) -> SynthesizedPcm {
        SynthesizedPcm {
            samples: vec![0.5; samples],
            sample_rate_hz: 48_000,
        }
    }

    #[test]
    fn overlapping_speech_is_only_in_the_injection_track() {
        let scenario = built_in_scenarios()
            .into_iter()
            .find(|scenario| scenario.name == "clear_mid_sentence_interrupt")
            .unwrap();
        let tracks = build_tracks(&scenario, 48_000, &pcm(96_000), Some(&pcm(24_000)));
        let start = tracks.injection_start_frame.unwrap();
        assert!(tracks.assistant[start].abs() > 0.0);
        assert!(tracks.injection[start].abs() > 0.0);
        assert!(tracks.injection[..start]
            .iter()
            .all(|sample| *sample == 0.0));
        assert_eq!(tracks.assistant_start_frame, 33_600);
    }

    #[test]
    fn follow_up_starts_after_the_synthesized_answer_ends() {
        let scenario = built_in_scenarios()
            .into_iter()
            .find(|scenario| scenario.name == "follow_up_after_answer")
            .unwrap();
        let tracks = build_tracks(&scenario, 48_000, &pcm(48_000), Some(&pcm(24_000)));
        assert_eq!(
            tracks.injection_start_frame.unwrap() - tracks.assistant_end_frame,
            57_600
        );
    }

    #[test]
    fn scenario_corpus_covers_safety_and_natural_variants() {
        let scenarios = built_in_scenarios();
        assert!(scenarios
            .iter()
            .any(|scenario| matches!(scenario.expectation, Expectation::NoConfirmation)));
        assert!(scenarios
            .iter()
            .any(|scenario| matches!(scenario.expectation, Expectation::Interrupt { .. })));
        assert!(scenarios
            .iter()
            .any(|scenario| matches!(scenario.expectation, Expectation::FollowUp { .. })));
        assert!(scenarios
            .iter()
            .any(|scenario| matches!(scenario.expectation, Expectation::UnsafeEarlySpeech)));
        assert!(scenarios.iter().any(|scenario| matches!(
            scenario.injection,
            Injection::Speech {
                clarity: Clarity::Telephone,
                ..
            }
        )));
        let voices = scenarios
            .iter()
            .filter_map(|scenario| match scenario.injection {
                Injection::Speech { voice, .. } => Some(voice),
                _ => None,
            })
            .collect::<std::collections::BTreeSet<_>>();
        assert!(
            voices.len() >= 3,
            "speaker corpus needs at least three voices"
        );
    }
}
