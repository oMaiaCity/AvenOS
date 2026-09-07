use aven_voice_protocol::{SpeakerAttribution, SpeakerId};

const DEFAULT_MAX_SPEAKERS: usize = 3;
const DEFAULT_MATCH_THRESHOLD: f32 = 0.55;
const DEFAULT_SWITCH_MARGIN: f32 = 0.06;

#[derive(Clone, Debug)]
struct SpeakerCluster {
    id: SpeakerId,
    centroid: Vec<f32>,
    observations: u32,
}

/// Pure session-local clustering owned by the semantic core. Only embeddings
/// from confirmed candidates reach this type, so discarded echo and noise can
/// never create or update an apparent person.
#[derive(Clone, Debug)]
pub struct SpeakerClusters {
    clusters: Vec<SpeakerCluster>,
    last_cluster: Option<usize>,
    max_speakers: usize,
    match_threshold: f32,
    switch_margin: f32,
}

impl Default for SpeakerClusters {
    fn default() -> Self {
        Self::with_config(
            DEFAULT_MAX_SPEAKERS,
            DEFAULT_MATCH_THRESHOLD,
            DEFAULT_SWITCH_MARGIN,
        )
    }
}

impl SpeakerClusters {
    pub fn with_config(max_speakers: usize, match_threshold: f32, switch_margin: f32) -> Self {
        Self {
            clusters: Vec::with_capacity(max_speakers),
            last_cluster: None,
            max_speakers: max_speakers.max(1),
            match_threshold: match_threshold.clamp(-1.0, 1.0),
            switch_margin: switch_margin.max(0.0),
        }
    }

    pub fn reset(&mut self) {
        self.clusters.clear();
        self.last_cluster = None;
    }

    pub fn assign(&mut self, embedding: Vec<f32>) -> Option<SpeakerAttribution> {
        if embedding.is_empty()
            || embedding.iter().any(|value| !value.is_finite())
            || (embedding.iter().map(|value| value * value).sum::<f32>() - 1.0).abs() > 0.02
            || self
                .clusters
                .first()
                .is_some_and(|cluster| cluster.centroid.len() != embedding.len())
        {
            return None;
        }
        if self.clusters.is_empty() {
            return Some(self.create_cluster(embedding));
        }

        let mut scores = self
            .clusters
            .iter()
            .enumerate()
            .map(|(index, cluster)| (index, cosine(&embedding, &cluster.centroid)))
            .collect::<Vec<_>>();
        scores.sort_by(|left, right| right.1.total_cmp(&left.1));
        let (mut selected, mut score) = scores[0];
        if let Some(previous) = self.last_cluster.filter(|index| *index != selected) {
            let previous_score = scores
                .iter()
                .find_map(|(index, score)| (*index == previous).then_some(*score))
                .unwrap_or(-1.0);
            if score - previous_score < self.switch_margin {
                selected = previous;
                score = previous_score;
            }
        }
        if score < self.match_threshold && self.clusters.len() < self.max_speakers {
            return Some(self.create_cluster(embedding));
        }

        self.update_cluster(selected, &embedding);
        self.last_cluster = Some(selected);
        Some(SpeakerAttribution {
            speaker_id: self.clusters[selected].id.clone(),
            confidence: score.clamp(0.0, 1.0),
        })
    }

    fn create_cluster(&mut self, embedding: Vec<f32>) -> SpeakerAttribution {
        let index = self.clusters.len();
        let id = SpeakerId::parse(format!("speaker-{}", index + 1))
            .expect("bounded speaker index makes a valid speaker ID");
        self.clusters.push(SpeakerCluster {
            id: id.clone(),
            centroid: embedding,
            observations: 1,
        });
        self.last_cluster = Some(index);
        SpeakerAttribution {
            speaker_id: id,
            confidence: 1.0,
        }
    }

    fn update_cluster(&mut self, index: usize, embedding: &[f32]) {
        let cluster = &mut self.clusters[index];
        let prior_weight = cluster.observations.min(15) as f32;
        for (centroid, sample) in cluster.centroid.iter_mut().zip(embedding) {
            *centroid = (*centroid * prior_weight + sample) / (prior_weight + 1.0);
        }
        normalize(&mut cluster.centroid);
        cluster.observations = cluster.observations.saturating_add(1);
    }
}

fn cosine(left: &[f32], right: &[f32]) -> f32 {
    if left.len() != right.len() || left.is_empty() {
        return -1.0;
    }
    left.iter().zip(right).map(|(a, b)| a * b).sum()
}

fn normalize(values: &mut [f32]) {
    let norm = values.iter().map(|value| value * value).sum::<f32>().sqrt();
    if norm > f32::EPSILON {
        for value in values {
            *value /= norm;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stable_voice_keeps_one_anonymous_label() {
        let mut clusters = SpeakerClusters::default();
        let first = clusters.assign(vec![1.0, 0.0, 0.0]).unwrap();
        let norm = (0.98_f32 * 0.98 + 0.05 * 0.05).sqrt();
        let second = clusters
            .assign(vec![0.98 / norm, 0.05 / norm, 0.0])
            .unwrap();
        assert_eq!(first.speaker_id, second.speaker_id);
        assert_eq!(clusters.clusters.len(), 1);
    }

    #[test]
    fn three_distinct_voices_create_three_bounded_clusters() {
        let mut clusters = SpeakerClusters::default();
        let labels = [
            vec![1.0, 0.0, 0.0],
            vec![0.0, 1.0, 0.0],
            vec![0.0, 0.0, 1.0],
            vec![-1.0, 0.0, 0.0],
        ]
        .into_iter()
        .map(|embedding| clusters.assign(embedding).unwrap().speaker_id)
        .collect::<Vec<_>>();
        assert_eq!(labels[0].as_str(), "speaker-1");
        assert_eq!(labels[1].as_str(), "speaker-2");
        assert_eq!(labels[2].as_str(), "speaker-3");
        assert_eq!(clusters.clusters.len(), 3);
        assert!(labels[3].as_str().starts_with("speaker-"));
    }

    #[test]
    fn close_scores_keep_the_previous_label_to_avoid_churn() {
        let mut clusters = SpeakerClusters::with_config(3, 0.55, 0.08);
        assert_eq!(
            clusters.assign(vec![1.0, 0.0]).unwrap().speaker_id.as_str(),
            "speaker-1"
        );
        assert_eq!(
            clusters.assign(vec![0.0, 1.0]).unwrap().speaker_id.as_str(),
            "speaker-2"
        );
        let norm = (0.69_f32 * 0.69 + 0.72 * 0.72).sqrt();
        assert_eq!(
            clusters
                .assign(vec![0.69 / norm, 0.72 / norm])
                .unwrap()
                .speaker_id
                .as_str(),
            "speaker-2"
        );
    }

    #[test]
    fn invalid_embedding_cannot_create_a_cluster() {
        let mut clusters = SpeakerClusters::default();
        assert!(clusters.assign(vec![f32::NAN, 0.0]).is_none());
        assert!(clusters.assign(vec![0.0, 0.0]).is_none());
        assert!(clusters.clusters.is_empty());

        assert!(clusters.assign(vec![1.0, 0.0]).is_some());
        assert!(clusters.assign(vec![1.0, 0.0, 0.0]).is_none());
        assert_eq!(clusters.clusters.len(), 1);
    }
}
