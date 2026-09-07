//! QuickJS session manager for actor fixture logic.

use rquickjs::{Context, Runtime};
use serde::Deserialize;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// Hard ceiling on a fixture-logic eval: vibe logic is UI glue, not computation.
/// An infinite loop or runaway allocation must error out, never freeze the app.
const EVAL_MEMORY_LIMIT_BYTES: usize = 32 * 1024 * 1024;
const EVAL_DEADLINE: Duration = Duration::from_secs(2);

/// A fresh per-eval runtime with memory + CPU bounds. Each call gets its own
/// runtime (no state leaks between evals), its own 32 MiB allocation cap, and a
/// 2-second interrupt deadline measured from runtime creation.
fn bounded_runtime() -> Result<Runtime, String> {
	let runtime = Runtime::new().map_err(|e| e.to_string())?;
	runtime.set_memory_limit(EVAL_MEMORY_LIMIT_BYTES);
	let deadline = Instant::now() + EVAL_DEADLINE;
	runtime.set_interrupt_handler(Some(Box::new(move || Instant::now() >= deadline)));
	Ok(runtime)
}

#[derive(Debug, Deserialize, Default)]
pub struct InterfaceDef {
	#[serde(default)]
	pub properties: Option<HashMap<String, Value>>,
}

impl InterfaceDef {
	pub fn allows(&self, send: &str) -> bool {
		self.properties
			.as_ref()
			.is_some_and(|props| props.contains_key(send))
	}
}

pub struct SessionManager {
	sessions: Mutex<HashMap<String, Session>>,
}

impl Default for SessionManager {
	fn default() -> Self {
		Self {
			sessions: Mutex::new(HashMap::new()),
		}
	}
}

pub struct Session {
	pub state: Value,
	pub logic: String,
	pub interface: InterfaceDef,
}

impl SessionManager {
	pub fn mount(
		&self,
		logic: String,
		source: Value,
		interface: InterfaceDef,
	) -> Result<(String, Value), String> {
		let state = run_init_state(&logic, &source)?;
		let session_id = uuid::Uuid::new_v4().to_string();
		let session = Session {
			state,
			logic,
			interface,
		};
		let state = session.state.clone();
		self.sessions
			.lock()
			.map_err(|e| e.to_string())?
			.insert(session_id.clone(), session);
		Ok((session_id, state))
	}

	pub fn dispatch(
		&self,
		session_id: &str,
		send: &str,
		payload: Value,
	) -> Result<Value, String> {
		let mut sessions = self.sessions.lock().map_err(|e| e.to_string())?;
		let session = sessions
			.get_mut(session_id)
			.ok_or_else(|| format!("session not found: {session_id}"))?;

		if !session.interface.allows(send) {
			return Err(format!("event not allowed by interface: {send}"));
		}

		let next = run_handle_event(&session.logic, send, &payload, &session.state)?;
		session.state = next.clone();
		Ok(next)
	}

	pub fn unmount(&self, session_id: &str) -> Result<(), String> {
		self.sessions
			.lock()
			.map_err(|e| e.to_string())?
			.remove(session_id);
		Ok(())
	}
}

fn run_init_state(logic: &str, source: &Value) -> Result<Value, String> {
	let runtime = bounded_runtime()?;
	let context = Context::full(&runtime).map_err(|e| e.to_string())?;
	let json: String = context
		.with(|ctx| -> Result<String, String> {
			ctx.eval::<(), _>(logic).map_err(|e| e.to_string())?;
			let source_json = serde_json::to_string(source).map_err(|e| e.to_string())?;
			let script = format!(
				"JSON.stringify(initState(JSON.parse({})))",
				serde_json::to_string(&source_json).map_err(|e| e.to_string())?
			);
			ctx.eval::<String, _>(script).map_err(|e| e.to_string())
		})
		.map_err(|e| e.to_string())?;
	serde_json::from_str(&json).map_err(|e| e.to_string())
}

