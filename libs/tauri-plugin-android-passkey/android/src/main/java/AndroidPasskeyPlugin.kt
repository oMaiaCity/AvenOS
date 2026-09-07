package ceo.aven.androidpasskey

import android.app.Activity
import android.Manifest
import android.util.Base64
import androidx.appcompat.app.AppCompatActivity
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetPublicKeyCredentialOption
import androidx.credentials.PublicKeyCredential
import androidx.credentials.exceptions.GetCredentialProviderConfigurationException
import androidx.credentials.exceptions.GetCredentialUnsupportedException
import androidx.credentials.exceptions.NoCredentialException
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.Permission
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

@InvokeArg
class LoginArgs {
    lateinit var domain: String
    var challenge: ByteArray = byteArrayOf()
}

@TauriPlugin(
    permissions = [Permission(strings = [Manifest.permission.RECORD_AUDIO], alias = "microphone")]
)
class AndroidPasskeyPlugin(private val activity: Activity) : Plugin(activity) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var active = false

    @Command
    fun login(invoke: Invoke) {
        val args = try {
            invoke.parseArgs(LoginArgs::class.java)
        } catch (error: Exception) {
            invoke.reject(error.message ?: "The passkey request is invalid.")
            return
        }
        if (args.domain != RELYING_PARTY_ID) {
            invoke.reject("Native passkeys are restricted to $RELYING_PARTY_ID.")
            return
        }
        if (args.challenge.isEmpty()) {
            invoke.reject("The passkey challenge is empty.")
            return
        }
        if (active) {
            invoke.reject("A native passkey request is already active.")
            return
        }

        active = true
        scope.launch {
            try {
                val option = GetPublicKeyCredentialOption(
                    requestJson = requestJson(args.domain, args.challenge)
                )
                val request = GetCredentialRequest.Builder()
                    .addCredentialOption(option)
                    .build()
                val credential = CredentialManager.create(activity)
                    .getCredential(activity, request)
                    .credential
                if (credential !is PublicKeyCredential) {
                    invoke.reject("Android did not return a passkey assertion.")
                    return@launch
                }
                invoke.resolve(assertion(credential.authenticationResponseJson))
            } catch (error: Exception) {
                val detail = error.message ?: error.javaClass.simpleName
                when (error) {
                    is NoCredentialException,
                    is GetCredentialProviderConfigurationException,
                    is GetCredentialUnsupportedException ->
                        invoke.reject("NATIVE_PASSKEY_UNAVAILABLE: $detail")
                    else -> invoke.reject("${error.javaClass.simpleName}: $detail")
                }
            } finally {
                active = false
            }
        }
    }

    override fun onDestroy(activity: AppCompatActivity) {
        scope.cancel()
        super.onDestroy(activity)
    }

    private fun requestJson(domain: String, challenge: ByteArray): String = JSONObject()
        .put("challenge", Base64.encodeToString(challenge, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING))
        .put("rpId", domain)
        .put("allowCredentials", JSONArray())
        .put("userVerification", "required")
        .put("timeout", 300_000)
        .toString()

    private fun assertion(authenticationResponseJson: String): JSObject {
        val credential = JSONObject(authenticationResponseJson)
        val response = credential.getJSONObject("response")
        return JSObject().apply {
            put("id", credential.getString("id"))
            put("raw_id", credential.getString("rawId"))
            put("client_data_json", response.getString("clientDataJSON"))
            put("authenticator_data", response.getString("authenticatorData"))
            put("signature", response.getString("signature"))
            put("user_handle", response.optString("userHandle", ""))
        }
    }

    private companion object {
        const val RELYING_PARTY_ID = "aven.id"
    }
}
