#[derive(Clone, Debug, PartialEq)]
pub struct VoiceConfigV1 {
    /// Deployment policy for automatic interruption while far-end audio is audible.
    /// Echo convergence and lexical confirmation remain mandatory when enabled.
    pub allow_full_duplex_barge_in: bool,
    /// Explicit, default-off tester policy that may confirm while software AEC
    /// is adapting. The candidate must also have sustained post-AEC near-end
    /// evidence and must not resemble the active narration.
    pub allow_tester_adapting_barge_in: bool,
    pub speech_threshold: f32,
    pub start_windows: u32,
    pub end_windows: u32,
    pub target_asr_peak: f32,
    pub max_asr_gain: f32,
    pub output_fade_ms: u32,
    pub max_synthesized_lead_ms: u32,
    pub max_queued_segments: usize,
    pub max_segment_chars: usize,
    pub aec_min_adaptation_ms: u32,
    pub aec_stable_delay_ms: u32,
    pub aec_history_ms: u32,
    pub minimum_echo_return_loss_enhancement_db: f64,
    pub tester_near_end_max_attenuation_db: f32,
    pub tester_near_end_min_clean_rms: f32,
    pub tester_near_end_frames: u32,
    pub render_silence_rms: f32,
    pub saturation_fraction: f32,
    pub saturation_frames: u32,
    pub maximum_drift_ppm: u32,
    pub drift_slew_ppm_per_second: u32,
}

impl Default for VoiceConfigV1 {
    fn default() -> Self {
        Self {
            allow_full_duplex_barge_in: true,
            allow_tester_adapting_barge_in: false,
            speech_threshold: 0.5,
            start_windows: 2,
            end_windows: 28,
            target_asr_peak: 0.7,
            max_asr_gain: 8.0,
            output_fade_ms: 80,
            max_synthesized_lead_ms: 4_000,
            max_queued_segments: 8,
            max_segment_chars: 512,
            aec_min_adaptation_ms: 300,
            aec_stable_delay_ms: 200,
            aec_history_ms: 500,
            minimum_echo_return_loss_enhancement_db: 15.0,
            tester_near_end_max_attenuation_db: 6.0,
            tester_near_end_min_clean_rms: 0.003,
            tester_near_end_frames: 5,
            render_silence_rms: 0.001,
            saturation_fraction: 0.01,
            saturation_frames: 3,
            maximum_drift_ppm: 1_000,
            drift_slew_ppm_per_second: 50,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tester_deployment_enables_full_duplex_by_default() {
        let config = VoiceConfigV1::default();
        assert!(config.allow_full_duplex_barge_in);
        assert!(!config.allow_tester_adapting_barge_in);
    }
}