fn run_handle_event(logic: &str, send: &str, payload: &Value, state: &Value) -> Result<Value, String> {
	let runtime = bounded_runtime()?;
	let context = Context::full(&runtime).map_err(|e| e.to_string())?;
	let json: String = context
		.with(|ctx| -> Result<String, String> {
			ctx.eval::<(), _>(logic).map_err(|e| e.to_string())?;
			let script = format!(
				"(function() {{ if (typeof handleEvent !== 'function') return ''; var r = handleEvent({}, {}, {}); return r == null ? '' : JSON.stringify(r); }})()",
				serde_json::to_string(send).map_err(|e| e.to_string())?,
				serde_json::to_string(payload).map_err(|e| e.to_string())?,
				serde_json::to_string(state).map_err(|e| e.to_string())?
			);
			ctx.eval::<String, _>(script).map_err(|e| e.to_string())
		})
		.map_err(|e| e.to_string())?;
	if json.is_empty() {
		return Ok(state.clone());
	}
	serde_json::from_str(&json).map_err(|e| e.to_string())
}

/// Run a vibe's agent-tool executor in the sandbox: eval `logic`, call the global
/// `executeTool(name, args, data)`, and return its JSON result. STATELESS (fresh bounded runtime,
/// no session) — the vibe is the planner: it validates `args` against `data` and returns a PLAN
/// (a list of CRUD ops + a machine-facing result), which the trusted host then applies to avenDB.
/// The sandbox never touches data directly, so an untrusted vibe can only ever propose ops.
pub fn run_tool(logic: &str, name: &str, args: &Value, data: &Value) -> Result<Value, String> {
	let runtime = bounded_runtime()?;
	let context = Context::full(&runtime).map_err(|e| e.to_string())?;
	let json: String = context
		.with(|ctx| -> Result<String, String> {
			ctx.eval::<(), _>(logic).map_err(|e| e.to_string())?;
			let script = format!(
				"(function() {{ if (typeof executeTool !== 'function') return ''; var r = executeTool({}, {}, {}); return r == null ? '' : JSON.stringify(r); }})()",
				serde_json::to_string(name).map_err(|e| e.to_string())?,
				serde_json::to_string(args).map_err(|e| e.to_string())?,
				serde_json::to_string(data).map_err(|e| e.to_string())?
			);
			ctx.eval::<String, _>(script).map_err(|e| e.to_string())
		})
		.map_err(|e| e.to_string())?;
	if json.is_empty() {
		return Err(format!("vibe logic exposes no executeTool for: {name}"));
	}
	serde_json::from_str(&json).map_err(|e| e.to_string())
}

#[cfg(test)]
mod eval_bounds {
	use super::*;
	use serde_json::json;

	#[test]
	fn well_behaved_logic_still_works() {
		let logic = "function initState(source) { return { count: source.start } }";
		let state = run_init_state(logic, &json!({ "start": 3 })).unwrap();
		assert_eq!(state, json!({ "count": 3 }));
	}

	#[test]
	fn infinite_loop_is_interrupted_not_hung() {
		let logic = "function initState(source) { while (true) {} }";
		let started = Instant::now();
		let result = run_init_state(logic, &json!({}));
		assert!(result.is_err(), "infinite loop must error out, got {result:?}");
		// Deadline is 2s; allow generous slack for slow CI but prove it didn't hang.
		assert!(
			started.elapsed() < Duration::from_secs(10),
			"interrupt must fire near the deadline, took {:?}",
			started.elapsed()
		);
	}

	#[test]
	fn runaway_allocation_is_capped() {
		// Tries to allocate far past the 32 MiB cap; must error (OOM or interrupt),
		// never abort the process.
		let logic = "function initState(source) { var a = []; for (;;) { a.push(new Array(1000000).fill(1)) } }";
		let result = run_init_state(logic, &json!({}));
		assert!(result.is_err(), "runaway allocation must error out, got {result:?}");
	}

	#[test]
	fn dispatch_infinite_loop_is_interrupted() {
		let manager = SessionManager::default();
		let logic = "function initState(s) { return {} }\nfunction handleEvent(send, payload, state) { while (true) {} }";
		let interface = InterfaceDef {
			properties: Some(HashMap::from([("tick".to_string(), json!({}))])),
		};
		let (session_id, _) = manager.mount(logic.into(), json!({}), interface).unwrap();
		let result = manager.dispatch(&session_id, "tick", json!({}));
		assert!(result.is_err(), "looping handleEvent must error out, got {result:?}");
	}
}
