use aven_voice_core::{CachedResult, Command};
use aven_voice_protocol::*;
use tauri::State;
#[cfg(feature = "e2e-voice-proof")]
use tauri::Emitter;

use super::service::{ServiceError, VoiceService};

fn protocol_error(error: ValidationError) -> ServiceError {
	ServiceError {
		code: match error {
			ValidationError::InvalidProtocolVersion => VoiceErrorCode::ProtocolMismatch,
			ValidationError::InvalidText => VoiceErrorCode::InvalidText,
			ValidationError::InvalidId(_) | ValidationError::InvalidDecimal => {
				VoiceErrorCode::Internal
			}
		},
		message: error.to_string(),
	}
}

fn validate_meta(meta: &CommandMeta) -> Result<(), ServiceError> {
	meta.validate().map_err(protocol_error)
}

fn validate_id<T>(
	value: &str,
	parse: impl FnOnce(String) -> Result<T, ValidationError>,
) -> Result<(), ServiceError> {
	parse(value.to_owned()).map(|_| ()).map_err(protocol_error)
}

async fn blocking<T: Send + 'static>(
	operation: impl FnOnce() -> Result<T, ServiceError> + Send + 'static,
) -> Result<T, ServiceError> {
	tauri::async_runtime::spawn_blocking(operation)
		.await
		.map_err(|_| ServiceError {
			code: VoiceErrorCode::Internal,
			message: "The voice operation stopped unexpectedly.".into(),
		})?
}

#[tauri::command]
pub async fn voice_prepare(
	service: State<'_, VoiceService>,
	request: VoicePrepareRequest,
) -> Result<PreparationSnapshot, ServiceError> {
	validate_meta(&request.meta)?;
	let service = service.inner().clone();
	blocking(move || {
		let features = request.features.clone();
		service.command(Command::Prepare {
			request_id: request.meta.request_id,
			features: request.features,
		})?;
		Ok(service.wait_for_preparation(&features))
	})
	.await
}

#[tauri::command]
pub async fn voice_session_start(
	service: State<'_, VoiceService>,
	request: VoiceSessionStartRequest,
) -> Result<VoiceSessionStarted, ServiceError> {
	validate_meta(&request.meta)?;
	let service = service.inner().clone();
	blocking(move || {
		let result = service.command(Command::StartSession {
			request_id: request.meta.request_id,
			preferred_input: request.preferred_input,
			preferred_output: request.preferred_output,
		})?;
		let CachedResult::Session(session_id) = result else {
			return Err(internal(
				"The voice runtime returned an invalid session response.",
			));
		};
		let snapshot = service.wait_for_session(&session_id)?;
		Ok(VoiceSessionStarted {
			session_id,
			snapshot,
		})
	})
	.await
}

#[tauri::command]
pub async fn voice_session_stop(
	service: State<'_, VoiceService>,
	request: VoiceSessionStopRequest,
) -> Result<(), ServiceError> {
	validate_meta(&request.meta)?;
	validate_id(request.session_id.as_str(), SessionId::parse)?;
	let service = service.inner().clone();
	blocking(move || {
		let session_id = request.session_id.clone();
		service.command(Command::StopSession {
			request_id: request.meta.request_id,
			session_id: request.session_id,
		})?;
		service.set_diagnostics(session_id, false);
		Ok(())
	})
	.await
}

#[tauri::command]
pub async fn voice_speech_begin(
	service: State<'_, VoiceService>,
	request: VoiceSpeechBeginRequest,
) -> Result<SpeechTurnStarted, ServiceError> {
	validate_meta(&request.meta)?;
	validate_id(request.session_id.as_str(), SessionId::parse)?;
	if let Some(key) = &request.client_turn_key {
		validate_id(key.as_str(), ClientTurnKey::parse)?;
	}
	let service = service.inner().clone();
	blocking(move || {
		let result = service.command(Command::BeginSpeech {
			request_id: request.meta.request_id,
			session_id: request.session_id,
			client_turn_key: request.client_turn_key,
			language: request.language,
			voice: request.voice,
		})?;
		let CachedResult::Turn(turn_id) = result else {
			return Err(internal(
				"The voice runtime returned an invalid turn response.",
			));
		};
		Ok(SpeechTurnStarted {
			turn_id,
			pending_segment_capacity: 8,
		})
	})
	.await
}

#[tauri::command]
pub async fn voice_speech_enqueue(
	service: State<'_, VoiceService>,
	request: VoiceSpeechEnqueueRequest,
) -> Result<EnqueueResult, ServiceError> {
	validate_meta(&request.meta)?;
	request.validate_text().map_err(protocol_error)?;
	validate_id(request.session_id.as_str(), SessionId::parse)?;
	validate_id(request.turn_id.as_str(), TurnId::parse)?;
	let service = service.inner().clone();
	blocking(move || {
		let result = service.command(Command::EnqueueSpeech {
			request_id: request.meta.request_id,
			session_id: request.session_id,
			turn_id: request.turn_id,
			segment_index: request.segment_index,
			text: request.text,
		})?;
		let CachedResult::Enqueued {
			idempotent,
			remaining_capacity,
		} = result
		else {
			return Err(internal(
				"The voice runtime returned an invalid enqueue response.",
			));
		};
		Ok(EnqueueResult {
			accepted: true,
			idempotent,
			remaining_segment_capacity: remaining_capacity.min(u16::MAX as usize) as u16,
		})
	})
	.await
}

#[tauri::command]
pub async fn voice_speech_finish(
	service: State<'_, VoiceService>,
	request: VoiceSpeechFinishRequest,
) -> Result<(), ServiceError> {
	validate_meta(&request.meta)?;
	validate_id(request.session_id.as_str(), SessionId::parse)?;
	validate_id(request.turn_id.as_str(), TurnId::parse)?;
	let service = service.inner().clone();
	blocking(move || {
		service.command(Command::FinishSpeech {
			request_id: request.meta.request_id,
			session_id: request.session_id,
			turn_id: request.turn_id,
		})?;
		Ok(())
	})
	.await
}

#[tauri::command]
pub async fn voice_speech_cancel(
	service: State<'_, VoiceService>,
	request: VoiceSpeechCancelRequest,
) -> Result<(), ServiceError> {
	validate_meta(&request.meta)?;
	validate_id(request.session_id.as_str(), SessionId::parse)?;
	if let Some(turn) = &request.turn_id {
		validate_id(turn.as_str(), TurnId::parse)?;
	}
	let service = service.inner().clone();
	blocking(move || {
		service.command(Command::CancelSpeech {
			request_id: request.meta.request_id,
			session_id: request.session_id,
			turn_id: request.turn_id,
			reason: request.reason,
		})?;
		Ok(())
	})
	.await
}

#[tauri::command]
pub async fn voice_input_reset(
	service: State<'_, VoiceService>,
	request: VoiceInputResetRequest,
) -> Result<(), ServiceError> {
	validate_meta(&request.meta)?;
	validate_id(request.session_id.as_str(), SessionId::parse)?;
	let service = service.inner().clone();
	blocking(move || {
		service.command(Command::ResetInput {
			request_id: request.meta.request_id,
			session_id: request.session_id,
			reason: request.reason,
		})?;
		Ok(())
	})
	.await
}

#[tauri::command]
pub async fn voice_snapshot(
	service: State<'_, VoiceService>,
	request: VoiceSnapshotRequest,
) -> Result<VoiceSnapshot, ServiceError> {
	validate_meta(&request.meta)?;
	if let Some(session) = &request.session_id {
		validate_id(session.as_str(), SessionId::parse)?;
	}
	let service = service.inner().clone();
	blocking(move || service.snapshot(request.session_id)).await
}

#[tauri::command]
pub async fn voice_diagnostics_subscribe(
	service: State<'_, VoiceService>,
	request: VoiceDiagnosticsSubscribeRequest,
) -> Result<(), ServiceError> {
	validate_meta(&request.meta)?;
	validate_id(request.session_id.as_str(), SessionId::parse)?;
	let service = service.inner().clone();
	blocking(move || {
		service.command(Command::SetDiagnostics {
			request_id: request.meta.request_id,
			session_id: request.session_id.clone(),
			enabled: request.enabled,
		})?;
		service.set_diagnostics(request.session_id, request.enabled);
		Ok(())
	})
	.await
}

/// Deterministic full-stack proof seam. Production builds register the command
/// but cannot execute it because the PCM fixture and emitter are compiled out.
#[tauri::command]
pub async fn voice_e2e_inject_silent_final(
	app: tauri::AppHandle,
	session_id: String,
) -> Result<serde_json::Value, ServiceError> {
	#[cfg(not(feature = "e2e-voice-proof"))]
	{
		let _ = (app, session_id);
		return Err(ServiceError {
			code: VoiceErrorCode::Internal,
			message: "The silent voice proof is not enabled in this build.".into(),
		});
	}

	#[cfg(feature = "e2e-voice-proof")]
	{
		let session_id = SessionId::parse(session_id).map_err(protocol_error)?;
		let fixture = blocking(|| {
			aven_voice_runtime::silent_fixture::generate_silent_contribution_fixture().map_err(
				|message| ServiceError {
					code: VoiceErrorCode::AsrFailed,
					message,
				},
			)
		})
		.await?;
		let candidate_id = CandidateId::parse("e2e-silent-candidate").map_err(protocol_error)?;
		let speaker_id = SpeakerId::parse(fixture.speaker_id.clone()).map_err(protocol_error)?;
		let events = [
			VoiceEvent::InputCandidateStarted {
				candidate_id: candidate_id.clone(),
				far_end_active: false,
			},
			VoiceEvent::InputPartial {
				candidate_id: candidate_id.clone(),
				text: fixture.text.clone(),
			},
			VoiceEvent::InputConfirmed {
				candidate_id: candidate_id.clone(),
				barge_in_started: false,
			},
			VoiceEvent::InputSpeakerIdentified {
				candidate_id: candidate_id.clone(),
				speaker: SpeakerAttribution {
					speaker_id,
					confidence: fixture.confidence,
				},
			},
			VoiceEvent::InputFinal {
				candidate_id,
				text: fixture.text.clone(),
			},
		];
		for (index, event) in events.into_iter().enumerate() {
			app.emit(
				"voice-event",
				VoiceEventEnvelope {
					protocol_version: PROTOCOL_VERSION,
					sequence: DecimalU64::new(index as u64 + 1),
					session_id: Some(session_id.clone()),
					route_generation: None,
					at_mono_ms: index as f64,
					event,
				},
			)
			.map_err(|error| ServiceError {
				code: VoiceErrorCode::Internal,
				message: format!("Could not emit the silent voice proof: {error}"),
			})?;
		}
		serde_json::to_value(fixture).map_err(|error| ServiceError {
			code: VoiceErrorCode::Internal,
			message: format!("Could not serialize the silent voice proof: {error}"),
		})
	}
}

/// Gives the frontend the deterministic fixture identity before any events
/// are emitted, so its event subscription can be scoped to the same session.
#[tauri::command]
pub async fn voice_e2e_duplex_fixture() -> Result<serde_json::Value, ServiceError> {
	#[cfg(not(feature = "e2e-voice-proof"))]
	{
		return Err(e2e_disabled());
	}

	#[cfg(feature = "e2e-voice-proof")]
	{
		serde_json::to_value(duplex_fixture().await?).map_err(serialization_error)
	}
}

/// Starts an E2E-only narrated turn so the browser can first observe active
/// playback and then independently trigger the interruption.
#[tauri::command]
pub async fn voice_e2e_begin_narration(
	app: tauri::AppHandle,
	session_id: String,
) -> Result<serde_json::Value, ServiceError> {
	#[cfg(not(feature = "e2e-voice-proof"))]
	{
		let _ = (app, session_id);
		return Err(e2e_disabled());
	}

	#[cfg(feature = "e2e-voice-proof")]
	{
		let session_id = SessionId::parse(session_id).map_err(protocol_error)?;
		let fixture = duplex_fixture().await?;
		validate_duplex_session(&fixture, &session_id)?;
		let turn_id = TurnId::parse(fixture.turn_id.clone()).map_err(protocol_error)?;
		emit_e2e_events(
			&app,
			&session_id,
			0,
			[
				VoiceEvent::PlaybackTurnStarted {
					turn_id: turn_id.clone(),
				},
				VoiceEvent::PlaybackStarted { turn_id },
			],
		)?;
		serde_json::to_value(fixture).map_err(serialization_error)
	}
}

/// Injects a PCM-derived, lexically confirmed first speaker. The pause after
/// confirmation gives the real actor bus time to abort the in-flight streamed
/// reply before the final utterance is submitted as the next turn.
#[tauri::command]
pub async fn voice_e2e_inject_interruption(
	app: tauri::AppHandle,
	session_id: String,
) -> Result<serde_json::Value, ServiceError> {
	#[cfg(not(feature = "e2e-voice-proof"))]
	{
		let _ = (app, session_id);
		return Err(e2e_disabled());
	}

	#[cfg(feature = "e2e-voice-proof")]
	{
		let session_id = SessionId::parse(session_id).map_err(protocol_error)?;
		let fixture = duplex_fixture().await?;
		validate_duplex_session(&fixture, &session_id)?;
		let turn_id = TurnId::parse(fixture.turn_id.clone()).map_err(protocol_error)?;
		let candidate_id =
			CandidateId::parse("e2e-duplex-interrupt").map_err(protocol_error)?;
		let speaker_id = SpeakerId::parse(fixture.interrupted.speaker_id.clone())
			.map_err(protocol_error)?;
		emit_e2e_events(
			&app,
			&session_id,
			2,
			[
				VoiceEvent::InputCandidateStarted {
					candidate_id: candidate_id.clone(),
					far_end_active: true,
				},
				VoiceEvent::InputPartial {
					candidate_id: candidate_id.clone(),
					text: fixture.interrupted.text.clone(),
				},
				VoiceEvent::InputConfirmed {
					candidate_id: candidate_id.clone(),
					barge_in_started: true,
				},
			],
		)?;
		blocking(|| {
			std::thread::sleep(std::time::Duration::from_millis(250));
			Ok(())
		})
		.await?;
		emit_e2e_events(
			&app,
			&session_id,
			5,
			[
				VoiceEvent::PlaybackFading {
					turn_id: turn_id.clone(),
					duration_ms: fixture.fade_duration_ms,
				},
				VoiceEvent::PlaybackCancelled {
					turn_id,
					reason: SpeechCancelReason::BargeIn,
				},
				VoiceEvent::InputSpeakerIdentified {
					candidate_id: candidate_id.clone(),
					speaker: SpeakerAttribution {
						speaker_id,
						confidence: fixture.interrupted.confidence,
					},
				},
				VoiceEvent::InputFinal {
					candidate_id,
					text: fixture.interrupted.text.clone(),
				},
			],
		)?;
		serde_json::to_value(fixture).map_err(serialization_error)
	}
}

/// Injects the second PCM-derived speaker after the interrupted turn has
/// settled, retaining the same E2E voice session and sequence.
#[tauri::command]
pub async fn voice_e2e_inject_second_speaker(
	app: tauri::AppHandle,
	session_id: String,
) -> Result<serde_json::Value, ServiceError> {
	#[cfg(not(feature = "e2e-voice-proof"))]
	{
		let _ = (app, session_id);
		return Err(e2e_disabled());
	}

	#[cfg(feature = "e2e-voice-proof")]
	{
		let session_id = SessionId::parse(session_id).map_err(protocol_error)?;
		let fixture = duplex_fixture().await?;
		validate_duplex_session(&fixture, &session_id)?;
		let candidate_id =
			CandidateId::parse("e2e-duplex-follow-up").map_err(protocol_error)?;
		let speaker_id = SpeakerId::parse(fixture.follow_up.speaker_id.clone())
			.map_err(protocol_error)?;
		emit_e2e_events(
			&app,
			&session_id,
			9,
			[
				VoiceEvent::InputCandidateStarted {
					candidate_id: candidate_id.clone(),
					far_end_active: false,
				},
				VoiceEvent::InputPartial {
					candidate_id: candidate_id.clone(),
					text: fixture.follow_up.text.clone(),
				},
				VoiceEvent::InputConfirmed {
					candidate_id: candidate_id.clone(),
					barge_in_started: false,
				},
				VoiceEvent::InputSpeakerIdentified {
					candidate_id: candidate_id.clone(),
					speaker: SpeakerAttribution {
						speaker_id,
						confidence: fixture.follow_up.confidence,
					},
				},
				VoiceEvent::InputFinal {
					candidate_id,
					text: fixture.follow_up.text.clone(),
				},
			],
		)?;
		serde_json::to_value(fixture).map_err(serialization_error)
	}
}

#[cfg(feature = "e2e-voice-proof")]
async fn duplex_fixture(
) -> Result<aven_voice_runtime::silent_fixture::SilentDuplexConversationFixture, ServiceError> {
	blocking(|| {
		aven_voice_runtime::silent_fixture::generate_silent_duplex_conversation_fixture().map_err(
			|message| ServiceError {
				code: VoiceErrorCode::AsrFailed,
				message,
			},
		)
	})
	.await
}

#[cfg(feature = "e2e-voice-proof")]
fn validate_duplex_session(
	fixture: &aven_voice_runtime::silent_fixture::SilentDuplexConversationFixture,
	session_id: &SessionId,
) -> Result<(), ServiceError> {
	if fixture.session_id == session_id.as_str() {
		Ok(())
	} else {
		Err(ServiceError {
			code: VoiceErrorCode::StaleSession,
			message: "The silent duplex fixture session is stale.".into(),
		})
	}
}

#[cfg(feature = "e2e-voice-proof")]
fn emit_e2e_events<const N: usize>(
	app: &tauri::AppHandle,
	session_id: &SessionId,
	sequence_offset: u64,
	events: [VoiceEvent; N],
) -> Result<(), ServiceError> {
	for (index, event) in events.into_iter().enumerate() {
		app.emit(
			"voice-event",
			VoiceEventEnvelope {
				protocol_version: PROTOCOL_VERSION,
				sequence: DecimalU64::new(sequence_offset + index as u64 + 1),
				session_id: Some(session_id.clone()),
				route_generation: None,
				at_mono_ms: (sequence_offset + index as u64) as f64,
				event,
			},
		)
		.map_err(|error| ServiceError {
			code: VoiceErrorCode::Internal,
			message: format!("Could not emit the silent duplex proof: {error}"),
		})?;
	}
	Ok(())
}

#[cfg(not(feature = "e2e-voice-proof"))]
fn e2e_disabled() -> ServiceError {
	ServiceError {
		code: VoiceErrorCode::Internal,
		message: "The silent voice proof is not enabled in this build.".into(),
	}
}

#[cfg(feature = "e2e-voice-proof")]
fn serialization_error(error: serde_json::Error) -> ServiceError {
	ServiceError {
		code: VoiceErrorCode::Internal,
		message: format!("Could not serialize the silent voice proof: {error}"),
	}
}

fn internal(message: &'static str) -> ServiceError {
	ServiceError {
		code: VoiceErrorCode::Internal,
		message: message.into(),
	}
}
