# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.28-next.8...v) (2026-08-28)


### Features

* **app:** hide the avenCEO subscription during alpha ([dc41730](https://github.com/MyAvenCEO/avenOS/commit/dc41730f7a28921118d9840a849d63efa2151e0f))
* **aven-api:** tell buyers what happens after the name purchase ([a4cf951](https://github.com/MyAvenCEO/avenOS/commit/a4cf9519201de718a887435ecfa86c81bec3d174))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.28-next.7...v) (2026-08-28)


### Bug Fixes

* **release:** wait for Caddy ports before restart ([12902ee](https://github.com/MyAvenCEO/avenOS/commit/12902ee9852d8ba18f6cb9591fdfe948014e0943))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.28-next.6...v) (2026-08-28)


### Bug Fixes

* **release:** recreate Caddy before verification ([c10b09e](https://github.com/MyAvenCEO/avenOS/commit/c10b09e20161266430220c72b748e1ab264d5fa1))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.28-next.5...v) (2026-08-28)


### Features

* **billing:** weekly interval and MIND credits from the 0.9.0 SSOT ([a71de6f](https://github.com/MyAvenCEO/avenOS/commit/a71de6ff36e7c6455fe973cec5ea2b1668d85e48))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.28-next.4...v) (2026-08-28)


### Bug Fixes

* **android:** exclude desktop ONNX runtime assets ([31ca816](https://github.com/MyAvenCEO/avenOS/commit/31ca8160a0ddd8176578077888fd9ed44a17cdcd))


### Features

* **voice:** add anonymous speaker diarization ([7fa44f6](https://github.com/MyAvenCEO/avenOS/commit/7fa44f6dea350f8cbce4c1d18d196f8664b3c35d))
* **voice:** add autonomous duplex refinement lab ([1a372a6](https://github.com/MyAvenCEO/avenOS/commit/1a372a6d043f03b63c49c8c190f17bd5b8d22424))
* **voice:** add guarded tester barge-in fallback ([936989b](https://github.com/MyAvenCEO/avenOS/commit/936989bd25c8400c1d42df9447f91058a8ca8a2f))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.28-next.3...v) (2026-08-28)


### Features

* **billing:** source avenNAME product id from AVEN_TIER_NAME secret ([980e453](https://github.com/MyAvenCEO/avenOS/commit/980e453d847460ca9fbcdbf7c956f2c56ccfeb7f))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.28-next.2...v) (2026-08-28)


### Bug Fixes

* **ios:** link native audio frameworks ([97b573a](https://github.com/MyAvenCEO/avenOS/commit/97b573aa34f8e48874f731c701ada9d1730f91b9))
* **release:** keep Rust lockfiles versioned ([3b40d32](https://github.com/MyAvenCEO/avenOS/commit/3b40d32088c9e0ffccc0a7b9d130a4d863e9d4fa))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.28-next.1...v) (2026-08-28)


### Bug Fixes

* clear stale output levels after cancellation ([7ae5086](https://github.com/MyAvenCEO/avenOS/commit/7ae5086d3e8ee6fc4c3d925f665c09471a8078eb))
* **voice:** prevent guarded-mode feedback promotion ([1309454](https://github.com/MyAvenCEO/avenOS/commit/130945466b7b6055b339da78fefd6a409dbd2116))
* **voice:** stabilize and calibrate duplex routes ([234f55e](https://github.com/MyAvenCEO/avenOS/commit/234f55e78766c22896b2c111a90de28c6e798293))


### Features

* **android:** build APK with native passkeys ([4764fc8](https://github.com/MyAvenCEO/avenOS/commit/4764fc8672230dad5bdab94e3073c4406cc13673))
* **voice:** add full-duplex qualification opt-in ([dedd515](https://github.com/MyAvenCEO/avenOS/commit/dedd515401d233cd3c33d0eb02ba30a70660c2dc))
* **voice:** enable full duplex for testers ([9ecc263](https://github.com/MyAvenCEO/avenOS/commit/9ecc263697bf663d1a9157466a3fffb3f574cf44))
* **voice:** implement software-first duplex pipeline ([c75b37e](https://github.com/MyAvenCEO/avenOS/commit/c75b37e528a1771c1aaf1f818933603559b03d59))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.27-next.6...v) (2026-08-28)


### Features

* **aven-api:** accept client actor publications ([5a3ad0e](https://github.com/MyAvenCEO/avenOS/commit/5a3ad0e9338aab6ced3179edc53387541b6efa61))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.27-next.5...v) (2026-08-27)


### Bug Fixes

* **release:** preserve LLM credential JSON ([9e4647b](https://github.com/MyAvenCEO/avenOS/commit/9e4647b6fc30ad2fb3a08646f7f615e26e6893c0))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.27-next.4...v) (2026-08-27)


### Bug Fixes

* **auth:** race IPv4 and IPv6, so sign-in works on whichever one answers ([c5342ce](https://github.com/MyAvenCEO/avenOS/commit/c5342ce17f7550e9f2054c7eb3a37f45690e28db))
* **ui:** restore floating dock hit targets ([16d703e](https://github.com/MyAvenCEO/avenOS/commit/16d703e42a125edf7c7b6efc416f8d4126f71e1a))


### Features

* add authenticated LLM gateway ([b4af651](https://github.com/MyAvenCEO/avenOS/commit/b4af651283f92dd28aa98f5bbc281a6575f25f68))


### Performance Improvements

* **asr:** let idle ONNX workers sleep ([77ec98e](https://github.com/MyAvenCEO/avenOS/commit/77ec98ef8fecd288f3818c6599473cf5d6a0cae6))
* **tts:** bound and park ONNX worker pools ([c3b789c](https://github.com/MyAvenCEO/avenOS/commit/c3b789c4faf5b42974451c6b8f6c44086c0d63ef))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.27-next.3...v) (2026-08-27)


### Bug Fixes

* **auth:** race IPv4 and IPv6, so sign-in works on whichever one answers ([16d0050](https://github.com/MyAvenCEO/avenOS/commit/16d005037bb2705492aaad54feccfd3e3652a111))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.27-next.2...v) (2026-08-27)


### Features

* **pricing:** avenNAME + one avenCEO, on kebab-case wire keys ([08adc25](https://github.com/MyAvenCEO/avenOS/commit/08adc253f0f8166f20eeee9fad15ae5bdc60071f))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.27-next.1...v) (2026-08-27)


### Features

* **pricing:** avenNAME + one avenCEO, on kebab-case wire keys ([1693432](https://github.com/MyAvenCEO/avenOS/commit/1693432901433c39f940d311c1581222e2478140))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.26-next.3...v) (2026-08-27)


### Bug Fixes

* **intents:** keep chat messages out of the activity log ([27fcaad](https://github.com/MyAvenCEO/avenOS/commit/27fcaad08d933a4a7056079d9a45cd7ffbe933b2))


### Features

* **chat:** add debug view of the model's exact request context and tools ([dd6e194](https://github.com/MyAvenCEO/avenOS/commit/dd6e194e5a7e13124a15dd72f7a2dd5ce2c12fd1)), closes [Chat.#round](https://github.com/Chat./issues/round)
* **intents:** give the model bounded artifact awareness ([0bb7842](https://github.com/MyAvenCEO/avenOS/commit/0bb78425c40ab287aed6b40221d06973397a1702))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.26-next.2...v) (2026-08-26)


### Bug Fixes

* **release:** a release cannot commit a registry token ([e582962](https://github.com/MyAvenCEO/avenOS/commit/e5829624562a2d91eb524f5a62dd30f3d696a3a7))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.26-next.1...v) (2026-08-26)


### Bug Fixes

* **app:** recover the styles a class scanner could not see ([164ce0c](https://github.com/MyAvenCEO/avenOS/commit/164ce0c76a6382e7456328b46d43b444b09a70ca))
* **ci:** put the registry token back where bun reads it ([83e33d6](https://github.com/MyAvenCEO/avenOS/commit/83e33d6dae2df2b96ceea0c3a9a9efb22619a492))


### Features

* **app:** drop Tailwind for the brand's own utility layer ([9eb1460](https://github.com/MyAvenCEO/avenOS/commit/9eb1460b458824259fe42179e8cde04f959f5fb7))
* **aven-ui:** render a view to HTML text, not only to DOM ([1ee973b](https://github.com/MyAvenCEO/avenOS/commit/1ee973b87c12e5906bb939dbb022e14bc0ad6240))
* **design:** adopt stack + stack-center on the purchase screens ([4a3e91b](https://github.com/MyAvenCEO/avenOS/commit/4a3e91b16f84ba00d1dcffebb3af525895c9ee70))
* **design:** adopt the id service's card, and drop dead imports ([443057d](https://github.com/MyAvenCEO/avenOS/commit/443057d2489c6afb2264bf6096bf3520eef846a5))
* **design:** adopt the structural components across the app ([b5c08ac](https://github.com/MyAvenCEO/avenOS/commit/b5c08ac2ecaf64e220557f72e05478e634336935))
* **design:** put every surface on the shared scales, and the id service on the brand ([055508e](https://github.com/MyAvenCEO/avenOS/commit/055508e2d77ce0816b628453fe4457e0cebb9dfc)), closes [#2f5d50](https://github.com/MyAvenCEO/avenOS/issues/2f5d50)
* **design:** regenerate onto nested CSS with states and container queries ([7e68daa](https://github.com/MyAvenCEO/avenOS/commit/7e68daa68ef3f542a3cdf1c4820c6d03c36fbf0f))
* **design:** restyle the purchase flow onto the passkey card ([c983abb](https://github.com/MyAvenCEO/avenOS/commit/c983abb645e3eb9d27897c49d0c781ccf4235bab))
* **hosting:** allow admin apex bindings ([c06195e](https://github.com/MyAvenCEO/avenOS/commit/c06195e5664bb07121b7cd3d5439d298b1b8957a))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.25-next.6...v) (2026-08-26)


### Features

* **auth:** add guarded account administration ([54064e7](https://github.com/MyAvenCEO/avenOS/commit/54064e76e415d9d6b879e54974f386ffc30fc7e4))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.25-next.5...v) (2026-08-25)
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.25-next.4...v) (2026-08-25)


### Bug Fixes

* **aven-api:** stop copying a workspace dir that no longer exists ([e4a1ade](https://github.com/MyAvenCEO/avenOS/commit/e4a1ade524b8748603864625b869276e91f2915a))
* **brand:** resolve the logo through the module graph, not a node_modules path ([ddd2ee7](https://github.com/MyAvenCEO/avenOS/commit/ddd2ee70827c3271ad56ac62acf9a79507161268))
* **shell:** give the left rail one source of truth, and CI a registry token ([8452f43](https://github.com/MyAvenCEO/avenOS/commit/8452f430d4bf9b856f8d94bde2073e4dd7908315))


### Features

* **artifacts:** one store, one ingest door, and a file-first browser ([d7e73f6](https://github.com/MyAvenCEO/avenOS/commit/d7e73f6779b9e72f22e3a8f5dc05691f62023be1))
* **brand:** consume @myavenceo/aven-ceo as the single source of truth ([2e7069d](https://github.com/MyAvenCEO/avenOS/commit/2e7069d8c49732eed53bc7e62521e3fb11259b9b)), closes [#e6b34d](https://github.com/MyAvenCEO/avenOS/issues/e6b34d) [#2e7d52](https://github.com/MyAvenCEO/avenOS/issues/2e7d52) [#17251d](https://github.com/MyAvenCEO/avenOS/issues/17251d)
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.25-next.3...v) (2026-08-25)


### Features

* **app:** add grounded artifact viewers ([5cf5759](https://github.com/MyAvenCEO/avenOS/commit/5cf575997198d02320fb7a25ed6669af66777fd4))
* **app:** browse artifact lineage as a tree grid ([781cf89](https://github.com/MyAvenCEO/avenOS/commit/781cf8960ef4abafa179613a10b0a13f31da827f))
* **artifact-store:** expose lineage evidence reads ([1f2339c](https://github.com/MyAvenCEO/avenOS/commit/1f2339c6dfe23090c6262f345eb7ae4fabb8cd2e))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.25-next.2...v) (2026-08-25)


### Features

* **app:** add Artifact Store debugger ([de7d9b6](https://github.com/MyAvenCEO/avenOS/commit/de7d9b635bc9fdc9da7ea9031380db6421741977))
* **app:** visualize file processing runs ([fb8434d](https://github.com/MyAvenCEO/avenOS/commit/fb8434d48dcf71060a3571f6d63f04ef227a5d0f))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.25-next.1...v) (2026-08-25)


### Bug Fixes

* **deploy:** reload Caddy configuration ([b943ea9](https://github.com/MyAvenCEO/avenOS/commit/b943ea9fab4271a51f8ebb05515877b0050a5002))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.24-next.8...v) (2026-08-25)


### Bug Fixes

* **hosting:** harden hosting boundaries ([2ca02b6](https://github.com/MyAvenCEO/avenOS/commit/2ca02b67ea0f64dd6c2a101f2128354be242d746))


### Features

* **hosting:** refine the static site manager ([ad1c4af](https://github.com/MyAvenCEO/avenOS/commit/ad1c4af1f53794de0e92b3be3efd9c303bb33b73))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.24-next.7...v) (2026-08-24)


### Bug Fixes

* **hosting:** avoid replacing the protected host ([c135c45](https://github.com/MyAvenCEO/avenOS/commit/c135c45915d48d1f296486ac574b2fef2b820dec))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.24-next.6...v) (2026-08-24)


### Bug Fixes

* **billing:** purge legacy provider ids (0017) + UUID self-heal; drop pause (Polar CannotPauseSubscription) ([f6ea63c](https://github.com/MyAvenCEO/avenOS/commit/f6ea63c33d0a82fb717b9c76a3ea7ced440b2eae))
* **hosting:** scope site credentials to deployment ([b94d474](https://github.com/MyAvenCEO/avenOS/commit/b94d474ddf7bbce4a44669dec0ebad5d0826305e))


### Features

* **app:** Abrechnung cards list the FULL SSOT benefits incl. Aven Worker Minutes ([12a7ff4](https://github.com/MyAvenCEO/avenOS/commit/12a7ff489e262696585c1ecbade16e521c5e29d9))
* **app:** artifacts split view — pdf.js inline rendering, square tiles, terracotta Kündigen ([0cc8b02](https://github.com/MyAvenCEO/avenOS/commit/0cc8b0255dee56b77f8b1acd1d5255e1abc6e842))
* **app:** inline invoice flow + Artefakte page; per-card billing feedback; drop pause UI (0162 smoke fixes) ([4a0a78d](https://github.com/MyAvenCEO/avenOS/commit/4a0a78dd159e627039acd811e35a6bdaf6966be2))
* **billing:** benefit titles default to English; verified attach on both tiers ([55d0e2e](https://github.com/MyAvenCEO/avenOS/commit/55d0e2e743c7bfe9961c1a007161edf90b74ace1))
* **billing:** bilingual benefits SSOT in aven-brand → Polar benefits + descriptions; inline light checkout with locale (0162 r3) ([18d0165](https://github.com/MyAvenCEO/avenOS/commit/18d016589bbcfb11ac48e67bea91978812aea400))
* **billing:** pause is back, in sync — pause_at_period_end mirrored (0018), Pausieren/Fortsetzen UI, collapsed larger benefit list ([657ad02](https://github.com/MyAvenCEO/avenOS/commit/657ad02485e1ac4ac77a479c0ab6011985fb6357))
* **billing:** runtime benefit renamed to 'Aven Worker Minutes' + benefit title drift-correction ([e30a552](https://github.com/MyAvenCEO/avenOS/commit/e30a552e7209ae1347b1763654d4168bf78ee084))
* **billing:** skill benefits prefixed 'SKILL - <english title>' ([3c406a9](https://github.com/MyAvenCEO/avenOS/commit/3c406a911ac647d17dac0d4e20a44eb8afb7f2cd))
* **hosting:** manage multiple sites per Aven name ([074bc6c](https://github.com/MyAvenCEO/avenOS/commit/074bc6c24dda5c9705995598648631b7e8c60421))
* **hosting:** serve verified static site deployments ([4fa100b](https://github.com/MyAvenCEO/avenOS/commit/4fa100bc61f2fd76c25aa941fbf17c3d6548ea7d))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.24-next.5...v) (2026-08-24)


### Features

* **app:** Abrechnung cards list the FULL SSOT benefits incl. Aven Worker Minutes ([ec9962c](https://github.com/MyAvenCEO/avenOS/commit/ec9962cf8b06d762af92c867ad325495e8156e76))
* **app:** artifacts split view — pdf.js inline rendering, square tiles, terracotta Kündigen ([a9ae063](https://github.com/MyAvenCEO/avenOS/commit/a9ae0636e7ba7258b08f25a71799afa7a1ff33b1))
* **billing:** benefit titles default to English; verified attach on both tiers ([efe8e32](https://github.com/MyAvenCEO/avenOS/commit/efe8e32c5afe8784b50544155c927e0bec47268c))
* **billing:** bilingual benefits SSOT in aven-brand → Polar benefits + descriptions; inline light checkout with locale (0162 r3) ([d97d6f1](https://github.com/MyAvenCEO/avenOS/commit/d97d6f194578b82f40ab2231d6561239e803e0a8))
* **billing:** pause is back, in sync — pause_at_period_end mirrored (0018), Pausieren/Fortsetzen UI, collapsed larger benefit list ([2706bd5](https://github.com/MyAvenCEO/avenOS/commit/2706bd5dfab6efe4647116423e5b10c8b2002521))
* **billing:** runtime benefit renamed to 'Aven Worker Minutes' + benefit title drift-correction ([fed5453](https://github.com/MyAvenCEO/avenOS/commit/fed5453b6a0a5c43d6342d847c6ced7ee738f8a7))
* **billing:** skill benefits prefixed 'SKILL - <english title>' ([3a020b4](https://github.com/MyAvenCEO/avenOS/commit/3a020b4d84b11abc1d0d0e05e420a5e41f3a7934))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.24-next.4...v) (2026-08-24)


### Bug Fixes

* **billing:** purge legacy provider ids (0017) + UUID self-heal; drop pause (Polar CannotPauseSubscription) ([189ba3d](https://github.com/MyAvenCEO/avenOS/commit/189ba3df24f8efc1ac48261f94e85fd909cb351b))


### Features

* **app:** inline invoice flow + Artefakte page; per-card billing feedback; drop pause UI (0162 smoke fixes) ([ef0533f](https://github.com/MyAvenCEO/avenOS/commit/ef0533f018e0ba68b6e8b86693270701c6d32b9c))
* **billing:** Creem → Polar sandbox billing on the brand SSOT (0162) ([e30d31c](https://github.com/MyAvenCEO/avenOS/commit/e30d31c68e336a770f0d574705c87e7a0d2c4065))
* **id-service:** link all legal pages in the footer ([120ec1e](https://github.com/MyAvenCEO/avenOS/commit/120ec1e396290e69e584fc918ed6215ed465039f))
* **website:** centered mobile header, trim footer ([0241208](https://github.com/MyAvenCEO/avenOS/commit/0241208f139a2404fd0f0d112a2b79d2387a23a2))
* **website:** social profile links in header + footer, updated privacy URLs ([6339d1f](https://github.com/MyAvenCEO/avenOS/commit/6339d1fcc4219f7252664a30ed27e69d85536778))
* **website:** stacked header up to tablet, sovereign-founder slogan ([264a0dd](https://github.com/MyAvenCEO/avenOS/commit/264a0dd5e1c8126a6b4c3fdf762e65ad6eba1a56))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.24-next.3...v) (2026-08-24)


### Features

* **billing:** Creem → Polar sandbox billing on the brand SSOT (0162) ([635e621](https://github.com/MyAvenCEO/avenOS/commit/635e621f606e65a12294a6231225344539434a87))
* **id-service:** link all legal pages in the footer ([823e168](https://github.com/MyAvenCEO/avenOS/commit/823e1680c2aa86a8137f888f6d788d090d83cb26))
* **website:** centered mobile header, trim footer ([7026c8b](https://github.com/MyAvenCEO/avenOS/commit/7026c8bd8f87ce543bf8667479513416f65f1398))
* **website:** social profile links in header + footer, updated privacy URLs ([ca98f75](https://github.com/MyAvenCEO/avenOS/commit/ca98f750f9534294d200019d39efe1a86f7adffd))
* **website:** stacked header up to tablet, sovereign-founder slogan ([111bd8d](https://github.com/MyAvenCEO/avenOS/commit/111bd8dccc98f57b429ae5cf012265a3c63c0a51))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.24-next.2...v) (2026-08-24)


### Bug Fixes

* **ci:** unblock next promotion and intent deployment ([57dde40](https://github.com/MyAvenCEO/avenOS/commit/57dde4006a719c9df3762ad59f091bda8eb59bbc))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.24-next.1...v) (2026-08-24)


### Bug Fixes

* **ci:** carry @avenos/aven-brand into the aven-api image ([935466b](https://github.com/MyAvenCEO/avenOS/commit/935466bfa706937ee7366d159c366afe20cf49ff))


### Features

* **app+website:** legal links in settings nav, withdrawal buttons unified ([3bccc94](https://github.com/MyAvenCEO/avenOS/commit/3bccc94e6f5cbd7b15542e9a7a6a0cdfbb38abb2))
* **app:** persist intent lifecycle ([ac12de4](https://github.com/MyAvenCEO/avenOS/commit/ac12de4869574b570931f219c7292e50ba4df570))
* **app:** restore persistent file intents ([a284e33](https://github.com/MyAvenCEO/avenOS/commit/a284e33a1ba522c5980175e915bd2f66a46094f5))
* **app:** show live artifact processing status ([966d353](https://github.com/MyAvenCEO/avenOS/commit/966d353079d348ab88eeaa80123cfe6b119f3c92))
* **intents:** add standalone intent service ([2d83107](https://github.com/MyAvenCEO/avenOS/commit/2d831077f97fe19772aebc69a9ef2d619f50c8ac))
* **intents:** persist file-triggered intent projections ([b975a62](https://github.com/MyAvenCEO/avenOS/commit/b975a6209de4774a952dcf2612784671c65ba7d1))
* **legal:** @avenos/aven-brand SSOT wired across every surface ([91b7cab](https://github.com/MyAvenCEO/avenOS/commit/91b7cabaa4ca4b3abdc90783cca0e6e642388123))
* **legal:** statutory Widerrufsbelehrung on the withdrawal page, DE + EN ([de5f31b](https://github.com/MyAvenCEO/avenOS/commit/de5f31b4c110feca36453a177c9ea135d2c7b408))
* **website:** Aven card meta row — Dahinter + weblink below the vision ([115b2d0](https://github.com/MyAvenCEO/avenOS/commit/115b2d05bad5a5a414749eba252672cb63c52f8c))
* **website:** Aven card vision section splits 2/3 vision, 1/3 Dahinter+link ([98b6fbd](https://github.com/MyAvenCEO/avenOS/commit/98b6fbd7b3483d3c37faf65feebffba0dbeeb092))
* **website:** Aven cards drop the Leistungen list, Mission becomes Vision ([7063fba](https://github.com/MyAvenCEO/avenOS/commit/7063fba3c1020c6bd8f0300c081a65221ec5a30f))
* **website:** avenID sells the marketplace profile; Avens get link + bio ([3b9a0f6](https://github.com/MyAvenCEO/avenOS/commit/3b9a0f6174085f74825b428dc7120555913283b1))
* **website:** english-first routing — EN at root, German under /de ([b783a83](https://github.com/MyAvenCEO/avenOS/commit/b783a8335867be71107b23a7ce85d3cbf4c31441))
* **website:** price panel moves up — below runtime, above sovereignty ([e294168](https://github.com/MyAvenCEO/avenOS/commit/e2941689981ed4bac6de9c98113128001aff2f28))
* **website:** revenue shares 8,2 % / 30 % (MoR), runtime joins the feature section ([3686b1b](https://github.com/MyAvenCEO/avenOS/commit/3686b1b8d1d04febb6834a118a34b1e0b0f8b728))
* **website:** rework pricing tiers and landing story ([87892cd](https://github.com/MyAvenCEO/avenOS/commit/87892cd9f7f79896734529ceebd5ff0412d45a73))


### Reverts

* **legal:** drop the eRecht24 API sync — texts are maintained manually ([8025819](https://github.com/MyAvenCEO/avenOS/commit/8025819df7703f6011ecc4bf8f132e8451b74e83))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.23-next.5...v) (2026-08-24)


### Bug Fixes

* **ci:** carry @avenos/aven-brand into the aven-api image ([cbac41d](https://github.com/MyAvenCEO/avenOS/commit/cbac41da639a242ecda08b878ee9d697d66e5527))


### Features

* **app+website:** legal links in settings nav, withdrawal buttons unified ([9f98b62](https://github.com/MyAvenCEO/avenOS/commit/9f98b6262783c9c951dc6a95bb5925c6e5b8f6be))
* **legal:** @avenos/aven-brand SSOT wired across every surface ([df14a7d](https://github.com/MyAvenCEO/avenOS/commit/df14a7df3f5bef7d3e6d95b4f7cec1f0ec224651))
* **legal:** statutory Widerrufsbelehrung on the withdrawal page, DE + EN ([0892745](https://github.com/MyAvenCEO/avenOS/commit/08927458b65987ead207af1a933b88494b61dfb3))
* **website:** Aven card meta row — Dahinter + weblink below the vision ([5b0ed98](https://github.com/MyAvenCEO/avenOS/commit/5b0ed98cb577c317813130adadd18833b681b470))
* **website:** Aven card vision section splits 2/3 vision, 1/3 Dahinter+link ([25b9e06](https://github.com/MyAvenCEO/avenOS/commit/25b9e06829c47fbddfa833558eb689fa1d3cdb66))
* **website:** Aven cards drop the Leistungen list, Mission becomes Vision ([ee73ff9](https://github.com/MyAvenCEO/avenOS/commit/ee73ff91908f70e8d9c32934889a629572357411))
* **website:** avenID sells the marketplace profile; Avens get link + bio ([7558b83](https://github.com/MyAvenCEO/avenOS/commit/7558b8315c7311d37a29700d5a99b9175adb06c5))
* **website:** english-first routing — EN at root, German under /de ([9bb55b9](https://github.com/MyAvenCEO/avenOS/commit/9bb55b982360d9875e363777fc3c1840390fb5b4))
* **website:** price panel moves up — below runtime, above sovereignty ([df64cce](https://github.com/MyAvenCEO/avenOS/commit/df64cce2c419da2a82d7ac42569feeb7d612e9f7))
* **website:** revenue shares 8,2 % / 30 % (MoR), runtime joins the feature section ([d754b96](https://github.com/MyAvenCEO/avenOS/commit/d754b9688b4d4775260bb0256c0571caf6b97f4e))
* **website:** rework pricing tiers and landing story ([ffc2366](https://github.com/MyAvenCEO/avenOS/commit/ffc2366cb3d9c18503a45fc5b19cf9f001c2a0e6))


### Reverts

* **legal:** drop the eRecht24 API sync — texts are maintained manually ([6967a09](https://github.com/MyAvenCEO/avenOS/commit/6967a09b50465c08be6e0f84e0717b951bf76dc1))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.23-next.4...v) (2026-08-23)


### Bug Fixes

* **ci:** format artifact fixture harness ([6c79e9d](https://github.com/MyAvenCEO/avenOS/commit/6c79e9d60712f25306d9de39545ceaf0b221e6ed))


### Features

* **artifact-processing:** add durable processor pipeline ([2426fba](https://github.com/MyAvenCEO/avenOS/commit/2426fba76bd4539f161ed7a427703f651e44d0f8))
* **aven-api:** provision artifact processing per tenant ([c439250](https://github.com/MyAvenCEO/avenOS/commit/c43925042f24328d7ef12c2f1fc5364509fbb5d5))
* **deploy:** roll out artifact processor safely ([69466b7](https://github.com/MyAvenCEO/avenOS/commit/69466b736789c9443c306adfb576583b74d3dc7e))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.23-next.3...v) (2026-08-23)


### Bug Fixes

* **deploy:** allow artifact upload request bodies ([44ed110](https://github.com/MyAvenCEO/avenOS/commit/44ed1102b142de308784447242c7ff958f0717d5))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.23-next.2...v) (2026-08-23)


### Bug Fixes

* **app:** a request settles only after a tool-free round or a tool round — never on a first word before a tool call; the reply streams in the composer card meanwhile; composer field and send button centered ([58af7e8](https://github.com/MyAvenCEO/avenOS/commit/58af7e81d67f2669fa1d8cd06319bb83c9db28d1))
* **app:** a request settles only when the answer round is complete — never between tool rounds ([0783b5e](https://github.com/MyAvenCEO/avenOS/commit/0783b5e3afbc95469a864f17ddf15451b5f77e6f))
* **app:** a restored intent returns in the state it was archived from ([14c24f2](https://github.com/MyAvenCEO/avenOS/commit/14c24f2bb52fd05b0abd9cae34e5d6dd5c5f020c))
* **app:** hide the Start-conversation chip while a human gate is open ([21379f1](https://github.com/MyAvenCEO/avenOS/commit/21379f11b496b197dfc0865f61a46765ee38adb7))
* **app:** intent clicks no longer reopen the conversation modal ([f160027](https://github.com/MyAvenCEO/avenOS/commit/f160027236797753f92acb41f88d2fb2f450bbec))
* **app:** mobile back/menu hug the screen edges, hidden in text mode; voice mock never starts the mic ([49886bb](https://github.com/MyAvenCEO/avenOS/commit/49886bbf49fda3c3c260db09dbf0e7b597bbd988))
* **app:** notch never jumps between voice and text — orb overhangs without margin; hang-up is a quiet outlined ✕ ([7411626](https://github.com/MyAvenCEO/avenOS/commit/74116262e4932308205ed0f76fb10b713c25e9ba))
* **app:** one notch size in voice and text mode — py-2 pill, 40px buttons, 72px orb, equal bottom gap ([7516374](https://github.com/MyAvenCEO/avenOS/commit/7516374531d726b3c57ea76167e3a937190e1591))
* **app:** selected intent card keeps its size, corners and place in the list — only the fill marks it ([0d1b897](https://github.com/MyAvenCEO/avenOS/commit/0d1b897a05eb5d4c3f5beaca9c8b375da0548888))
* **app:** session arrays are born as $state proxies — turns settling into a just-routed session were invisible ([eab4bf7](https://github.com/MyAvenCEO/avenOS/commit/eab4bf74715d42e6c4e329c49051705771d54225))
* **app:** symmetric gaps between the intent list, the center card and the skills column ([0324845](https://github.com/MyAvenCEO/avenOS/commit/0324845b3859a893cd6560ec1359e15fb4c827a4))
* **app:** the center card is a complete rounded card; gate and composer sit below it as their own cards ([6e09104](https://github.com/MyAvenCEO/avenOS/commit/6e0910465c1dd5a255c562fe70f08fb7f1850924))
* **artifact-store:** harden tenant convergence ([9c0c283](https://github.com/MyAvenCEO/avenOS/commit/9c0c283a2635e1a2868e24f04a93b356e9945e18))
* **deploy:** wait only for healthchecked services ([92e7f52](https://github.com/MyAvenCEO/avenOS/commit/92e7f524ae7cc397a9e98fe17499defc7d0c591b))
* **release:** make main sync race-safe ([a72ac0a](https://github.com/MyAvenCEO/avenOS/commit/a72ac0aec9cbfc6b1b7f34f262447d96ccbb8d3d))
* **website:** bundle note grammar for the person case ([66aa502](https://github.com/MyAvenCEO/avenOS/commit/66aa5027abbd382e8812a0fa085ac1e6e45213a7))
* **website:** space before the dash in skill page titles ([58a3116](https://github.com/MyAvenCEO/avenOS/commit/58a31167c584cdacda73c1402c4311fea4092458))


### Features

* **app:** a request stays in a routing state until the model has understood it; cross-intent questions route themselves ([9fe01de](https://github.com/MyAvenCEO/avenOS/commit/9fe01de6af18ab111021e37dc4615da18f3a45f8))
* **app:** an exchange that creates or opens an intent moves into that intent's stream ([355f460](https://github.com/MyAvenCEO/avenOS/commit/355f460364afe0981c9465bb75b5f2a4badd75db))
* **app:** dev-only ?voice=<phase> mock so the voice pill renders in a browser tab ([cb820f6](https://github.com/MyAvenCEO/avenOS/commit/cb820f6badd08a0d0f75bbeae869452eeeb034e8))
* **app:** intent_archive / intent_restore tools — put an intent away or bring it back by message ([0547aa9](https://github.com/MyAvenCEO/avenOS/commit/0547aa96e56ca126667c278debc99280a11c08b1))
* **app:** intent_list names the intent on screen and nudges to switch before answering about another ([41fd832](https://github.com/MyAvenCEO/avenOS/commit/41fd832f65acfdd9518eb00446729d01d3a15097))
* **app:** intent_update tool — title, type, source, deadline, status by message ([77d712a](https://github.com/MyAvenCEO/avenOS/commit/77d712a7274a0307a43cf3bac88f7e505a7f3de3))
* **app:** intents are an actor with CRUD tools — list, switch, create, merge, delete ([b70ae71](https://github.com/MyAvenCEO/avenOS/commit/b70ae719a4c96ad46b4b9596a58657a11b187b13))
* **app:** larger side buttons and orb in the notch, tighter bottom gap ([ffcc70f](https://github.com/MyAvenCEO/avenOS/commit/ffcc70fa6170fc44682fdba772994a803d11db41))
* **app:** list-first mobile layout for the intents workspace ([3dfa376](https://github.com/MyAvenCEO/avenOS/commit/3dfa376a8b404002e8465d55b4bac540ddabdcd6))
* **app:** merging intents merges their conversations too ([c1602b1](https://github.com/MyAvenCEO/avenOS/commit/c1602b17c03f1e0b1090bca28c932a37ec9ab130))
* **app:** narrower voice notch, loading tooltip chip, dev tap-to-cycle phases ([9abac45](https://github.com/MyAvenCEO/avenOS/commit/9abac45e5196029a5fec0d24597ab3aa40b54d20))
* **app:** notch chip for every informative phase; notch narrower and ~12% larger ([59efb99](https://github.com/MyAvenCEO/avenOS/commit/59efb991d10d206d244a40d527c46de65e267292))
* **app:** one conversation — write, speak, or both; views render inline again ([0c9c0b3](https://github.com/MyAvenCEO/avenOS/commit/0c9c0b3ebceb184810452e120cb1e86d905dd9d6))
* **app:** one top edge for all three columns; side headers wear the tab pill; the stream is a tool ([3e0964a](https://github.com/MyAvenCEO/avenOS/commit/3e0964ac320e442fdd23c9c2a9317b4fee13312d))
* **app:** routing state lives in the composer card; compact card with a round send button; archiving routes the exchange into the archived intent ([251c3e4](https://github.com/MyAvenCEO/avenOS/commit/251c3e4c94d683cc0979f0284084d976676c3cbb))
* **app:** tablets get the collapsed mobile layout too — breakpoint md → lg ([108aa7d](https://github.com/MyAvenCEO/avenOS/commit/108aa7d100d86454fb0e4a926043f930db5ae4ad))
* **app:** the chat lives inline in the intent's stream, scoped per intent; modal gone ([e7eca31](https://github.com/MyAvenCEO/avenOS/commit/e7eca3121314ee8b9a0a5704b6326f6dd8d94a49))
* **app:** the composer is a gate-styled card, shown only while writing or hearing; the gate yields meanwhile ([fe3f2cc](https://github.com/MyAvenCEO/avenOS/commit/fe3f2cc69fa277a4b22a87ed8d663386c1e6f10e))
* **app:** the composer is the conversation's footer, not the notch; spotlight search parked ([0a4efc5](https://github.com/MyAvenCEO/avenOS/commit/0a4efc56b90eb5fac8eddd05d061335b87614e19))
* **app:** the model sees the live intents and the one on screen with every request ([12b1440](https://github.com/MyAvenCEO/avenOS/commit/12b144008711bcd9de517c14abfe7b110f28c88d))
* **app:** the selected intent card is filled with its state color ([b6ae160](https://github.com/MyAvenCEO/avenOS/commit/b6ae160778925ce84be43079148add0a609f3cb9))
* **app:** the selected intent leads the list and joins the center panel as one surface ([91c1055](https://github.com/MyAvenCEO/avenOS/commit/91c1055156d952abb6ecdc1225d92f201df84b75))
* **app:** the system prompt teaches intent routing — switch first when a request is about another intent; create, archive, merge, update, delete by message ([83fa3d3](https://github.com/MyAvenCEO/avenOS/commit/83fa3d3b9d9388350055ce73e99ce27f33606b34))
* **app:** upload dropped files as artifacts ([8efec72](https://github.com/MyAvenCEO/avenOS/commit/8efec722e705046c93dcd8a628f8b5529a5bd108))
* **app:** upload placeholder on the notch's left, where the input switch was (not wired yet) ([b4e81c1](https://github.com/MyAvenCEO/avenOS/commit/b4e81c196671de3d633359eea1ca4361197d27cf))
* **app:** view tabs top center in place of the status line; VIEWS section dropped from the right ([b268ccd](https://github.com/MyAvenCEO/avenOS/commit/b268ccdb9dbc0eeb2d928eb3fd1df5d8d83612f5))
* **app:** views as tabs beside the activity stream, a VIEWS section on the right, voice-switched ([b6ea118](https://github.com/MyAvenCEO/avenOS/commit/b6ea11879d854667676fed8953b12751a3feffa7))
* **app:** voice pill shows its state as an orb, not a label ([95bb55f](https://github.com/MyAvenCEO/avenOS/commit/95bb55ff99d294f40c3bb4a2514e12fe581ca846))
* **app:** what is heard is written into the composer field, not beside it ([cf2a9a0](https://github.com/MyAvenCEO/avenOS/commit/cf2a9a08e6b448110580c71c0ac94056229006a0))
* **artifact-store:** implement minimal core service ([fcb545c](https://github.com/MyAvenCEO/avenOS/commit/fcb545c08d39c8c77530223563ca04d47eb439ac))
* **artifact-store:** route per customer databases ([31d71bf](https://github.com/MyAvenCEO/avenOS/commit/31d71bfb0f19e3e3d8e31291f5e0da7657bd65c5))
* **dev:** add local artifact store stack ([22906d7](https://github.com/MyAvenCEO/avenOS/commit/22906d7eba0d6efeb51298c601791d443f2dc7e1))
* scaffold artifact store service ([a6b401d](https://github.com/MyAvenCEO/avenOS/commit/a6b401db20c3fa8c567aed03855105833b58d16b))
* **website:** /avens address book — mission over activity, avenMAIA added ([229f737](https://github.com/MyAvenCEO/avenOS/commit/229f737b185aee19d43985b0e1254a17650f1a2f))
* **website:** Aven address book, avenFOUNDER ⊃ avenME skills, incl. VAT, clearer share split, 5 % avenID commission ([2b35236](https://github.com/MyAvenCEO/avenOS/commit/2b35236c62792c85fa9aa9c984dfe992aba57012))
* **website:** avenFOUNDER + global skills, avenCEO is the Aven of the avenCEO GmbH ([820adc4](https://github.com/MyAvenCEO/avenOS/commit/820adc4493f3ded033d3544da19baa46e06ce203))
* **website:** avenID is per person AND per company ([eb0b782](https://github.com/MyAvenCEO/avenOS/commit/eb0b782734ff967df03545e21e965491c1105279))
* **website:** avenID sichern button, avenCEO-as-asset thesis, single avenCEO GmbH founders card ([b112de9](https://github.com/MyAvenCEO/avenOS/commit/b112de906040917f78705e77e209cde13823ea6e))
* **website:** avenME + avenCEO as two roles, Sparks retired, avenCOOP full-width ([e66f0bb](https://github.com/MyAvenCEO/avenOS/commit/e66f0bb0c5f4551214c2d2d8f72139dfb7a6b3a2))
* **website:** bilingual site — DE at root, EN under /en ([5a7509c](https://github.com/MyAvenCEO/avenOS/commit/5a7509cbf35a980297723367a1b1c701e2f1f882))
* **website:** i18n core — DE at root, EN under /en, DE|EN switch in the header ([bc77c58](https://github.com/MyAvenCEO/avenOS/commit/bc77c58d2922805803ce5948f994278c8d55fe49))
* **website:** inline '+ 8 % vom Umsatz', 4/4 split, skills capped at 7 on avenFOUNDER and avenCOOP ([dace879](https://github.com/MyAvenCEO/avenOS/commit/dace8793e03e6948a9cf8ceb155b48cefcdd057d))
* **website:** landing page reworked around owning 10+ Aven and the compounding effect ([100d317](https://github.com/MyAvenCEO/avenOS/commit/100d3173040ae7e791a659660efb632cbdcd3526))
* **website:** revenue terms as stacked rows — 4,8 % tx fees, 15 % / 10 % Reinvest, 8 % equity ([7b63256](https://github.com/MyAvenCEO/avenOS/commit/7b6325618f3d72976583275825ffe97db37de323))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.23-next.1...v) (2026-08-23)


### Bug Fixes

* **release:** make main sync race-safe ([78c090b](https://github.com/MyAvenCEO/avenOS/commit/78c090be88526fb9e2539ddfb2adad27ffdd4d00))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.22-next.7...v) (2026-08-23)


### Bug Fixes

* **app:** a request settles only after a tool-free round or a tool round — never on a first word before a tool call; the reply streams in the composer card meanwhile; composer field and send button centered ([109420d](https://github.com/MyAvenCEO/avenOS/commit/109420dcdcae3b3a2eb0a2b6fb6b591954ec761e))
* **app:** a request settles only when the answer round is complete — never between tool rounds ([8ea5337](https://github.com/MyAvenCEO/avenOS/commit/8ea5337960b9cbd3125dc0f0341030cfdb676738))
* **app:** a restored intent returns in the state it was archived from ([774b79f](https://github.com/MyAvenCEO/avenOS/commit/774b79f7744bcfaacab58b99903d4b25407dec43))
* **app:** hide the Start-conversation chip while a human gate is open ([9dd67fa](https://github.com/MyAvenCEO/avenOS/commit/9dd67fac6284d96359996b8e1bf312a1765b2536))
* **app:** intent clicks no longer reopen the conversation modal ([57c8577](https://github.com/MyAvenCEO/avenOS/commit/57c8577818e4ab0119a75d5003a3655b1335f5cc))
* **app:** mobile back/menu hug the screen edges, hidden in text mode; voice mock never starts the mic ([24623d6](https://github.com/MyAvenCEO/avenOS/commit/24623d6c35f027aa5e99090cc6ed1eb0a8bcc72d))
* **app:** notch never jumps between voice and text — orb overhangs without margin; hang-up is a quiet outlined ✕ ([50bd7cd](https://github.com/MyAvenCEO/avenOS/commit/50bd7cd5c7740f3c17425767257d9a2e00be98d3))
* **app:** one notch size in voice and text mode — py-2 pill, 40px buttons, 72px orb, equal bottom gap ([3d2fa59](https://github.com/MyAvenCEO/avenOS/commit/3d2fa59c2c026c775c30b3f69dcc3311648927c1))
* **app:** selected intent card keeps its size, corners and place in the list — only the fill marks it ([674f572](https://github.com/MyAvenCEO/avenOS/commit/674f5722c8ac8225dfe5b5035438b06fd23c25cd))
* **app:** session arrays are born as $state proxies — turns settling into a just-routed session were invisible ([250724d](https://github.com/MyAvenCEO/avenOS/commit/250724dea3f67df63b80737372e226ab20c9a9bd))
* **app:** symmetric gaps between the intent list, the center card and the skills column ([a737aa4](https://github.com/MyAvenCEO/avenOS/commit/a737aa492f46a1d1ef8e9ae18bd40c77e0acb29f))
* **app:** the center card is a complete rounded card; gate and composer sit below it as their own cards ([6f5ae9f](https://github.com/MyAvenCEO/avenOS/commit/6f5ae9feac6b138175d139016dbf2f37ad69d0a3))
* **artifact-store:** harden tenant convergence ([3e450e9](https://github.com/MyAvenCEO/avenOS/commit/3e450e983dc370b11010fb54eeb056a82cd45561))
* **website:** bundle note grammar for the person case ([8811d2d](https://github.com/MyAvenCEO/avenOS/commit/8811d2d5d3d487ebe884a11087691586e4e9b921))
* **website:** space before the dash in skill page titles ([23a9a18](https://github.com/MyAvenCEO/avenOS/commit/23a9a183a3d9f38b90d362d42bb42039251f5c48))


### Features

* **app:** a request stays in a routing state until the model has understood it; cross-intent questions route themselves ([99d1eb3](https://github.com/MyAvenCEO/avenOS/commit/99d1eb3cf1ef55b09940d7e073f59e5226f15531))
* **app:** an exchange that creates or opens an intent moves into that intent's stream ([d164b43](https://github.com/MyAvenCEO/avenOS/commit/d164b43fac24a1d72264a2dec931b34da0c2c6ad))
* **app:** dev-only ?voice=<phase> mock so the voice pill renders in a browser tab ([2f534bf](https://github.com/MyAvenCEO/avenOS/commit/2f534bf658832d0c84451037872f92e70979b973))
* **app:** intent_archive / intent_restore tools — put an intent away or bring it back by message ([7bf61d7](https://github.com/MyAvenCEO/avenOS/commit/7bf61d7f1347c6cf64f44e1ba211d7e73116d289))
* **app:** intent_list names the intent on screen and nudges to switch before answering about another ([6f1e7be](https://github.com/MyAvenCEO/avenOS/commit/6f1e7be12f3298713dd65908645dfa36efc325ec))
* **app:** intent_update tool — title, type, source, deadline, status by message ([4ba96ca](https://github.com/MyAvenCEO/avenOS/commit/4ba96ca73ff9dabaf75e171c6409fd5377a2c889))
* **app:** intents are an actor with CRUD tools — list, switch, create, merge, delete ([e7ec03d](https://github.com/MyAvenCEO/avenOS/commit/e7ec03d6f6affba78773c4c8332bd5681f5dfc73))
* **app:** larger side buttons and orb in the notch, tighter bottom gap ([7994bd3](https://github.com/MyAvenCEO/avenOS/commit/7994bd3b5f6eadf9d2c81fee09c9874a112a01c8))
* **app:** list-first mobile layout for the intents workspace ([78b5c57](https://github.com/MyAvenCEO/avenOS/commit/78b5c570c795734855584b63c5ab62220e557ca6))
* **app:** merging intents merges their conversations too ([c30e54c](https://github.com/MyAvenCEO/avenOS/commit/c30e54ceb576e93d48f70498629765bee44c527d))
* **app:** narrower voice notch, loading tooltip chip, dev tap-to-cycle phases ([ad608a6](https://github.com/MyAvenCEO/avenOS/commit/ad608a60197e341079947635aac983f8cea8c8ca))
* **app:** notch chip for every informative phase; notch narrower and ~12% larger ([dc2bcb4](https://github.com/MyAvenCEO/avenOS/commit/dc2bcb43aba3c6a08941e5288276e7671f8972ab))
* **app:** one conversation — write, speak, or both; views render inline again ([1bd62a1](https://github.com/MyAvenCEO/avenOS/commit/1bd62a19f6450ffe0ae6d6e46b1d130fb83ea471))
* **app:** one top edge for all three columns; side headers wear the tab pill; the stream is a tool ([d173284](https://github.com/MyAvenCEO/avenOS/commit/d17328462d3789b4a4763f77f528a40ae72ee4c6))
* **app:** routing state lives in the composer card; compact card with a round send button; archiving routes the exchange into the archived intent ([da76a59](https://github.com/MyAvenCEO/avenOS/commit/da76a5942542333a409b8511e89641b1534ecef4))
* **app:** tablets get the collapsed mobile layout too — breakpoint md → lg ([d41a034](https://github.com/MyAvenCEO/avenOS/commit/d41a03418b726cf3a886acdad50b448a9e28f0f8))
* **app:** the chat lives inline in the intent's stream, scoped per intent; modal gone ([3e31be6](https://github.com/MyAvenCEO/avenOS/commit/3e31be654a094db6792bb43f26929ffa159a410f))
* **app:** the composer is a gate-styled card, shown only while writing or hearing; the gate yields meanwhile ([d753206](https://github.com/MyAvenCEO/avenOS/commit/d753206a9e0ca7c025558ecbd62fce9a74e92c37))
* **app:** the composer is the conversation's footer, not the notch; spotlight search parked ([0a5a665](https://github.com/MyAvenCEO/avenOS/commit/0a5a6653fa5bf1ff77fb1ae36ed2b71967b859bb))
* **app:** the model sees the live intents and the one on screen with every request ([ce69d6f](https://github.com/MyAvenCEO/avenOS/commit/ce69d6f990d4b10c718fa45aed9d742e9301cac7))
* **app:** the selected intent card is filled with its state color ([0c998b2](https://github.com/MyAvenCEO/avenOS/commit/0c998b2ff2f68be8c629b12f33731805db20b51e))
* **app:** the selected intent leads the list and joins the center panel as one surface ([2faee06](https://github.com/MyAvenCEO/avenOS/commit/2faee06849299c97b00845625e0affbd4c2c671b))
* **app:** the system prompt teaches intent routing — switch first when a request is about another intent; create, archive, merge, update, delete by message ([7a08a04](https://github.com/MyAvenCEO/avenOS/commit/7a08a04b9e9f254504294edfa8628e417182d48f))
* **app:** upload dropped files as artifacts ([2672487](https://github.com/MyAvenCEO/avenOS/commit/2672487282aa771f0e675f5cd8af69d66d19f9ec))
* **app:** upload placeholder on the notch's left, where the input switch was (not wired yet) ([2ebdb8b](https://github.com/MyAvenCEO/avenOS/commit/2ebdb8bb05715e230318dbd01eeac8508cae93d6))
* **app:** view tabs top center in place of the status line; VIEWS section dropped from the right ([9608906](https://github.com/MyAvenCEO/avenOS/commit/9608906d56666b8e77b311d38430e9a66343d98a))
* **app:** views as tabs beside the activity stream, a VIEWS section on the right, voice-switched ([d4e4bdf](https://github.com/MyAvenCEO/avenOS/commit/d4e4bdf2bcf0a6869b7a2d8bf0ae5fdabbbea46f))
* **app:** voice pill shows its state as an orb, not a label ([9bc8b37](https://github.com/MyAvenCEO/avenOS/commit/9bc8b37a360d6ee62265e340f151739c793b0622))
* **app:** what is heard is written into the composer field, not beside it ([f0d8d5c](https://github.com/MyAvenCEO/avenOS/commit/f0d8d5c0d778f51962dc711ecf201f2f69b07804))
* **artifact-store:** implement minimal core service ([e2feb16](https://github.com/MyAvenCEO/avenOS/commit/e2feb16772de100b347c5354c771f7c357aada08))
* **artifact-store:** route per customer databases ([24c25da](https://github.com/MyAvenCEO/avenOS/commit/24c25da02154756adaa2dfcb8432813d81ad3939))
* **dev:** add local artifact store stack ([4329822](https://github.com/MyAvenCEO/avenOS/commit/432982223ec696d12713ba372f6464bffd867ac2))
* scaffold artifact store service ([eb04041](https://github.com/MyAvenCEO/avenOS/commit/eb040414ae5e3131e2b945ed7ec5bfd1ca79a067))
* **website:** /avens address book — mission over activity, avenMAIA added ([19b2c58](https://github.com/MyAvenCEO/avenOS/commit/19b2c58d9e54f5663bb668ad08cba1537065b689))
* **website:** Aven address book, avenFOUNDER ⊃ avenME skills, incl. VAT, clearer share split, 5 % avenID commission ([9380dd8](https://github.com/MyAvenCEO/avenOS/commit/9380dd8c5319d9632b1872785fc28593b35f507d))
* **website:** avenFOUNDER + global skills, avenCEO is the Aven of the avenCEO GmbH ([2c57cf6](https://github.com/MyAvenCEO/avenOS/commit/2c57cf67d9aa25f7c4118873b95ee11c0b8cfca6))
* **website:** avenID is per person AND per company ([a890b0d](https://github.com/MyAvenCEO/avenOS/commit/a890b0de1dc4c8de37354d036e1ee7a59485a2c8))
* **website:** avenID sichern button, avenCEO-as-asset thesis, single avenCEO GmbH founders card ([22dd6f9](https://github.com/MyAvenCEO/avenOS/commit/22dd6f9ba029d8fcbdeb7ff51fdd6f68164127d2))
* **website:** avenME + avenCEO as two roles, Sparks retired, avenCOOP full-width ([30bd8fd](https://github.com/MyAvenCEO/avenOS/commit/30bd8fd1f185d963ce95e60d4ba639864f3edc0e))
* **website:** bilingual site — DE at root, EN under /en ([3e5704b](https://github.com/MyAvenCEO/avenOS/commit/3e5704b2729cbb182566c725338a0f035f1e43ca))
* **website:** i18n core — DE at root, EN under /en, DE|EN switch in the header ([cae53c0](https://github.com/MyAvenCEO/avenOS/commit/cae53c029ff9ba0c666128193e7bff7c9ffb6cdb))
* **website:** inline '+ 8 % vom Umsatz', 4/4 split, skills capped at 7 on avenFOUNDER and avenCOOP ([33da932](https://github.com/MyAvenCEO/avenOS/commit/33da932eeb634cdcf3ba77825a378a1c1007a555))
* **website:** landing page reworked around owning 10+ Aven and the compounding effect ([d59fca7](https://github.com/MyAvenCEO/avenOS/commit/d59fca7f3b0eb49098d1d62622f8bbcb39ed6778))
* **website:** revenue terms as stacked rows — 4,8 % tx fees, 15 % / 10 % Reinvest, 8 % equity ([18eab1a](https://github.com/MyAvenCEO/avenOS/commit/18eab1a1a2aed3d0bced1a9d7d83139d622027c1))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.22-next.6...v) (2026-08-22)
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.22-next.5...v) (2026-08-22)
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.22-next.4...v) (2026-08-22)
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.22-next.3...v) (2026-08-22)


### Bug Fixes

* **ios:** sign the archived app with its entitlements so passkeys work on iOS ([#97](https://github.com/MyAvenCEO/avenOS/issues/97)) ([84de7a0](https://github.com/MyAvenCEO/avenOS/commit/84de7a03cfe93b4effafd1b05b2c8a0acac5b007))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.22-next.2...v) (2026-08-22)


### Bug Fixes

* **api:** sync svelte-kit before email:check so cold builds (Docker) succeed ([537c69a](https://github.com/MyAvenCEO/avenOS/commit/537c69af77930f29c7834062f57eda4c7d6535fb))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.22-next.1...v) (2026-08-22)


### Features

* **email:** brand the Maizzle templates and add the legal footer ([#95](https://github.com/MyAvenCEO/avenOS/issues/95)) ([70d7987](https://github.com/MyAvenCEO/avenOS/commit/70d7987b5b4c423fba1cc89107632db71d63c459))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.21-next.12...v) (2026-08-22)


### Features

* **billing:** the whole customer portal, ours — inline checkout, orders, pause, no Creem window (0161) ([a6a6736](https://github.com/MyAvenCEO/avenOS/commit/a6a673654cc62be39b010f42a1ba99b23ed4a77d))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.21-next.11...v) (2026-08-21)


### Bug Fixes

* **auth:** finalize the registered passkey ([b601981](https://github.com/MyAvenCEO/avenOS/commit/b601981093eaa2f2364e34ecf591e16ce88f267b))


### Features

* **email:** add live template previews ([2e2ae8e](https://github.com/MyAvenCEO/avenOS/commit/2e2ae8ec71971adb0c0e80155c62314dd4937b30))
* **email:** add Maizzle template studio ([c39804f](https://github.com/MyAvenCEO/avenOS/commit/c39804fb77eed52ad4f368df07d52f72ad945c97))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.21-next.10...v) (2026-08-21)


### Bug Fixes

* **billing:** adopt the dashboard-created Creem products; history without a subscription ([6190405](https://github.com/MyAvenCEO/avenOS/commit/619040564ae0ac05c3271251d90e4d8ea42d15cc)), closes [#if](https://github.com/MyAvenCEO/avenOS/issues/if)
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.21-next.9...v) (2026-08-21)


### Features

* **app:** the Abrechnung pane — the whole Creem relationship, self-served (0160 ph.3) ([c68abaf](https://github.com/MyAvenCEO/avenOS/commit/c68abaf91e9cb10642429440ebac64745304a50b))
* **billing:** avenME + avenCEO become recurring Creem products (0160 ph.1–2) ([8412a4b](https://github.com/MyAvenCEO/avenOS/commit/8412a4b6ce8c34c398a50a7f8c0d6b09df0b6b47))
* **billing:** invoices render in-app; the official PDFs open in an app window (0160) ([09ffeeb](https://github.com/MyAvenCEO/avenOS/commit/09ffeebd77091d5a24262be23c394f19cc43663c))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.21-next.8...v) (2026-08-21)


### Bug Fixes

* **app:** native passkeys, by asking the signature instead of the bundle ([6fd06ef](https://github.com/MyAvenCEO/avenOS/commit/6fd06ef1b3238025eae4aa366f0219849f0db8e2))
* **ios:** the passkey delegate may not be narrower than what it implements ([f761d55](https://github.com/MyAvenCEO/avenOS/commit/f761d5519ce481564b494878fa2492259a2ceac1))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.21-next.7...v) (2026-08-21)


### Bug Fixes

* **app:** link the Swift runtime so the macOS build actually starts ([23d0839](https://github.com/MyAvenCEO/avenOS/commit/23d0839de85d28532a19bee537365215f6195e48))
* **app:** unsigned dev builds fall back to the browser login ([da46417](https://github.com/MyAvenCEO/avenOS/commit/da4641756a36c79c6119879430bab6dcd1f28d58))
* **auth:** improve passkey enrollment diagnostics ([16818ee](https://github.com/MyAvenCEO/avenOS/commit/16818ee61d197242120a9a2a82c1d24c69a42757))
* avenID is 25 €, the tiers reserve rather than buy, and the flow card gets room ([25b9f06](https://github.com/MyAvenCEO/avenOS/commit/25b9f06d7eef51b9e0ec4af0b644730e51a7f855))
* **id:** the passkey is named after the aven, not by hand ([95b4571](https://github.com/MyAvenCEO/avenOS/commit/95b45717d3dc2c3d3453c9bbb6516ddb29beee48))


### Features

* **app:** settings opens on who is signed in ([d7f9bc6](https://github.com/MyAvenCEO/avenOS/commit/d7f9bc6d9b1b7a13ccf9ddb5cd2013a924fec909))
* **id:** availability answers while you type, one question per screen ([32f05ed](https://github.com/MyAvenCEO/avenOS/commit/32f05ed57d0e47360bd5915b477bc63c75308ab6))
* **id:** the Creem checkout is the page, not a column beside it ([b4fefa0](https://github.com/MyAvenCEO/avenOS/commit/b4fefa0ae2f01fd3863f3196f4d21d645642faa5))
* **id:** the dashboard shows where you stand in the queue ([df59b86](https://github.com/MyAvenCEO/avenOS/commit/df59b863d0311225967450676d6d7bbd6e06d91d))
* **id:** the flow asks about your aven, and names the passkey after it ([615c0f6](https://github.com/MyAvenCEO/avenOS/commit/615c0f627f6786d9d9824118b30a929532cbd641))
* **id:** the waitlist becomes a list you can see yourself in ([6c3e34c](https://github.com/MyAvenCEO/avenOS/commit/6c3e34c36ad4fc284b19602203816f78a3f57cc9))
* the avenID funnel moves to the id service, carrying the tier ([d1e1aae](https://github.com/MyAvenCEO/avenOS/commit/d1e1aaec4e0df8b9741706d3a04ad4f6aab4f92c))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.21-next.6...v) (2026-08-21)


### Features

* **auth:** add native Apple passkey golden path ([84fd1b3](https://github.com/MyAvenCEO/avenOS/commit/84fd1b35147f45fe4d687408a09fafc74f7318f5))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.21-next.5...v) (2026-08-21)


### Bug Fixes

* **api:** the image build can see the aven-skills workspace ([ad3a5c4](https://github.com/MyAvenCEO/avenOS/commit/ad3a5c4ba09cd87dee7903aea1ab5a777946d6b0))
* **intents:** log runs behind the gate, ends at its end, and stops repeating it ([c627aa4](https://github.com/MyAvenCEO/avenOS/commit/c627aa4418ac21fce8633abc683472ee807fc207))
* **query:** chat band back to 30%, font back to 13px ([97185cb](https://github.com/MyAvenCEO/avenOS/commit/97185cbc5c9d7ad9b4128c9ae26679f4b0470edd))
* **query:** gate back to the dock, rail logo out, modal above and bigger ([c704b6e](https://github.com/MyAvenCEO/avenOS/commit/c704b6ea15a7074fea59f6db8afc3012a9c5131a))
* **query:** gate into the intents column; chat autoscroll; one-message input bug ([f07792f](https://github.com/MyAvenCEO/avenOS/commit/f07792f0ed3c986a2201479fb97e095efd63b2f6))
* **shell:** make the rail one exclusive group; fold the cream family to four ([c8e3aae](https://github.com/MyAvenCEO/avenOS/commit/c8e3aae86424e941f4b236d2d22103cba464c303)), closes [#f9f5e6](https://github.com/MyAvenCEO/avenOS/issues/f9f5e6) [#f6f3e8](https://github.com/MyAvenCEO/avenOS/issues/f6f3e8) [#efeada](https://github.com/MyAvenCEO/avenOS/issues/efeada) [#f6f1e2](https://github.com/MyAvenCEO/avenOS/issues/f6f1e2) [#fffdf7](https://github.com/MyAvenCEO/avenOS/issues/fffdf7)
* **skills:** restore the catalog reconciliation the linearisation dropped ([535362b](https://github.com/MyAvenCEO/avenOS/commit/535362b63c977f872141df93a269285a99b43eb5))
* **skills:** the app shows the catalog's names, not its own ids ([9db456e](https://github.com/MyAvenCEO/avenOS/commit/9db456e3630dcdfe298480a03e5c50cb4e834973))
* **ui:** revive two colour classes left dead by the role renames ([ddb31cf](https://github.com/MyAvenCEO/avenOS/commit/ddb31cf695ad6aab5ec53e7cba8ab6df7803d747))
* **ui:** scale the app by its root font size, not by zoom ([4613665](https://github.com/MyAvenCEO/avenOS/commit/4613665bef1a0a2d7ea451b7a5dbd924f8787c6c)), closes [#217e91](https://github.com/MyAvenCEO/avenOS/issues/217e91)
* **website:** a visible dashed edge, and sparks that say how many ([362f8a3](https://github.com/MyAvenCEO/avenOS/commit/362f8a344f6b39d93ccb4707ab37bf9af9d9375f))
* **website:** meet the two Sparks before reading the formula ([b55dc35](https://github.com/MyAvenCEO/avenOS/commit/b55dc35c79c8a60d7ddb51807ffac67785f7ef07))
* **website:** net prices on every number, "Alles aus X" as a real bullet ([bcee019](https://github.com/MyAvenCEO/avenOS/commit/bcee019ae9220c5d3077a9fc19a5efa29fb7ccb0))
* **website:** one beel bullet in avenCOOP, not two ([17b0b09](https://github.com/MyAvenCEO/avenOS/commit/17b0b09b5157db252f3f21dc653dda9fffcc8216))
* **website:** one hero paragraph, and the two Sparks under the formula ([56fa47e](https://github.com/MyAvenCEO/avenOS/commit/56fa47e3abbc9997222e3ce033ccb5c7ca8c3e4d))
* **website:** runtime scales with the tier, and a price is one line ([a3b196b](https://github.com/MyAvenCEO/avenOS/commit/a3b196be8a9161922407b8edb31314a3a74adc63))
* **website:** shipped skills first, runtime after the list, commission as a number ([65c2b71](https://github.com/MyAvenCEO/avenOS/commit/65c2b715e28c6a9ced8200694522fa68c9a433c7))
* **website:** stakes before the day, and two hero lines instead of four ([12d08b7](https://github.com/MyAvenCEO/avenOS/commit/12d08b7bf02384c46638b0ca39a4a5487f4f0b4d))
* **website:** sunflower everywhere, a hero of two beats, and a warmer card ([744e3ff](https://github.com/MyAvenCEO/avenOS/commit/744e3ff308307102b5fc4b482f5546d6e634e9a2))
* **website:** sunflower on the display line, a name held for a year, two cuts ([0e9094b](https://github.com/MyAvenCEO/avenOS/commit/0e9094b90c6fd93bc49186dc5a4ebb385c07f355)), closes [#d2a24a](https://github.com/MyAvenCEO/avenOS/issues/d2a24a)
* **website:** the collective section is a vision, not a pricing explainer ([558abab](https://github.com/MyAvenCEO/avenOS/commit/558ababe509c67eb8673990e62519ac66cea7c4d))
* **website:** the contrast in one breath, and the asset is the pair ([0f2ca61](https://github.com/MyAvenCEO/avenOS/commit/0f2ca61a8dccf6beef3fd25ea5446eb8cf4ed39f))
* **website:** the headline stops at the potential ([05bd768](https://github.com/MyAvenCEO/avenOS/commit/05bd7685867fe71a2306cae1736230a657299381))
* **website:** the hero promise ends on why, not on blame ([7df6a3d](https://github.com/MyAvenCEO/avenOS/commit/7df6a3d2e785f85926a0bf3bf023511dfb9e0f10))
* **website:** the hero says it in four lines ([846a4c9](https://github.com/MyAvenCEO/avenOS/commit/846a4c9bca4c817fb263f7c8ee98ed9946d4f8d2))
* **website:** the hero says what an Aven IS, in the first line ([ead5082](https://github.com/MyAvenCEO/avenOS/commit/ead50823f3b41219901f407cc8b20a8d6f155882))
* **website:** the hero sub-header reads in ink, sunflower marks one phrase ([0fc83c1](https://github.com/MyAvenCEO/avenOS/commit/0fc83c1174fa795e09763bcd688fbb6e6f20e610))
* **website:** the revenue share is its own block on the card ([ddf11c1](https://github.com/MyAvenCEO/avenOS/commit/ddf11c1e8bb3403601070456c485c65ee13f1b9c))
* **website:** the Spark line is the headline of the movement ([b234ba6](https://github.com/MyAvenCEO/avenOS/commit/b234ba64f3dead0f30012dc505102583c46f0b9a))
* **website:** the Spark section hands over with a question ([0645b5e](https://github.com/MyAvenCEO/avenOS/commit/0645b5eb38596b44291121dc88cacffd85551f98))


### Features

* **auth:** the passkey gate shows, but does not hold the door ([caa1c14](https://github.com/MyAvenCEO/avenOS/commit/caa1c1473f6d4d05d671995d9fa64cae119d0f36))
* **hitl:** one layout per decision shape; intents sort by urgency; centered column heads ([b4349cf](https://github.com/MyAvenCEO/avenOS/commit/b4349cf58c9d2db0a3acec5a36be08089fc14f20))
* **hitl:** the gate carries what it decides — eggshell card, marine footer, nine scenarios ([b62adb0](https://github.com/MyAvenCEO/avenOS/commit/b62adb0c6b31a7ff76d9287323188e4f7b8ab4c8))
* **intents:** five color-coded intent states; two-row cards; skills moves into the rail ([6a66107](https://github.com/MyAvenCEO/avenOS/commit/6a66107e69773687b828761b4d413ed878a7a07d))
* **query:** one answer surface — the universal query modal (0159, slice 1) ([65c0e7e](https://github.com/MyAvenCEO/avenOS/commit/65c0e7ee6ea87b43a0830a42a921df768f9cec24)), closes [#68](https://github.com/MyAvenCEO/avenOS/issues/68)
* **query:** tool results inline in the chat; bigger chat text; gate as its own card ([8e3f412](https://github.com/MyAvenCEO/avenOS/commit/8e3f41247e1767cd0d011cf6ff867a581ebcbbae))
* **settings:** category nav and a brand-colour surface; centre the intent state header ([5702840](https://github.com/MyAvenCEO/avenOS/commit/5702840672b856d5f425e6966f77cdb1c4ff51dc))
* **skills:** one catalog for the website and the app ([8712245](https://github.com/MyAvenCEO/avenOS/commit/8712245c1296e3f12db1bdea5830812ab752dd3b))
* **website:** "Sichere dir deinen Aven" in the nav, coming-soon skills, no golden offer ([d47678d](https://github.com/MyAvenCEO/avenOS/commit/d47678de012711668b52e3d108a0218516b3ecec))
* **website:** a board of taken avenIDs under every call to action ([27bc155](https://github.com/MyAvenCEO/avenOS/commit/27bc1559d9525217e78ebd6ddeca0b7d0cc5b31f))
* **website:** a commission block on every tier that earns one ([be6179a](https://github.com/MyAvenCEO/avenOS/commit/be6179a85e22337385d30162ae825bf55b614964))
* **website:** a global footer, the aven mark in the navbar, and named subjects ([eee9602](https://github.com/MyAvenCEO/avenOS/commit/eee9602db0010657f0c3b26cbc0b49cd94be425a))
* **website:** a runtime block on every tier, and the VAT clause instead of "netto" ([bef9ec7](https://github.com/MyAvenCEO/avenOS/commit/bef9ec7fa1b3145f59deb97ff030816516cbc553))
* **website:** avenCEO's features are skills too, and the commission sits under the CTA ([b1cfebd](https://github.com/MyAvenCEO/avenOS/commit/b1cfebdd0b9d6b1b01d0e14e858a5e1d580c03cf))
* **website:** calendar organizer + todo shuffler, and the Post's real price ([671d26e](https://github.com/MyAvenCEO/avenOS/commit/671d26e61f31d45e5e1e2bc317a013dd497af431))
* **website:** inbox router, bookmark champion, and availability from one source ([b5a6fba](https://github.com/MyAvenCEO/avenOS/commit/b5a6fbabbc0d37133114df47f2c6c265d7c398c3))
* **website:** lead with the potential, not the funeral — and name the collective ([8eda1cf](https://github.com/MyAvenCEO/avenOS/commit/8eda1cf4b832ba19898a2ce401f7a1f9daaf37be))
* **website:** one hero promise, pain before ownership, sunflower eyebrows ([acb7ac8](https://github.com/MyAvenCEO/avenOS/commit/acb7ac8dbf902417696f6f7ab5bf666353e0f27c))
* **website:** one section between hero and thesis, and a hero that promises ([d4eaa3e](https://github.com/MyAvenCEO/avenOS/commit/d4eaa3e52c320b07efdc3fe69a41e76fafd33cdb))
* **website:** Petit Formal Script carries the titles ([9ee40a7](https://github.com/MyAvenCEO/avenOS/commit/9ee40a71a0625c1bdd8d67b1968ad26c940a5edd))
* **website:** plan features can BE a skill, and link to it ([4dc1d02](https://github.com/MyAvenCEO/avenOS/commit/4dc1d02512d734531f1cbd3fc6f3fba254f01798))
* **website:** runtime gets cheaper up the ladder, commission gets richer ([738984e](https://github.com/MyAvenCEO/avenOS/commit/738984ef49fafa74afa9ce93c2695f7e531a78a9))
* **website:** sync the marketing site to the brand tokens, collapse five tiers to three ([509545b](https://github.com/MyAvenCEO/avenOS/commit/509545b04011240c8289adba80826c1a945ced65)), closes [#e8ede1](https://github.com/MyAvenCEO/avenOS/issues/e8ede1) [#2c5f6b](https://github.com/MyAvenCEO/avenOS/issues/2c5f6b)
* **website:** tell us what you want to build — the wildcard step ([20edeb5](https://github.com/MyAvenCEO/avenOS/commit/20edeb514dcf9affd4da3147d6258f4ed9d9cb8a))
* **website:** the board is the queue, with your place open at the bottom ([6d5a20e](https://github.com/MyAvenCEO/avenOS/commit/6d5a20e86cae73ec7d9b935323341eba9023475f))
* **website:** the share is a reinvest — and the vision is 1 million founders ([66578fa](https://github.com/MyAvenCEO/avenOS/commit/66578fab75cd963b0c666e6213820d4571dd00f2))
* **website:** the waitlist explains why the avenID comes first, and drops the newsletter ([3d1f9b1](https://github.com/MyAvenCEO/avenOS/commit/3d1f9b1598e97c507c00a6e8888f4b4433825fd6))


### Reverts

* Revert "feat(website): Petit Formal Script carries the titles" ([16838ad](https://github.com/MyAvenCEO/avenOS/commit/16838adfcf9bd3900950e516f6bc906a5385aabe))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.21-next.4...v) (2026-08-21)


### Bug Fixes

* **aven-api:** satisfy Biome checks ([187fbdd](https://github.com/MyAvenCEO/avenOS/commit/187fbdd41a17cbd264b698dc827c3a8048104919))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.21-next.3...v) (2026-08-21)


### Features

* **auth:** add native passkey sign-in ([#79](https://github.com/MyAvenCEO/avenOS/issues/79)) ([c9abe33](https://github.com/MyAvenCEO/avenOS/commit/c9abe339f5eeaa9e57bb558385fa855216f17d49))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.21-next.2...v) (2026-08-21)
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.21-next.1...v) (2026-08-21)


### Features

* **ops:** improve stack observability and release safety ([#77](https://github.com/MyAvenCEO/avenOS/issues/77)) ([42af6d0](https://github.com/MyAvenCEO/avenOS/commit/42af6d0ea74d86cc4998022f322d8ac95795c65b))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.20-next.9...v) (2026-08-21)
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.20-next.8...v) (2026-08-20)


### Features

* **identity:** add checkout, passkey enrollment, and Hetzner deployment ([#74](https://github.com/MyAvenCEO/avenOS/issues/74)) ([518df36](https://github.com/MyAvenCEO/avenOS/commit/518df36eec25d3bf444729a6b00561176ebd0850))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.20-next.7...v) (2026-08-20)


### Features

* **voice:** auto-switch to text on first keystroke, back to voice on send ([#73](https://github.com/MyAvenCEO/avenOS/issues/73)) ([04407f5](https://github.com/MyAvenCEO/avenOS/commit/04407f5e616b8c3606c9d43e29397fc27f4107e9))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.20-next.6...v) (2026-08-20)


### Features

* **shell:** MAIA becomes a global context in the spark rail; talk = 25% chat / 75% views ([#72](https://github.com/MyAvenCEO/avenOS/issues/72)) ([ce2f16f](https://github.com/MyAvenCEO/avenOS/commit/ce2f16f271f8568676f698520aa81b8c4a0b5ddf))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.20-next.5...v) (2026-08-20)


### Features

* **intents:** split talk layout — top-half inline view, floating dock, edge-to-edge asides ([#71](https://github.com/MyAvenCEO/avenOS/issues/71)) ([259c370](https://github.com/MyAvenCEO/avenOS/commit/259c370c753780f1c5076d6bee21e7e1c44262d8))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.20-next.4...v) (2026-08-20)


### Bug Fixes

* **intents:** scope HITL gates to their context; columns stretch to the HITL edge ([#70](https://github.com/MyAvenCEO/avenOS/issues/70)) ([023e909](https://github.com/MyAvenCEO/avenOS/commit/023e909a458ad261834e5cb2bf018d142c5040a3))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.20-next.3...v) (2026-08-20)


### Features

* **intents:** real chat in Talk-to-MAIA with inline actor views; Views tab retired ([#69](https://github.com/MyAvenCEO/avenOS/issues/69)) ([c2cc8da](https://github.com/MyAvenCEO/avenOS/commit/c2cc8da18d94d6b7d4c79cd1375d6adb740575da))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.20-next.2...v) (2026-08-20)
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.8.20-next.1...v) (2026-08-20)


### Features

* **voice:** surface errors above the pill, not buried in the chat stream ([ed8e333](https://github.com/MyAvenCEO/avenOS/commit/ed8e3332aa47d557fc3c9144bf03dcdfdd1d1144))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.7.31-next.3...v) (2026-08-20)
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.7.31-next.2...v) (2026-07-31)


### Bug Fixes

* **ci:** drop the sherpa-onnx iOS steps left behind by the strip ([#64](https://github.com/MyAvenCEO/avenOS/issues/64)) ([fdb6e73](https://github.com/MyAvenCEO/avenOS/commit/fdb6e73c81d4704a9447898ba14dfb312366881e))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.7.31-next.1...v) (2026-07-31)


* feat!: strip avenOS to the avenCITY seed (0121) (#63) ([53cfa8a](https://github.com/MyAvenCEO/avenOS/commit/53cfa8a6c71ea11a4974365532df8703872a7ac3)), closes [#63](https://github.com/MyAvenCEO/avenOS/issues/63)


### BREAKING CHANGES

* the vault, sync, auth, skills, vibes and flows are gone. They
are recoverable from git history; the biometric and passkey material was lifted
into ARCHIVE/ first (see the previous commit).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>

* docs(board): 0121 built — every criterion checked, build → review

All nine acceptance criteria proven from command output. Corrected one during
the build: the "no dead references" grep had no --glob '!**/*.md', so it matched
47 board cards in the shipped-work archive (which must name what they recorded),
this card itself, and the "Removed by 0121" list in scripts/README.md.
Documentation of deleted things is not a dead reference.

Logged the four things the spec did not anticipate — build.rs was entirely
workarounds for deps that no longer exist, the Tauri capabilities and bundle
resources still referenced deleted plugins, dev-app-desktop imported the deleted
aven-server, and the three release scripts the card promised to keep all
provisioned onnxruntime — plus the residual dead AI paths in tauri-ios-asc.ts.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.7.18-next.2...v) (2026-07-31)


### Features

* brain app icon, avenCITY as a third world, and Select Network on every sign-in ([#62](https://github.com/MyAvenCEO/avenOS/issues/62)) ([769943b](https://github.com/MyAvenCEO/avenOS/commit/769943b265e43b168dcc22e94290753e29a3b02a)), closes [#fff](https://github.com/MyAvenCEO/avenOS/issues/fff)
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.7.18-next.1...v) (2026-07-18)


### Bug Fixes

* **ci:** add libs/aven-voice to betterauth Docker workspace list ([#61](https://github.com/MyAvenCEO/avenOS/issues/61)) ([9597e50](https://github.com/MyAvenCEO/avenOS/commit/9597e50a30445d4199c1c59c8cf93c56fd30123b))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.7.16-next.7...v) (2026-07-18)


### Features

* aven-voice — realtime voice mode + calendar/dienstplan/kontakte skills ([#60](https://github.com/MyAvenCEO/avenOS/issues/60)) ([4403817](https://github.com/MyAvenCEO/avenOS/commit/440381794ac1f7b3dd48aa173936d43deb5acc73)), closes [#pushVibe](https://github.com/MyAvenCEO/avenOS/issues/pushVibe)
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.7.16-next.6...v) (2026-07-16)
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.7.16-next.5...v) (2026-07-16)
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.7.16-next.4...v) (2026-07-16)
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.7.16-next.3...v) (2026-07-16)


### Bug Fixes

* **0120:** TTS speaker + German + copy-logs + mobile hamburger + voice modal ([#56](https://github.com/MyAvenCEO/avenOS/issues/56)) ([a8d5434](https://github.com/MyAvenCEO/avenOS/commit/a8d5434a0744373260d4d388c5c4cecc2dfae12d))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.7.16-next.2...v) (2026-07-16)
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.7.16-next.1...v) (2026-07-16)


### Bug Fixes

* **0120:** voice — all skills + delete-confirm modal, format-agnostic TTS playback ([#54](https://github.com/MyAvenCEO/avenOS/issues/54)) ([01f94da](https://github.com/MyAvenCEO/avenOS/commit/01f94daa154a68bd5902c243a09bf2246c3b7a1e))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.7.15-next.6...v) (2026-07-16)


### Bug Fixes

* **0120:** forward tool-result cards to voice turns + TTS breadcrumb ([#53](https://github.com/MyAvenCEO/avenOS/issues/53)) ([8c64516](https://github.com/MyAvenCEO/avenOS/commit/8c6451643979460fefe1d59c2c0ea257b51918e5))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.7.15-next.5...v) (2026-07-15)


### Bug Fixes

* **0120:** realtime turn — base64 audio framing, always-recover, + breadcrumbs ([#52](https://github.com/MyAvenCEO/avenOS/issues/52)) ([6e8650c](https://github.com/MyAvenCEO/avenOS/commit/6e8650c71fd0d946298f8a00251e8d502851d9b6))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.7.15-next.4...v) (2026-07-15)


### Bug Fixes

* **0120:** allow wss:// in Tauri CSP — realtime WebSocket was CSP-blocked (root cause) ([#51](https://github.com/MyAvenCEO/avenOS/issues/51)) ([759ada1](https://github.com/MyAvenCEO/avenOS/commit/759ada157e9202a040776f289de67046ad348039))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.7.15-next.3...v) (2026-07-15)
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.7.15-next.2...v) (2026-07-15)


### Bug Fixes

* **0120:** realtime voice actually engages — decouple from Tauri, on-device model, stale bearer ([#49](https://github.com/MyAvenCEO/avenOS/issues/49)) ([5673e4d](https://github.com/MyAvenCEO/avenOS/commit/5673e4d64c1ad6a1c74719254bb0320d7e84e6cd))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.7.15-next.1...v) (2026-07-15)


### Features

* **0120:** realtime voice hands-free UX — start-to-stream, big red stop, live captions ([#48](https://github.com/MyAvenCEO/avenOS/issues/48)) ([9a74120](https://github.com/MyAvenCEO/avenOS/commit/9a741201991a56d1ed7176cd531e05cb51c737c2))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.7.14-next.2...v) (2026-07-15)


### Features

* **0120:** on-screen conversation-phase indicator (Listening/Thinking/Speaking) ([#47](https://github.com/MyAvenCEO/avenOS/issues/47)) ([8caa36b](https://github.com/MyAvenCEO/avenOS/commit/8caa36b43873aa9fc8b64f0df08e0d231149b640))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.7.14-next.1...v) (2026-07-14)


### Features

* **0120:** hands-free realtime voice conversation — auto-VAD, barge-in, reliable speak-back ([#46](https://github.com/MyAvenCEO/avenOS/issues/46)) ([c625061](https://github.com/MyAvenCEO/avenOS/commit/c6250610dad637fdb33e486cec7a8dd826a20e2d))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.7.5-next.12...v) (2026-07-14)


### Features

* **0120:** e2ee TEE realtime live voice (Voxtral STT→LLM→TTS, server-orchestrated) + mode switch ([#45](https://github.com/MyAvenCEO/avenOS/issues/45)) ([61ab15d](https://github.com/MyAvenCEO/avenOS/commit/61ab15def8b6d644e59b9fd8adb7961c47f4c111))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.7.5-next.11...v) (2026-07-05)


### Features

* **0119:** dispatch as system skill — prompts as DB config + full context transparency ([#44](https://github.com/MyAvenCEO/avenOS/issues/44)) ([316e15e](https://github.com/MyAvenCEO/avenOS/commit/316e15ef45d4ff9791096f6e5d52aa8851ec4c20))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.7.5-next.10...v) (2026-07-05)


### Features

* **0119:** voice + logo button polish; Flows tab reuses the left-aside skill ([#43](https://github.com/MyAvenCEO/avenOS/issues/43)) ([b9d10a9](https://github.com/MyAvenCEO/avenOS/commit/b9d10a9252ddaad7c23723f86ac74fa8fb1cf5ca))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.7.5-next.9...v) (2026-07-05)


### Features

* **0119:** split the voice UI — submit/cancel replace the logo button, centered ([#42](https://github.com/MyAvenCEO/avenOS/issues/42)) ([9fd75cd](https://github.com/MyAvenCEO/avenOS/commit/9fd75cd008c92254ccf206489fa8b05465d28e50))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.7.5-next.8...v) (2026-07-05)


### Features

* **0119:** wire the Flows tab — the routed skill's node tree full-screen (DB Skills read-model) ([#41](https://github.com/MyAvenCEO/avenOS/issues/41)) ([97b2bc0](https://github.com/MyAvenCEO/avenOS/commit/97b2bc0caa9dedd5814f07580a177c2eeb51340a))
* remove the Fly tab (read-only orgs viewer — not needed) ([#40](https://github.com/MyAvenCEO/avenOS/issues/40)) ([872441f](https://github.com/MyAvenCEO/avenOS/commit/872441f0aefec9706e1b1e53eee5cb27f11d8626))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.7.5-next.7...v) (2026-07-05)


### Bug Fixes

* **deploy:** migration 0113 — ensure data_bundles exists (the 0058 IF-EXISTS rename no-op) ([#39](https://github.com/MyAvenCEO/avenOS/issues/39)) ([70eeb45](https://github.com/MyAvenCEO/avenOS/commit/70eeb45c677ba1c42e4c599b2950ca22cb034c08))
* **deploy:** replay-safe migrations 0073/0080/0081 — the next-channel boot blocker ([#38](https://github.com/MyAvenCEO/avenOS/issues/38)) ([49515aa](https://github.com/MyAvenCEO/avenOS/commit/49515aa2fa0ac9eb6950f9ac643be625d9142ee6))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.7.5-next.6...v) (2026-07-05)


### Bug Fixes

* **ci:** forensics greps the boot/error lines (the migrate listing drowned the FAILED text) ([#37](https://github.com/MyAvenCEO/avenOS/issues/37)) ([5fa298d](https://github.com/MyAvenCEO/avenOS/commit/5fa298d04a91a4e5f45706d122d837d03ce47956))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.7.5-next.5...v) (2026-07-05)


### Bug Fixes

* **ci:** move the boot-forensics logs step into the deploy-auth job (it had landed in release-macos) ([#36](https://github.com/MyAvenCEO/avenOS/issues/36)) ([cdb8794](https://github.com/MyAvenCEO/avenOS/commit/cdb879424af47846229abec1989cb77631e0ee26))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.7.5-next.4...v) (2026-07-05)


### Bug Fixes

* **deploy:** resilient boot — bootstrap retries forever with per-attempt timeout + logged cause ([#35](https://github.com/MyAvenCEO/avenOS/issues/35)) ([1f73222](https://github.com/MyAvenCEO/avenOS/commit/1f73222d081c31ddc135574dfc8b338ec76b147d))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.7.5-next.3...v) (2026-07-05)


### Bug Fixes

* **deploy:** boot watchdog + phase logs + always-on app-log forensics in CI ([#34](https://github.com/MyAvenCEO/avenOS/issues/34)) ([6a89fbe](https://github.com/MyAvenCEO/avenOS/commit/6a89fbe8409a0b872446fc4ef9508df32d81b910))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.7.5-next.2...v) (2026-07-05)


### Bug Fixes

* **deploy:** lazy Tauri imports in aven-vibes sandbox — the Fly boot crash ([#33](https://github.com/MyAvenCEO/avenOS/issues/33)) ([3224d7b](https://github.com/MyAvenCEO/avenOS/commit/3224d7bc111f04a025b43736e874e37b7e35a3f2))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.7.5-next.1...v) (2026-07-05)


### Bug Fixes

* **deploy:** betterauth Fly image needs aven-skills + aven-ontology workspaces ([#32](https://github.com/MyAvenCEO/avenOS/issues/32)) ([e912bd6](https://github.com/MyAvenCEO/avenOS/commit/e912bd60a9b3890830e71f6fc00e158be3430970))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.7.2-next.1...v) (2026-07-05)
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.7.1-next.3...v) (2026-07-02)


### Features

* **app:** Draw canvas — bounded zoom, reference images, pen colours ([#30](https://github.com/MyAvenCEO/avenOS/issues/30)) ([15f7c3c](https://github.com/MyAvenCEO/avenOS/commit/15f7c3c74cfddcd310d7a3f571ca48f6ba71eef7))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.7.1-next.2...v) (2026-07-01)


### Bug Fixes

* **app:** move the /draw scratchpad into the mainnet (Alberobello) shell ([#29](https://github.com/MyAvenCEO/avenOS/issues/29)) ([632dd30](https://github.com/MyAvenCEO/avenOS/commit/632dd3040375954a087bf4d955b6b31ffbd5eba1))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.7.1-next.1...v) (2026-07-01)


### Features

* **app:** Apple Pencil scratchpad — a /draw main (in-memory web canvas) ([#28](https://github.com/MyAvenCEO/avenOS/issues/28)) ([3d7ec1a](https://github.com/MyAvenCEO/avenOS/commit/3d7ec1a0a40d4ec2f47fa8e5a9958cfe5a6916ee))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.6.23-next.1...v) (2026-07-01)
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.6.22-next.7...v) (2026-06-23)
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.6.22-next.6...v) (2026-06-22)


### Bug Fixes

* **ci:** bake the full -next.N version into mac/ios builds for the Profile ([#24](https://github.com/MyAvenCEO/avenOS/issues/24)) ([b8ea59c](https://github.com/MyAvenCEO/avenOS/commit/b8ea59c5c88b24bb8a8c9ef29a4d0bc11010624e))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.6.22-next.5...v) (2026-06-22)


### Features

* **billing:** metadata.tier product discovery + full app version in Profile ([#22](https://github.com/MyAvenCEO/avenOS/issues/22)) ([864bc6d](https://github.com/MyAvenCEO/avenOS/commit/864bc6df3ef8069a1c3bd6b6ed0dd73968e0e026))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.6.22-next.4...v) (2026-06-22)


### Bug Fixes

* **billing:** next checkout via metadata.tier product discovery + full version in UI ([#21](https://github.com/MyAvenCEO/avenOS/issues/21)) ([6192310](https://github.com/MyAvenCEO/avenOS/commit/6192310fd9f96dfc4dfcc978d58c6abb353f4388))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.6.22-next.3...v) (2026-06-22)


### Features

* **app:** profile app-version row + system-browser desktop checkout (0061) ([#20](https://github.com/MyAvenCEO/avenOS/issues/20)) ([6e2d5ad](https://github.com/MyAvenCEO/avenOS/commit/6e2d5ad326d354c76d9f99df71a90d30d0edfd56))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.6.22-next.2...v) (2026-06-22)


### Bug Fixes

* **billing:** ignore non-http(s) returnUrl so the desktop checkout works ([#19](https://github.com/MyAvenCEO/avenOS/issues/19)) ([4ae53a6](https://github.com/MyAvenCEO/avenOS/commit/4ae53a6317df3c30b026e77dbe1e1188f998b784))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.6.22-next.1...v) (2026-06-22)


### Bug Fixes

* **betterauth:** include skills workspace in the docker prune so @avenos/skills resolves ([#18](https://github.com/MyAvenCEO/avenOS/issues/18)) ([3a49187](https://github.com/MyAvenCEO/avenOS/commit/3a491879b7a25894562cd216b8910d09f2bedcc1))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.6.20-next.4...v) (2026-06-22)


### Features

* composer site generator + tigris publish, voice transcription, inbound mail (0056-0060) ([467198d](https://github.com/MyAvenCEO/avenOS/commit/467198d555a27dd255362df2a13985a1faf00d43))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.6.20-next.3...v) (2026-06-20)


### Features

* **mainnet:** passkey PRF probe + AASA domain anchor + polar billing merge ([49264af](https://github.com/MyAvenCEO/avenOS/commit/49264af428184e8aa78db427fe6f51797349a78b))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.6.20-next.2...v) (2026-06-20)


### Bug Fixes

* **ios:** use dedicated iOS Google OAuth client (+ server multi-audience) ([347f4a5](https://github.com/MyAvenCEO/avenOS/commit/347f4a55334e8f8ce1f218682f74900299bac6d6))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.6.20-next.1...v) (2026-06-20)


### Bug Fixes

* **ios:** register Google reversed-client-ID URL scheme in Info.plist ([586956f](https://github.com/MyAvenCEO/avenOS/commit/586956f20b07f8887ab0ab31efb29ec95235a896))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.6.19-next.8...v) (2026-06-20)


### Bug Fixes

* **ios:** bake the Google Desktop client into the iOS binary ([d58c230](https://github.com/MyAvenCEO/avenOS/commit/d58c230ff45cbeb894a641b5764183668104cc5b))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.6.19-next.7...v) (2026-06-19)
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.6.19-next.6...v) (2026-06-19)
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.6.19-next.5...v) (2026-06-19)


### Bug Fixes

* **app:** grant microphone entitlement so voice transcription works (MAS) ([f22a9fd](https://github.com/MyAvenCEO/avenOS/commit/f22a9fddba2bc43b407fed6a80dc3890a4eec1f9))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.6.19-next.4...v) (2026-06-19)


### Features

* **app:** in-app "Copy debug logs" + capture fetch/error failures ([09fc808](https://github.com/MyAvenCEO/avenOS/commit/09fc80826fc4881ce4ac407ebc719a7e9b3db1d7))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.6.19-next.3...v) (2026-06-19)


### Bug Fixes

* **app:** allow the auth API in the CSP connect-src (fixes "Load failed") ([f9e772a](https://github.com/MyAvenCEO/avenOS/commit/f9e772af0d18bc60e8f75bb8ce5e69a1900f2e10))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.6.19-next.2...v) (2026-06-19)


### Bug Fixes

* **app:** auth base-url fallback + sign-in diagnostics ([53289ee](https://github.com/MyAvenCEO/avenOS/commit/53289ee2ace256f75c84b1de5011f8bb12d65f7b))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.6.19-next.1...v) (2026-06-19)


### Bug Fixes

* **app:** move .env.production into Vite's envDir (app/) so the API URL bakes ([be1a6cc](https://github.com/MyAvenCEO/avenOS/commit/be1a6cc3bcaa33918ae7ed0add852fa024584555))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.6.1-next.32...v) (2026-06-19)
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.6.1-next.31...v) (2026-06-19)


### Bug Fixes

* **app:** default production builds to the deployed auth API (.env.production) ([f57217b](https://github.com/MyAvenCEO/avenOS/commit/f57217b73b52f0abc6a070503982233885cd439e))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.6.1-next.30...v) (2026-06-19)


### Bug Fixes

* **app:** bake Google OAuth client into shipped builds (compile-time) ([fd16f31](https://github.com/MyAvenCEO/avenOS/commit/fd16f315888c23175b2f5ecde04bf0e2692b8409))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.6.1-next.29...v) (2026-06-19)
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.6.1-next.28...v) (2026-06-19)
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.6.1-next.27...v) (2026-06-19)
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.6.1-next.26...v) (2026-06-19)
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.6.1-next.25...v) (2026-06-19)
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.6.1-next.24...v) (2026-06-19)
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.6.1-next.23...v) (2026-06-19)


### Bug Fixes

* **vibes:** todos row gap targets the $each wrapper div ([b5e6eaf](https://github.com/MyAvenCEO/avenOS/commit/b5e6eafee81728865fec7533370f2c43792bd017))


### Features

* **mainnet:** admin as a left-nav screen, identity in nav, no nav divider ([1df5c88](https://github.com/MyAvenCEO/avenOS/commit/1df5c881bfb8f604218505c5555303fe8a239bf4))
* **mainnet:** Schemas + DB nav tabs (schema viewer + data tables) ([4bbe1ea](https://github.com/MyAvenCEO/avenOS/commit/4bbe1ea697a5e1eefa5356970257766efdfd250e))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.6.1-next.22...v) (2026-06-19)


### Bug Fixes

* **betterauth:** non-blocking Polar customer link + polarLinked flag ([2edd57b](https://github.com/MyAvenCEO/avenOS/commit/2edd57b342ed1d614ce1495636e09a8847abf717))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.6.1-next.21...v) (2026-06-19)


### Features

* **betterauth:** self-bootstrap schema on startup (fresh DB just works) ([99d7e25](https://github.com/MyAvenCEO/avenOS/commit/99d7e2533af079fdcb2d5044165bb6ba47a56739))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.6.1-next.20...v) (2026-06-19)


### Features

* **betterauth:** auto-promote the first signup to admin (first user only) ([07b2ff2](https://github.com/MyAvenCEO/avenOS/commit/07b2ff21cd5abab75a4ee3f08a3d921b0a5b9b01))
* **mainnet:** drop chat title + hardcoded TodosCard; compact todos vibe styling ([dcbd518](https://github.com/MyAvenCEO/avenOS/commit/dcbd518a001156e83dc31d46199cbb5c8bfe2029))
* **mainnet:** flow vibe cards inline per request instead of a pinned card ([27ecbb1](https://github.com/MyAvenCEO/avenOS/commit/27ecbb16c486f0b6162c74f2ce74423a1961b8ad))
* **mainnet:** persist a vibe marker so cards survive session reload ([c2af0cf](https://github.com/MyAvenCEO/avenOS/commit/c2af0cf5bbc4c9bc82a56bcfdc73ceaaf18875dc))
* **mainnet:** show weekly credits-left in top nav, drop the usage card ([ba2c9c1](https://github.com/MyAvenCEO/avenOS/commit/ba2c9c1b09c015ee448c3f45ce948180474b58d8))
* **mainnet:** unified TodosVibe in both chat stream + Vibes tab; bigger row gap ([a044ce8](https://github.com/MyAvenCEO/avenOS/commit/a044ce8e9ffa2d6ea03443bc896754eced143445))
* **mainnet:** unify nav (Admin/Log out on the Chat|Vibes line) + Vibes select rail ([739c2b0](https://github.com/MyAvenCEO/avenOS/commit/739c2b01f4f8709c8e58c0419cbc312a7c28a336))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.6.1-next.19...v) (2026-06-19)


### Features

* **ai:** LLM tool-calling CRUD on /api/data via a streaming tool loop ([5b0c807](https://github.com/MyAvenCEO/avenOS/commit/5b0c807f93406f970895374912efeddd82622ec3))
* **aven-vibes:** standalone vibes lib (engine + todos vibe) copied from aven-ui ([ceb1177](https://github.com/MyAvenCEO/avenOS/commit/ceb1177d27c57753c953363f510523edbbab6e88))
* **data:** generic schema-driven user data store + todos example card ([873038a](https://github.com/MyAvenCEO/avenOS/commit/873038aacd4f161cdb40d5c56fc36572e65e1df4))
* **mainnet:** Chat | Vibes nav + Vibes view (todos vibe wired to /api/data) ([ddbe349](https://github.com/MyAvenCEO/avenOS/commit/ddbe349431f20a735a40976360a8473e57074954))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.6.1-next.18...v) (2026-06-19)
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.6.1-next.17...v) (2026-06-19)


### Bug Fixes

* **auth:** expose set-auth-token via CORS so the Tauri app keeps its session ([aa8720a](https://github.com/MyAvenCEO/avenOS/commit/aa8720a3b90330673fd11897adfcf3efc5405c48))


### Features

* **admin:** genesis admin via Neon, admin UI manages other users' roles ([b696e6b](https://github.com/MyAvenCEO/avenOS/commit/b696e6b8dcfa4c8f24bb7c4c88a5e26da8458179))
* **app:** back-to-Select-Network link on both network entry screens ([5aa12bb](https://github.com/MyAvenCEO/avenOS/commit/5aa12bb4ffca16476604662deda92621d1e96173))
* **app:** Select Network intro gates testnet vs mainnet ([96326d5](https://github.com/MyAvenCEO/avenOS/commit/96326d58b8d953a0f72d5a66b1bf33908cc06033))
* **auth:** native Tauri Google sign-in (idToken + bearer) ([2323271](https://github.com/MyAvenCEO/avenOS/commit/2323271eab458879775351f575838dbf5faf9d83))
* **betterauth:** avenCITY tier + $3/week hard AI credit cap ([2fe07ae](https://github.com/MyAvenCEO/avenOS/commit/2fe07ae9daedcfe365e70b4a817e25090dca119b))
* **betterauth:** native Google sign-in verified end-to-end in the Tauri app ([6a1a58b](https://github.com/MyAvenCEO/avenOS/commit/6a1a58b1107d66bed716380cde19688cfd3df7e3))
* **betterauth:** per-user token usage tracking + pricing + usage card ([4f1db64](https://github.com/MyAvenCEO/avenOS/commit/4f1db64c690ae07747b1649097a60f620c26c665))
* **betterauth:** persist AI chat sessions + messages per user ([0456e29](https://github.com/MyAvenCEO/avenOS/commit/0456e29bff269d5b50e7fa6cee7fc6c61599ec40))
* **betterauth:** roles + admin (slice 1 of board 0052) ([84746f6](https://github.com/MyAvenCEO/avenOS/commit/84746f624925cf70c1eb4c19bfc11029489ce21a))
* **betterauth:** self-hosted Better Auth gates the mainnet chat with Google ([8530ee7](https://github.com/MyAvenCEO/avenOS/commit/8530ee7c04ff4d9eafc12091b6a7c10e27f64d13))
* **betterauth:** standalone server + Polar account link ([7e580d9](https://github.com/MyAvenCEO/avenOS/commit/7e580d99329206581ffefe955db0a4043e8908b3))
* **billing:** display credits as MINDS (1 USD = 10 MINDS); avenCITY allowance = half the tier price ([726d390](https://github.com/MyAvenCEO/avenOS/commit/726d390c02eaac8a5761550fef867b90c3f720e4))
* **billing:** show '<0.01 MINDS' for tiny non-zero amounts instead of rounding to 0 ([2cf52a0](https://github.com/MyAvenCEO/avenOS/commit/2cf52a081f6d444e291da9683309b9d9ce6fbfc3))
* **mainnet:** authenticated Tinfoil AI proxy with streaming ([d8eb623](https://github.com/MyAvenCEO/avenOS/commit/d8eb6238adcf11fb7e58c34b65b3d3824808c0c7))
* **mainnet:** left session switcher to browse + select conversations ([dc1a2ae](https://github.com/MyAvenCEO/avenOS/commit/dc1a2aeb193717766dff631e10d1b2804c02e932))
* **mainnet:** log out button returns to Select Network ([6550402](https://github.com/MyAvenCEO/avenOS/commit/65504023e7fc3cb30a70754430a8859f28725d5f))
* **mainnet:** surface voice transcription errors in the mocked chat ([ce19c2e](https://github.com/MyAvenCEO/avenOS/commit/ce19c2ecbb7b6b41ce4d038c3ec0c09aabcf0739))
* **mainnet:** usage card shows MINDS only (drop token counts); clearer no-reply msg ([fc367d8](https://github.com/MyAvenCEO/avenOS/commit/fc367d80f453cbd1d10f23078253acca2f5e5bf6))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.6.1-next.16...v) (2026-06-15)


### Features

* **video-edit:** Day 1 — Birth typewriter short (avenMAIA) + companion asset ([9335a40](https://github.com/MyAvenCEO/avenOS/commit/9335a40a79f9410a18b4236bc458c5915815cf0a))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.6.1-next.15...v) (2026-06-15)
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.6.1-next.14...v) (2026-06-14)


### Bug Fixes

* **aven-caps:** update cap_report_reflects_biscuit_grants to raw-facts API ([581236b](https://github.com/MyAvenCEO/avenOS/commit/581236b82bf027fd0e19e9f2fea8713ba45346fe))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.6.1-next.13...v) (2026-06-14)


### Bug Fixes

* **ios:** select latest Xcode (iOS 26 SDK) — App Store rejects 18.5-SDK builds ([95cf2ca](https://github.com/MyAvenCEO/avenOS/commit/95cf2ca488a43f9caf6208a47bda1a2654bdae58))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.6.1-next.12...v) (2026-06-14)


### Bug Fixes

* **ios:** import Apple Distribution cert into a default keychain for exportArchive ([2b90b2f](https://github.com/MyAvenCEO/avenOS/commit/2b90b2f72c3d633bc9c6c2ef9731348c5e0c79b8))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.6.1-next.11...v) (2026-06-14)


### Bug Fixes

* **ios:** build sherpa-onnx iOS static libs in CI (+ cache) for on-device STT ([bbdf0ec](https://github.com/MyAvenCEO/avenOS/commit/bbdf0ec366b56fa13335b452ff654d9fdd7bcd30))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.6.1-next.10...v) (2026-06-14)


### Bug Fixes

* **ci:** valid YAML (colon-space in step name broke it) + restore unified CalVer ([b09a83c](https://github.com/MyAvenCEO/avenOS/commit/b09a83c3778a8362c36ebc75e9694ddc401ca5f9))
* **ios:** fetch onnxruntime dylib before build (satisfies the bundled resource) ([d4b5471](https://github.com/MyAvenCEO/avenOS/commit/d4b547145412e2823d11c9011cca0aa2fa0f1d69))
* **relay:** reset Rust crate versions to 0.0.1 on next (stop sprite cache churn) ([522ec7e](https://github.com/MyAvenCEO/avenOS/commit/522ec7e53f29dba138fad658dd12653ce98006c7))
* **release:** stop stamping Rust crate versions — only package.json + tauri.conf.json ([c552a2d](https://github.com/MyAvenCEO/avenOS/commit/c552a2d103c2cedea242fe4406c0e573f0bd44fa))


### Performance Improvements

* **ci:** cache Rust builds for mac + iOS jobs (Swatinem/rust-cache) ([aafde0e](https://github.com/MyAvenCEO/avenOS/commit/aafde0e2eb5204ae35ea53e28024c4fd96b99abc))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.6.1-next.9...v) (2026-06-14)


### Bug Fixes

* **ci:** install Pillow on the iOS runner (generate-ios-icons.py needs PIL) ([4db0fa8](https://github.com/MyAvenCEO/avenOS/commit/4db0fa83ee7232f9d9e8ec2f6f42c9c358eed4fd))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.6.1-next.8...v) (2026-06-14)


### Bug Fixes

* **0047:** on avenCEO, label the reader grant as TIER-0 (the network invite) ([1534c40](https://github.com/MyAvenCEO/avenOS/commit/1534c4071b8d0489ef057fbed6d32e4dc35cb01e))
* **caps:** revert the owns→admin WIRE-fact rename — it broke first-admin claim ([206bf1c](https://github.com/MyAvenCEO/avenOS/commit/206bf1c5024d8aa37a45d305d9d2da1baf761a0d))


### Features

* **ci:** build iOS app + upload to TestFlight on each next release ([9ecd684](https://github.com/MyAvenCEO/avenOS/commit/9ecd684dfefd8c9596aaa270f684b68000d464af))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.6.1-next.7...v) (2026-06-14)


### Bug Fixes

* **0047:** drop the redundant quick-relay button + orphaned i18n (RELAY role is the one manual path) ([4c8cde2](https://github.com/MyAvenCEO/avenOS/commit/4c8cde283bce711f86a51174daa65d2a44e6c1e8))
* **release:** stamp internal crate dep requirements with the unified version ([1a8e444](https://github.com/MyAvenCEO/avenOS/commit/1a8e444e16132e0a75359989b9e2f3e47dded33f))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.6.1-next.6...v) (2026-06-14)


### Bug Fixes

* **0047:** relabel the quick-relay button to RELAY vocabulary (last sync-word smear) ([f44d32b](https://github.com/MyAvenCEO/avenOS/commit/f44d32b0244372b635338562a1c0870ff028ad23))


### Features

* **ci:** build macOS app + upload to TestFlight on each next release ([ab8cd01](https://github.com/MyAvenCEO/avenOS/commit/ab8cd0142ce80ccdc989a3a21f36ea9c86026241))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.6.1-next.5...v) (2026-06-14)


### Features

* **relay:** enforce AVEN_SIGNER_SECRET on every deploy without wiping data ([dadf091](https://github.com/MyAvenCEO/avenOS/commit/dadf09160bca814a1d8c31f4c97972ecc0e96c59))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.6.1-next.4...v) (2026-06-14)


### Bug Fixes

* **ci:** use singular SPRITE_API_KEY env secret name ([9eb914e](https://github.com/MyAvenCEO/avenOS/commit/9eb914e713b2a16b2e9c2aad7de3de91cbf2c9e6))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.6.1-next.3...v) (2026-06-14)


### Bug Fixes

* **ci:** deploy-relay uses the next Environment + correct SPRITES_API_KEY name ([728fb0e](https://github.com/MyAvenCEO/avenOS/commit/728fb0e54a00a41e7f6dfbb5d64fb368c2732b66))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.6.1-next.2...v) (2026-06-14)


### Bug Fixes

* **0037:** re-project owner into the public/IPC row shape (UI read row.owner) ([5f8d6c3](https://github.com/MyAvenCEO/avenOS/commit/5f8d6c35ad10754b97a68440f27f2327a32a0f53))
* **0037:** signers rows always belong to a SAFE — defer when none exists ([79bf4d8](https://github.com/MyAvenCEO/avenOS/commit/79bf4d891f295231b894e046866845a85a392699))
* **release:** push the tag explicitly — --follow-tags skips lightweight tags ([c7e447d](https://github.com/MyAvenCEO/avenOS/commit/c7e447daaacd5d4962726a0b9749b91cb64be555))


### Features

* **0037 Stage 2a:** make owner_scoped a declarative flag (authoritative) ([4e976f7](https://github.com/MyAvenCEO/avenOS/commit/4e976f761b7d4c35f70937c1f6663c671557239b))
* **0037:** install OwnerBinder on every peer (aven-node + app) ([4981694](https://github.com/MyAvenCEO/avenOS/commit/49816947268640da94279fea448ce517966459a3))
* **aven-db 0037:** owner-binding as a per-peer authoring invariant ([7bba627](https://github.com/MyAvenCEO/avenOS/commit/7bba6272e0511a75c4e30a131caf4f2faf7e5eed))
* **ci:** deploy aven-node relay to its Sprite on each next release ([aea4fb9](https://github.com/MyAvenCEO/avenOS/commit/aea4fb9cb30d9db0a3bbc725895173b6873a7645))
* **maia-city:** HEARTS economy — per-tick mint ledger + HUD ([7ce8d1c](https://github.com/MyAvenCEO/avenOS/commit/7ce8d1c29d44ee53c4b62b7eee1556a41f5f353d))
# [](https://github.com/MyAvenCEO/avenOS/compare/v26.6.1-next.1...v) (2026-06-14)


### Bug Fixes

* **release:** push the tag explicitly — --follow-tags skips lightweight tags ([7e46305](https://github.com/MyAvenCEO/avenOS/commit/7e46305c0ad8a42803f59016868656d12d2fef37))
#  (2026-06-14)


### Bug Fixes

* **app:** allow Vite to serve hoisted node_modules from a git worktree ([ec60a33](https://github.com/MyAvenCEO/avenOS/commit/ec60a33e887071e598b238f6709ac3f53c353dcf))
* **app:** handle groove Value::Vector / ColumnType::Vector (non-exhaustive matches) ([67a8f02](https://github.com/MyAvenCEO/avenOS/commit/67a8f020b7584b6e9b9752529706f19b479ca587))
* **app:** register aven-board/aven-city as Tailwind [@source](https://github.com/source) ([21bcbb4](https://github.com/MyAvenCEO/avenOS/commit/21bcbb4d34e48b7ad8b01036a1873db5179a6751))
* **asr:** patiently wait on shared-cache lock so 2-instance dev harness coexists ([163fa51](https://github.com/MyAvenCEO/avenOS/commit/163fa515bfe9f6b17a6580ed088b0ea4990279f5))
* **asr:** robust download progress + start/stop toggle on Models page ([3494de9](https://github.com/MyAvenCEO/avenOS/commit/3494de9d7bc03f10aa3c8b4a55976e3ccecc903e))
* **asr:** skip duplicate weight format — halve Voxtral download (~17GB → ~9GB) ([5f464a5](https://github.com/MyAvenCEO/avenOS/commit/5f464a5fa8c55656578f7c30fe3d64ef0e9ce524))
* **asr:** tolerate blob-lock contention on download; don't stack downloads ([ceed40d](https://github.com/MyAvenCEO/avenOS/commit/ceed40ddc4adc2fc61be281c2de53728cde76e8a))
* **aven-ai 0031:** fixed-length embed inputs — stop the RotaryEmbedding crash ([c426204](https://github.com/MyAvenCEO/avenOS/commit/c426204a5ecc1d4fc87db33558622bf993a049bf))
* **aven-ai/llama:** use non-deprecated token_to_piece_bytes for detok ([a37c087](https://github.com/MyAvenCEO/avenOS/commit/a37c0871bf1277c6efee6bd9d1f73d3cb4dd89f4))
* **aven-ai/llm:** allocate empty caches via DynTensor::new (ort from_array rejects 0-dims) ([2b1c48d](https://github.com/MyAvenCEO/avenOS/commit/2b1c48d62c7f1e618abd83b5bafff01c5ab8c135)), closes [#1](https://github.com/MyAvenCEO/avenOS/issues/1) [#3](https://github.com/MyAvenCEO/avenOS/issues/3)
* **aven-ai/llm:** empty KV-cache batch axis must be 1, not 0 (cache f16 error) ([58cc080](https://github.com/MyAvenCEO/avenOS/commit/58cc08009a44f12b4b775fb397d1bcc12ddb2bf5)), closes [#0](https://github.com/MyAvenCEO/avenOS/issues/0) [#1](https://github.com/MyAvenCEO/avenOS/issues/1)
* **aven-ai/llm:** feed only model-declared inputs (LFM2 has no position_ids) ([f3dbef3](https://github.com/MyAvenCEO/avenOS/commit/f3dbef37b6aff33030811c24aae472484dc40d1c))
* **aven-ai/llm:** zero-fill step-0 caches to match shape (hybrid conv/SSM state) ([9df3059](https://github.com/MyAvenCEO/avenOS/commit/9df3059bbc34affa1866e7b9ea8469419557a03d))
* **aven-auth:** accept standard multibase did:key (leading 'z') ([9aecd4f](https://github.com/MyAvenCEO/avenOS/commit/9aecd4fd27d33ee2e200d3eec88da8ac2a198088))
* **aven-auth:** CORS for cross-origin /invite calls from the Tauri webview ([0900705](https://github.com/MyAvenCEO/avenOS/commit/0900705c5f3875b6aa099861531081e2a8928384))
* **aven-board:** balance WorkItemDoc divs — drop stray </div> ([5767428](https://github.com/MyAvenCEO/avenOS/commit/57674281466431dfa3259e62e54d03f305e1a042))
* **aven-caps:** handle groove ColumnType::Vector / Value::Vector (non-exhaustive matches) ([4797d8f](https://github.com/MyAvenCEO/avenOS/commit/4797d8fb2d9ced4cfcd7527c676ebea795758697))
* **aven-ceo:** workspace nav, Jazz vault secrets, and local dev ([e3c06b4](https://github.com/MyAvenCEO/avenOS/commit/e3c06b40c4937719786bcc92e5d8e5bed7df225b))
* **aven-db:** raise BYTEA cap 1 MiB → 24 MiB so file uploads fit ([6abe2cc](https://github.com/MyAvenCEO/avenOS/commit/6abe2cc623e7502febbb9597cd6e03b93ad2be67))
* **aven-db:** use a valid Ed25519 key in did_key roundtrip test ([d03d058](https://github.com/MyAvenCEO/avenOS/commit/d03d058e841ede642f951e7923a5f816a603a5f5))
* **aven-node:** seal avenCEO genesis/issuer cells so the hardened client accepts them ([d43ddea](https://github.com/MyAvenCEO/avenOS/commit/d43ddeadc924cc3f1475c0872fee05def84e2cd3))
* **aven-node:** sign server-authored rows so they pass the EditSignature apply gate ([846c3a0](https://github.com/MyAvenCEO/avenOS/commit/846c3a088a7d28e3a3f293c8c1ec50aba22f6ca9))
* **aven-node:** unseal avenCEO genesis/issuer on read (seal/unseal symmetry) ([61e3765](https://github.com/MyAvenCEO/avenOS/commit/61e3765a50841588a4bddaf60d2ea69facfe02cb))
* **aven-node:** wire the admission Roster/classify_peer API — kill 3 dead-code warnings ([0f8b107](https://github.com/MyAvenCEO/avenOS/commit/0f8b107a8a60bdcc75ebb9f69f47ae03c591f3e0))
* **aven-skills:** unique line key (ID Bezahlposition) to stop each_key_duplicate crash ([36b0a38](https://github.com/MyAvenCEO/avenOS/commit/36b0a380f5ceca29065ca6bea2f704e75d6105b3))
* **avenCEO:** idempotent claim for the owner; clearer wording ([866472e](https://github.com/MyAvenCEO/avenOS/commit/866472e46ef6cf0cfa977791f3c8037f5534dbc3))
* **avenCEO:** owner roster row + auto-publish from identity; wire granular caps ([446766b](https://github.com/MyAvenCEO/avenOS/commit/446766bf4fab9104a440ee1a3dd66656e8be29a4))
* **avenVICTORIO:** full-width detail views with slight padding (drop max-w-3xl) ([7811d4b](https://github.com/MyAvenCEO/avenOS/commit/7811d4b8a17a76b56cc1100086658b94cfb63c5a))
* **brain 0029 M3:** debug export writes a real file + persist activity timeline ([281c2e7](https://github.com/MyAvenCEO/avenOS/commit/281c2e70cab413d4edfbee28c46308ad777481f0))
* **brain:** 3 dreaming bugs — actor unblocked, enrich loop stopped, entities promoted ([5e70a7d](https://github.com/MyAvenCEO/avenOS/commit/5e70a7d0605fb243e4c85b3884cc7c627243bc67))
* **brain:** align manifest `memories` column order to brain_schema — storage works ([43134b0](https://github.com/MyAvenCEO/avenOS/commit/43134b01e7933de314e7c618e84fbc76af54b4d5))
* **brain:** cap per-memory graph writes so a huge paste can't freeze avenDB ([05b4f97](https://github.com/MyAvenCEO/avenOS/commit/05b4f97dfdd97454445859a147a20ab81da44a70))
* **brain:** debug export lands in <Documents>/avenOS/debug/ ([4b9ea21](https://github.com/MyAvenCEO/avenOS/commit/4b9ea211b443d293f1fb76f4db61cbe05d28c5c7))
* **brain:** dreaming log is continuous — accumulates across turns, not reset ([c3caa92](https://github.com/MyAvenCEO/avenOS/commit/c3caa921cbb34d747db9bd686db95b963759c9bd))
* **brain:** make EmbeddingGemma actually download + load, and enforce it ([685df4d](https://github.com/MyAvenCEO/avenOS/commit/685df4d01aec23f9abee9b1cc8ca1a0209149488))
* **brain:** per-memory enrich in stepped dream so the log streams + yields ([13ae976](https://github.com/MyAvenCEO/avenOS/commit/13ae976d139e5453c75fcd957559b6e9eb76e10d))
* **brain:** unblock long-paste ingest + fix embedder download mkdir ([8103099](https://github.com/MyAvenCEO/avenOS/commit/8103099daa0b557be97853a221e45609ceea9e31))
* **brand-design:** match button shadows to the toggle (master reference) ([41efb25](https://github.com/MyAvenCEO/avenOS/commit/41efb2520c154fae7f1a609c22cdd45c0a240ceb))
* **brand-design:** revert pressed inner shadow + readable bg-variant idle ink ([ab4f273](https://github.com/MyAvenCEO/avenOS/commit/ab4f273beb41b53dcc41e9152a43c05206422cf0))
* **brand-design:** text uses icon's drop-shadow elevation (no heavy bottom shadow) ([a0a8f3a](https://github.com/MyAvenCEO/avenOS/commit/a0a8f3a783efbce63754bfc0cea92913ccb086f9))
* **brand-design:** tone-on-tone idle ink + softer active inner shadow ([e7f77f0](https://github.com/MyAvenCEO/avenOS/commit/e7f77f06032913fc10e3641a250d9c90b0b17c49))
* **caps_ipc:** apply remaining SAFE renames to replicate_add and ensure_aven_ceo_owner_row ([fe8ca04](https://github.com/MyAvenCEO/avenOS/commit/fe8ca04a69f8d7dd94f48b544b1ff4bee779b3ca))
* **caps_ipc:** finish remaining vault.identities and signer_did renames ([05dd6e2](https://github.com/MyAvenCEO/avenOS/commit/05dd6e2bd45ebe37b1066d842dcce26f453a4994))
* **caps:** forward rows to delegated readers — may_hold must honor Read ([016dc4c](https://github.com/MyAvenCEO/avenOS/commit/016dc4c7982f33b543ad1f6ca7a3a1ef8a08bdfc))
* **caps:** gated, recipient-scoped keyshare delivery — grantee always gets its DEK ([c45b810](https://github.com/MyAvenCEO/avenOS/commit/c45b810d6cc85e32dd63553d00895af0f9123dd4))
* **caps:** heal the member→revoke→regrant poison (keyshare + revoke lifecycle) ([80455a1](https://github.com/MyAvenCEO/avenOS/commit/80455a115990892b3c441fe33ae224b1bd48eba7))
* **composer:** recover submit/cancel buttons + release-to-submit in hold-to-record ([4fa8e59](https://github.com/MyAvenCEO/avenOS/commit/4fa8e59e1fa8b7540cdca54d5436839ea9ec86e0))
* **db-viewer:** list every avenDB schema table, drop the hand-maintained allowlist ([cacd378](https://github.com/MyAvenCEO/avenOS/commit/cacd378fb7f8d573837a2fa73f942d6239049242))
* **db:** sealing policy only covers sealable storage; compact vector cells in explorer ([3460b29](https://github.com/MyAvenCEO/avenOS/commit/3460b29f03330ca94519fdc1815edbe03c45f7f8))
* **deploy:** correct dash syntax in detached relay build launch ([8e234ea](https://github.com/MyAvenCEO/avenOS/commit/8e234eab32b611c88f4c91b849c8db7c28f1e49a))
* **deploy:** rename deploy script to match deploy:server:sprite npm ref ([6e243d3](https://github.com/MyAvenCEO/avenOS/commit/6e243d3769a5c7ccf951aa65b03e64618fa2fc0c))
* **design:** consolidate vibe cards — solid borders + unified width ([dc2be82](https://github.com/MyAvenCEO/avenOS/commit/dc2be8294ad32e5becd1ed94e364b309342e5a48))
* **design:** lighten title/emphasis weights for Chillax ([8f9c70b](https://github.com/MyAvenCEO/avenOS/commit/8f9c70b8bc62d08ce65bc97979445eda29f81806))
* finish the signer/safes rename in main's split files — app crate now compiles ([6fdf809](https://github.com/MyAvenCEO/avenOS/commit/6fdf809f0c9e0726a02517015d85ab8074e2943d))
* **hydrate:** legacy AAD fallback for genesis/issuer cells sealed under old 'identities' table name ([b7a42b1](https://github.com/MyAvenCEO/avenOS/commit/b7a42b145b0029c21afc6f3b528b1c700d028f9c))
* **identities:** inline create input — Tauri webview blocks window.prompt() ([1d61f39](https://github.com/MyAvenCEO/avenOS/commit/1d61f39e4819e8420087316d6c4b837843b34679))
* **identities:** stop stamping role words as peer device names ([db6047b](https://github.com/MyAvenCEO/avenOS/commit/db6047b8605198e7184dbf6d3db554c9583f3617))
* **intent-ui:** hide HITL row during retrain typing; composer polish ([43abb81](https://github.com/MyAvenCEO/avenOS/commit/43abb81d3486baa58869fccdb2cd0aea27439874))
* **intent-ui:** HITL composer stability, textarea sizing, Archive next to Accept ([80fb8cc](https://github.com/MyAvenCEO/avenOS/commit/80fb8cc0d327329968528df165be8796fe3ec3c4))
* **invite gate:** membership requires an actual cap, not just a hydrated genesis ([01a478f](https://github.com/MyAvenCEO/avenOS/commit/01a478f313f61537782b2be6bd60e907720b8ad7))
* **ios release:** strip standalone onnxruntime dylib from iOS bundle before export ([596e9ee](https://github.com/MyAvenCEO/avenOS/commit/596e9eea2f79a885806a1874c2d6d6d6efb776fb))
* **ios/llama:** dedupe ggml archive member names so the staticlib bundle links ([e1e5e48](https://github.com/MyAvenCEO/avenOS/commit/e1e5e487aff337050830ca519bf3381481ac238d))
* **ios/llama:** global member-name dedupe across all llama archives + force visibility ([790ee65](https://github.com/MyAvenCEO/avenOS/commit/790ee657d10c3488168904dd91b72257f44d216f))
* **ios:** bake AVENOS_SERVER_WS_URL into the iOS build + log resolved sync URL ([4e6728a](https://github.com/MyAvenCEO/avenOS/commit/4e6728ac283d6adb2a5cd7986ad0fc794b1188ba))
* **ios:** link Accelerate for the llama.cpp/ggml CPU backend ([cf3d645](https://github.com/MyAvenCEO/avenOS/commit/cf3d645b43d6496ca3aca51c1615dc914a29e201))
* **ios:** link Accelerate via the Xcode project, not just a cargo directive ([415c4b4](https://github.com/MyAvenCEO/avenOS/commit/415c4b4e345bd3997378c31781fa8777ade6f63a))
* **ios:** never reach for the onnxruntime dylib on iOS (TTS is desktop-only) ([395ff19](https://github.com/MyAvenCEO/avenOS/commit/395ff190ad4c0081c687a0568fa1f409c5e149d5))
* **ios:** unblock iOS release — drop tinfoil from default, valid feature flags ([56d7916](https://github.com/MyAvenCEO/avenOS/commit/56d791689b4e7d0b507a8ad45be959ffe307fe42))
* **ios:** voice-input K.state crash + iOS audio/mic robustness ([b2fd57e](https://github.com/MyAvenCEO/avenOS/commit/b2fd57e06567976d1517fd261fd3b70bb3f46559))
* **jazz:** drop unused DID_KEY_ED25519_PREFIX re-export ([03e0b01](https://github.com/MyAvenCEO/avenOS/commit/03e0b01c8370bb44310ea9c316e2a9f3b162e8fe))
* **jazz:** force-publish sparks catalogue on vault-shell re-hydrate ([a64908d](https://github.com/MyAvenCEO/avenOS/commit/a64908d3969d8854da90b886d7fa7ea8b3632af7))
* **jazz:** open genesis/issuer with the aad_row_for coordinate in the UI publish path + human-SAFE signer-only DID guard ([fe345cb](https://github.com/MyAvenCEO/avenOS/commit/fe345cb85614e6e9956c70a943650279a1fe31c3))
* **jazz:** stamp Groove schema hash and lane in reconcile cache ([8e048e9](https://github.com/MyAvenCEO/avenOS/commit/8e048e95fc4ebe1a106f8326c96f5e69ec2cebe8))
* **jazz:** stop the idle vault-shell re-hydrate loop — gate on content change ([6190934](https://github.com/MyAvenCEO/avenOS/commit/61909344c82e09f25960ba9a2444e45991a3439d))
* **jazz:** vendor Groove snapshot and repair tips reload for local todo writes ([374432c](https://github.com/MyAvenCEO/avenOS/commit/374432c5032a60569dcb446c6e2c9df583cec7b7))
* **lint:** ignore .claude/worktrees in biome — nested root configs broke the gate ([b1029e1](https://github.com/MyAvenCEO/avenOS/commit/b1029e1b798cd2b0e2494cdf3533777b020d3653))
* **lint:** revert biome's blind unused-var renames used by Svelte templates ([d1e58a6](https://github.com/MyAvenCEO/avenOS/commit/d1e58a659092260e68307f2195c94164f31e0b20))
* **linux:** build releases with --features desktop-ai (not crippled defaults) ([0bfbc41](https://github.com/MyAvenCEO/avenOS/commit/0bfbc41caa69c5b053fd12303161270c8daff26c))
* **llm,tts:** chat template + German prompt + anti-loop sampling; streamed Speak ([5c31f4d](https://github.com/MyAvenCEO/avenOS/commit/5c31f4d61c18b11008bdeda7de1e85ff5f335e8e))
* **llm:** disable ggml-metal residency sets to stop SIGABRT on quit (macOS 26) ([7b8edae](https://github.com/MyAvenCEO/avenOS/commit/7b8edae122c924fa0edd5b8610ed86a0d75bf5e8))
* **llm:** docs-faithful tool prompt — drop prose guidance, add few-shot ([eb2da51](https://github.com/MyAvenCEO/avenOS/commit/eb2da5199ff083d2f8b039662f32aac84bfef639))
* **llm:** fuzzy todo matching + multi-target edit/delete ([cf22591](https://github.com/MyAvenCEO/avenOS/commit/cf2259178b52a8b04a0d87b6ccb570da8c34f6b1))
* **llm:** make navigate_pages actually route + real nav routes + tool-call chip ([db7e4ba](https://github.com/MyAvenCEO/avenOS/commit/db7e4baf04863053977febb72d95555fb4899725))
* **llm:** make on-device tool guidance tool-agnostic so create_todo fires ([d923a3a](https://github.com/MyAvenCEO/avenOS/commit/d923a3aaea7baeaace7d147b578b7cf0d2663969))
* **llm:** resilient resumable model download (HTTP Range) ([b55f70f](https://github.com/MyAvenCEO/avenOS/commit/b55f70fec3ae6b497929f50c6c7e20f8eebeca62))
* **llm:** size llama batch to the prompt, not a fixed 512 ([41432ee](https://github.com/MyAvenCEO/avenOS/commit/41432eea88f74916847720d963e8a7766a8dd60c))
* **llm:** split update_todo into single-purpose toggle_todo + rename_todo ([2ad7ec4](https://github.com/MyAvenCEO/avenOS/commit/2ad7ec46b77093d4c6ef8788ba8a76f3848b73a4))
* **llm:** stable download total via upfront HEAD (no 2.1→4.0 GB jump) ([12264b7](https://github.com/MyAvenCEO/avenOS/commit/12264b7a2a3518ed3342523fe52eed0a48d065da))
* **llm:** surface a failed tool call instead of hiding it behind respond ([3ae82fb](https://github.com/MyAvenCEO/avenOS/commit/3ae82fb5a71f91181e165e7797c2bc72552ab389))
* **llm:** switch to LFM2.5-1.2B-Instruct Q6_K so it fits fully on Metal ([d6a9d5d](https://github.com/MyAvenCEO/avenOS/commit/d6a9d5deb82a3bf008a511b9989c45fc94686e0c))
* **macos release:** re-sign onnxruntime dylib with distribution identity ([dc72330](https://github.com/MyAvenCEO/avenOS/commit/dc72330c43197d4070ffd3a96765887d6ca41c4c))
* **macos-appstore:** embed GENESIS_NETWORK_ID at compile time for TestFlight ([d210734](https://github.com/MyAvenCEO/avenOS/commit/d21073444ad05b5956bdc9e34e68e896180e1a5d))
* **macos-appstore:** load jazz schema from sandbox-safe paths ([e17abe8](https://github.com/MyAvenCEO/avenOS/commit/e17abe8352b14114af478287243e90ef5012c23e))
* **memory-worker:** replace non-existent fs/promises.exists with custom fileExists helper ([7a3bae0](https://github.com/MyAvenCEO/avenOS/commit/7a3bae0ca69b7de7a2d8e91a704744f50049588b))
* **merge-followups:** camel-case brain types, DB-viewer brain tables, surface brain-ingest errors ([8a249cd](https://github.com/MyAvenCEO/avenOS/commit/8a249cddb578df0ca5e4b294aac38319f869de69))
* **onboarding:** drop "change this later under Self → Preferences" hint ([0ed3675](https://github.com/MyAvenCEO/avenOS/commit/0ed36756780ad52f7910cdfb37e9416baff9d936))
* **onboarding:** key-derived vault slug + hide unavailable sign-in methods ([7d16ff1](https://github.com/MyAvenCEO/avenOS/commit/7d16ff10f5e65be28077334c451720739912e3e5))
* **ownership:** stamp the default/user-spark bootstrap rows ([5a1b1ec](https://github.com/MyAvenCEO/avenOS/commit/5a1b1ec97e37e77957603a1f961341314348d947))
* **peer,jazz:** make P2P spark sync actually deliver and unwrap ([89dad04](https://github.com/MyAvenCEO/avenOS/commit/89dad041f1c89fa62ed93cb864eab283d1ceaaa9))
* **peers:** Forget / Stop-sharing actually remove a peer; add re-add + UX ([024f089](https://github.com/MyAvenCEO/avenOS/commit/024f089c78f2d899a1d9347bc4b01eee92926e2a))
* **peers:** stop "Offline after grant"; move Invite into Settings ([6bfa518](https://github.com/MyAvenCEO/avenOS/commit/6bfa518350e3ae7dad0c52713761b6cffae0ac70))
* **privacy:** seal genesis/issuer RAW (not canonical-JSON) to match the hydrate + aven-node ([debbbae](https://github.com/MyAvenCEO/avenOS/commit/debbbae640f187edf473b61ceeaaf3163e8d7e1f))
* **privacy:** seal genesis/issuer/name on every identity write (private-by-default) ([32357f4](https://github.com/MyAvenCEO/avenOS/commit/32357f41f50d09275dfde547036b60089784f345))
* **privacy:** seal identity trust-root cells under the IDENTITY uuid, not the object id ([947df11](https://github.com/MyAvenCEO/avenOS/commit/947df113d898e87a6e5ea881c29c3f59f6c8f10f))
* **release:** wipe build/ before bundling — stop stale-asset generate_context! failure ([d65e736](https://github.com/MyAvenCEO/avenOS/commit/d65e73682d7619db12f0b8f5cc542bd9281b6641))
* **rename:** finish identities→safes table rename in main checkout + relay ([ef31f8a](https://github.com/MyAvenCEO/avenOS/commit/ef31f8a3badae8fc90d06bf9142ca254a4069a45))
* review pass — spark create path, safe_did stamping, avenCEO type parity ([90b2b00](https://github.com/MyAvenCEO/avenOS/commit/90b2b00f02470239e43f0a3a0041094e43bd3c0e))
* **revoke:** re-wrap rotated DEK to ALL keyshare-holders, not just admins ([ef8caef](https://github.com/MyAvenCEO/avenOS/commit/ef8caef7a8f13692464fa10c5896ca00f0ece71c))
* **revoke:** re-wrap rotated DEK to ALL keyshare-holders, not just admins ([b3de65d](https://github.com/MyAvenCEO/avenOS/commit/b3de65da8634d163284659a5f4a1777aa3954a88))
* **safes:** per-branch DENY diagnostics in verify_on_apply apply gate ([2c32b0e](https://github.com/MyAvenCEO/avenOS/commit/2c32b0e23cef26517bdc9859688e2917f1a0284d))
* **safes:** relay-sync controlled SAFEs from birth + backend-truth owner gate in Members UI ([d5afe1f](https://github.com/MyAvenCEO/avenOS/commit/d5afe1f0ce3cee6ba183b836bdc5fc47afa7918f))
* **safes:** self-healing keyshare reconcile after every grant + wrap logging ([bb5633b](https://github.com/MyAvenCEO/avenOS/commit/bb5633ba2d204eefcebd77ec17f7242fe7fef7d6))
* **sandbox:** allow the run_tool plugin command (was 'Command not found') ([9614d51](https://github.com/MyAvenCEO/avenOS/commit/9614d5103371459735cff19b5575f75dd3d34d4d))
* **schema-hash:** support the vector column type (brain embeddings) ([5540872](https://github.com/MyAvenCEO/avenOS/commit/554087205b9dfe5711920957e9336b8e87ef32b1))
* **schema:** drop broken pre-wipe upgrade snapshots — clean-baseline decision ([5f52766](https://github.com/MyAvenCEO/avenOS/commit/5f52766968687b1a01895aa55569c7fb724b961a))
* **schema:** messages.role as text, not enum ([ac356de](https://github.com/MyAvenCEO/avenOS/commit/ac356dea1c76bd21c16dfe8e09793e232a97e136))
* **schema:** register peers.spark_id migration (Jazz lens, no wipe) ([e6f0950](https://github.com/MyAvenCEO/avenOS/commit/e6f0950f4fb074aea6fd496e2b0f2d7e53b81a51))
* **security:** cap sync-frame allocation + test the biscuit ACL gate (S1, S2) ([9df5038](https://github.com/MyAvenCEO/avenOS/commit/9df50387d4dc3764da16d504048d8070007098a9))
* **security:** enable webview CSP + bound the QuickJS vibe sandbox (S3, S4) ([63e3c96](https://github.com/MyAvenCEO/avenOS/commit/63e3c96c60f7931c4869082edb0da3385c8463fe))
* **security:** restore private-by-default sealing dropped by the mod.rs-split merge ([1021cfb](https://github.com/MyAvenCEO/avenOS/commit/1021cfb4c6fe47105241caa2118518138ff8e280))
* **self,jazz:** bind each identity to its own DB folder; never block sign-in on TCP ([c0429dc](https://github.com/MyAvenCEO/avenOS/commit/c0429dc277267a03b3767c06c1b33d52d711f09f))
* **server:** match device network seed + store server as a peer identity ([3d7b3d0](https://github.com/MyAvenCEO/avenOS/commit/3d7b3d06e7e4722d52ee738d25d9e0f4a6d42287))
* **server:** re-announce frontier after avenCEO first-admin auto-grant ([0f1da09](https://github.com/MyAvenCEO/avenOS/commit/0f1da09b7c160eb142a7d7585dcde84c4d4ac7a3))
* **share:** grant form stuck disabled + input not cleared after granting ([e205c1b](https://github.com/MyAvenCEO/avenOS/commit/e205c1b408aefeb392821a46e60bd4f0def1e903))
* **shutdown:** close the exit-vs-RocksDB-open segfault race ([58c2dab](https://github.com/MyAvenCEO/avenOS/commit/58c2dab2eb4e182262acfae2a9ebe03ee2fc44b8))
* **sparks:** make admin roster reactive to synced biscuit changes ([e73b078](https://github.com/MyAvenCEO/avenOS/commit/e73b0782948d9cb60e251418ad005de4ee16364e))
* **sparks:** remove legacy avenCEO self-publish "Your profile" UI ([a2417a3](https://github.com/MyAvenCEO/avenOS/commit/a2417a3779f9e82adaeaebb1408599553c5c15ad))
* **sparks:** simplify members page to match layout container pattern ([7cef0ab](https://github.com/MyAvenCEO/avenOS/commit/7cef0ab72006321deb5490ef3a8235886e9cce44))
* **sparks:** simplify members page to match layout container pattern ([ee3c62d](https://github.com/MyAvenCEO/avenOS/commit/ee3c62d1d9be82193ccde3e993727ebf68943d15))
* **stories:** day 0001 — 42 languages ([03ba13f](https://github.com/MyAvenCEO/avenOS/commit/03ba13f7ce660153f59267093c88490937fb0636))
* **stories:** day 0001 — chat-only perception + Samuel's breakthrough conviction ([18032ef](https://github.com/MyAvenCEO/avenOS/commit/18032ef2e1bb935549d2abe5cfb5f0fc37b9c82d))
* **stt:** resume mic AudioContext so STT works after a tool-call navigation ([5c303f9](https://github.com/MyAvenCEO/avenOS/commit/5c303f9d1cd0605b78fc00b11637d18bae4e86c2))
* **sync:** announce to peers on local write — live (on-the-fly) sync ([e48fc1e](https://github.com/MyAvenCEO/avenOS/commit/e48fc1e1cea812eb48cf520eae2410f23ab0ac01))
* **sync:** detect dead relay link via WS keepalive ping + read timeout ([10b06ab](https://github.com/MyAvenCEO/avenOS/commit/10b06abde62fa2559683c92aaf61300b17194f7b))
* **sync:** drop dead load_current_batch_fate_from_storage after frontier swap ([54cf6f7](https://github.com/MyAvenCEO/avenOS/commit/54cf6f72cfb69720e17d4768683c11f5b26b992c))
* **sync:** enforce owner-binding system-wide (brain) + relay forwards blind (sync cap is client-side) ([3d8cb81](https://github.com/MyAvenCEO/avenOS/commit/3d8cb8196778016f51f1b66436bdd8c0b6d22ddf))
* **sync:** keep parents on signed visible rows so edit-sig verifies (admin grant) ([fef7f10](https://github.com/MyAvenCEO/avenOS/commit/fef7f1072373e14dec7fa914e7807c388218583f))
* **sync:** peer on_inbound hook reads table from payload metadata — live remote reactivity ([1764b3d](https://github.com/MyAvenCEO/avenOS/commit/1764b3d978f2a942ca8f824ed6355087f1142541))
* **sync:** re-announce to peers after a spark grant — data now ships ([4521702](https://github.com/MyAvenCEO/avenOS/commit/45217029f68f41bceaff492e64237bd23d825441))
* **sync:** revert app to dev-TCP; defer peeroxide to board; plan dev-TCP-first ([43d0d6b](https://github.com/MyAvenCEO/avenOS/commit/43d0d6b769f7e9d7027ecef7068beb51a01cf171))
* **sync:** run shell catch-up on peer connect — the missing trust bootstrap ([b2d1a2e](https://github.com/MyAvenCEO/avenOS/commit/b2d1a2e0b5fd9d0d95ad0703a7768df96f062ec4))
* **sync:** ship delete batches — include soft-deleted rows in the ACL spark map ([ac8a4da](https://github.com/MyAvenCEO/avenOS/commit/ac8a4da141ec9d915a0503fd2b926c5463d55df9))
* **talk:** collapsed composer FAB no longer blocks bottom message clicks ([62dad33](https://github.com/MyAvenCEO/avenOS/commit/62dad337214f32133a96413008cbc5f819951186))
* **talk:** pending agent bubble shows real model state, not a dead spinner ([eed4c1d](https://github.com/MyAvenCEO/avenOS/commit/eed4c1d83abed2fab9174b030a8e7fbeb1320a6a))
* **talk:** readable red Delete button + wire file-drop to the identity composer ([679705b](https://github.com/MyAvenCEO/avenOS/commit/679705b496afe484b25a05ed08bbb89e1731062a))
* **talk:** wire composer/panel/layout edits + lock the local-asr dep tree ([e12f0eb](https://github.com/MyAvenCEO/avenOS/commit/e12f0eb605f7ab497ebf838950374a18f2d7d05f))
* **tests:** adapt merged biscuit_resolver tests to the 6-arg edit-sig apply gate ([d3e327b](https://github.com/MyAvenCEO/avenOS/commit/d3e327b038b308c1d228c5f7a19f7283f70cc587))
* **tinfoil:** 60s timeout on chat — unblocks stuck 'Aven thinking' state ([a730fd8](https://github.com/MyAvenCEO/avenOS/commit/a730fd88a2e791b22aee6415dbc807f912923bbb))
* **tts:** real SVG icons for Speak — spinning loader while generating ([b419967](https://github.com/MyAvenCEO/avenOS/commit/b419967520d7f7b101401145a3e85926b9700f0e))
* **tts:** recover Speak after each play, quiet llama logs, play icon ([366816f](https://github.com/MyAvenCEO/avenOS/commit/366816f89fe55812a71e88ab65f1837c93a0e7e0))
* **tts:** smooth gap-free playback — buffer whole clip, play as one buffer ([07fce6e](https://github.com/MyAvenCEO/avenOS/commit/07fce6e0bc4559e6882fff348f55c3de0f09ac67))
* **ui:** Forget / Stop-sharing use inline confirm — native confirm() no-ops in Tauri ([3bc9636](https://github.com/MyAvenCEO/avenOS/commit/3bc963605ce6d586edb4448154724d503c324e30))
* **ui:** persist replication peer in access list; working clipboard; copy-DID ([efa652d](https://github.com/MyAvenCEO/avenOS/commit/efa652dc3693eeb324ea1bf37183a1ec788cf90e))
* **ui:** refresh mesh after grant so a new member's chip leaves "Connecting" ([7d964c0](https://github.com/MyAvenCEO/avenOS/commit/7d964c022e607683c00964e88e97b0dedeb4ab51))
* **ui:** remove gradient veil behind the intent composer button ([6a1a1f2](https://github.com/MyAvenCEO/avenOS/commit/6a1a1f21ef581ab9cc6ad23293d9551130085b00))
* **vault:** persist stronghold snapshot on every secret write ([e95af24](https://github.com/MyAvenCEO/avenOS/commit/e95af240ab70ccd9f17cea867ee1d8bba640f35c))
* **vibe-apps:** drop --border-radius-2xl from host styles, restore strict CSP ([9c7609e](https://github.com/MyAvenCEO/avenOS/commit/9c7609e7171c41aa39627bd9a7803c644f80ded8))
* **vibe-apps:** load ext-apps via parent origin + relax base-uri CSP ([49e0a6c](https://github.com/MyAvenCEO/avenOS/commit/49e0a6c6274c215d9520cd9b2ff75e98625c418c))
* **vibe-apps:** resolve Lade hang for Rechnung/Kontoauszug in sandbox ([b6f5bc4](https://github.com/MyAvenCEO/avenOS/commit/b6f5bc4d9b3e7fe3df46cc163429a852aa6cc9f0))
* **vite:** silence jazz-tools sourcemap warnOnce noise ([fc54542](https://github.com/MyAvenCEO/avenOS/commit/fc545424d11d57ba4e96272a1275be9c417d12cb))
* **voice:** auto-load the STT model and start recording on the first try ([e445e24](https://github.com/MyAvenCEO/avenOS/commit/e445e2455ce89bec721068bd8a8f5689dad93d89))


### Features

* **admin-spark:** add account_name to roster (peers) — Phase A.1 ([5b8d8ff](https://github.com/MyAvenCEO/avenOS/commit/5b8d8ff4ea549b8ed2f75101576d786b969390ae))
* **app:** add /sandbox route with webcm terminal (COOP/COEP) ([72c51b3](https://github.com/MyAvenCEO/avenOS/commit/72c51b36d6f7da9f4a7386aeb1587fb5453ea833))
* **app:** add standalone @AvenOS/app intents mock + supporting tooling ([b6ba11b](https://github.com/MyAvenCEO/avenOS/commit/b6ba11b976cdde6fd194ee1e91d8df8a297a8595))
* **app:** add Tauri v2 macOS shell for @AvenOS/app ([d7a1554](https://github.com/MyAvenCEO/avenOS/commit/d7a15542b334acd540caa75c5ca9b640d9803abe))
* **app:** brain-gemma — EmbeddingGemma as the brain's embedder (stub fallback) ([92e7407](https://github.com/MyAvenCEO/avenOS/commit/92e7407a733561dd770ff2fe515f32d23515e766))
* **app:** brain-recall talk mode — the brain answers every message with structured recall ([bf62e9b](https://github.com/MyAvenCEO/avenOS/commit/bf62e9ba0cf90dc1d31c5d5f8fccbeecc7c9778c))
* **app:** E2 — per-SAFE brain runtime over the shared avenDB client ([6b3c8cb](https://github.com/MyAvenCEO/avenOS/commit/6b3c8cb18c99aa70b99ea89a9b7fb3deaf5451a5))
* **app:** E4 core — brain-assembled LLM context + per-message ContextTrace ([4175d6f](https://github.com/MyAvenCEO/avenOS/commit/4175d6ff9b154ca10594519f9a5e1564dfe220dc))
* **app:** E5 v1 — brain roundtrip aside on talk (display-only probe) ([cc9dc20](https://github.com/MyAvenCEO/avenOS/commit/cc9dc205b0b6e6b452d649b1aa2be571f054bc78))
* **app:** Jazz table IPC from Tauri and local todos demo ([d8355e7](https://github.com/MyAvenCEO/avenOS/commit/d8355e7156dd9bb8fcb37f8f7f6faafb08930a17))
* **appstore:** add Mac/iOS TestFlight build pipeline and spiral icon. ([9b122ea](https://github.com/MyAvenCEO/avenOS/commit/9b122ea8719e1d3c2b3d2112308009de93e733d7))
* **app:** Tauri vibe sandbox shell, composer file drop, and display layout ([afd232c](https://github.com/MyAvenCEO/avenOS/commit/afd232c01e9589d68b1353eb07f82378ed0bea87))
* **asr:** default to Gemma 4 E2B (smaller variant) instead of E4B ([54b29e6](https://github.com/MyAvenCEO/avenOS/commit/54b29e6843850f5281369cd08b56ab09a14511bc))
* **asr:** explicit download (no autostart); 3-state audio button ([693055f](https://github.com/MyAvenCEO/avenOS/commit/693055f29fe0f5e694b6c65357243be1a55cebcd))
* **asr:** models cache at root .avenOS/models; show selected quant on Models page ([4f3e8ec](https://github.com/MyAvenCEO/avenOS/commit/4f3e8ec11603a5185fd9ee8f8132f42c7fdbf76e))
* **asr:** on-device Gemma 4 E4B transcription backend (Tauri/Rust) ([0bef6cf](https://github.com/MyAvenCEO/avenOS/commit/0bef6cfcd149e4529aa61bd0c7c4b8745902ce43))
* **asr:** on-device STT via Parakeet (sherpa-onnx); extract aven-ai crate ([e55f6e8](https://github.com/MyAvenCEO/avenOS/commit/e55f6e82f3d70a20051ae66bf19dfb117ac2cd12))
* **asr:** per-platform UQFF model + Metal backend (Apple AFQ4 / portable Q4K) ([a17fc6a](https://github.com/MyAvenCEO/avenOS/commit/a17fc6a3bb900e77127b43560461435bf639bd58))
* **asr:** real byte-progress weights download + on-disk models listing ([e13ba33](https://github.com/MyAvenCEO/avenOS/commit/e13ba33c16da594b7fdfa7047f88abc7e103b501))
* **asr:** scope voice model to the primary instance only (AVENOS_DEV_INSTANCE) ([664d326](https://github.com/MyAvenCEO/avenOS/commit/664d3264f1a94b21cc2899c5575ca700c32028a7))
* **asr:** stop-download + delete-model controls; multimodal badges; cache-skip ([52bf69c](https://github.com/MyAvenCEO/avenOS/commit/52bf69cd6c864861a101c10a3221d66b74147004))
* **asr:** structured transcript+title+summary; wire real transcription in every composer ([3db047b](https://github.com/MyAvenCEO/avenOS/commit/3db047b67d4f4a63702a37cadf9682b118e66fa8))
* **asr:** switch on-device transcription to Voxtral Mini 3B (fits 8GB/iPhone) ([5d823eb](https://github.com/MyAvenCEO/avenOS/commit/5d823ebfac3b617e2dde20bd99075028014000f3))
* Aven intent API, classify workers, compact worker cards ([a3a40b8](https://github.com/MyAvenCEO/avenOS/commit/a3a40b8711b3647ea86a2cc4ad14598a9cde2c7e))
* **aven-ai/stt:** word-level Parakeet STT + wire video-edit transcribe to it ([db18688](https://github.com/MyAvenCEO/avenOS/commit/db186889695bbe0193b82312de12ccf5b5d67758))
* **aven-ai/tts:** scaffold on-device MOSS-TTS-Nano via ort (fixed-voice v1) ([8e4ac17](https://github.com/MyAvenCEO/avenOS/commit/8e4ac171cb3ecaac3b78920697a0f7e1b51876fa))
* **aven-ai+brain:** EmbeddingGemma-300m ONNX encoder behind Embedder ([9e3e1c2](https://github.com/MyAvenCEO/avenOS/commit/9e3e1c2043935da3eca61bf463dc9a82419aa2a6))
* **aven-auth:** /invite client + rename aven-self → aven-auth ([0dee023](https://github.com/MyAvenCEO/avenOS/commit/0dee023ab6a4fa0813c896a6c13c3a39ef6883f2))
* **aven-board:** capture Aven Server Mini idea — headless stateless TCP aven on fly ([6c8808b](https://github.com/MyAvenCEO/avenOS/commit/6c8808b38384a5569e1d22665bb54bd4c5ad1df6))
* **aven-brain+app:** E3a — automatic rung-0 extraction + live talk hooks + drag-drop fix ([9a8cf25](https://github.com/MyAvenCEO/avenOS/commit/9a8cf25ba30a122ad66ad18b30df30cc1236aa02))
* **aven-brain:** Brain handle + Embedder trait + remember()/search() ([199f080](https://github.com/MyAvenCEO/avenOS/commit/199f08070725a26b5b2d667faaac1ae481f5816c))
* **aven-brain:** context assembly — wake / recall / entity cards ([d758142](https://github.com/MyAvenCEO/avenOS/commit/d7581429048956e7997042d5df7e59d527c8c45d))
* **aven-brain:** deterministic zero-LLM knowledge graph on write ([3be5cec](https://github.com/MyAvenCEO/avenOS/commit/3be5cec500ef00d0b4ec417a10f5adcd6f74161a))
* **aven-brain:** dreaming — relation decay + CRDT entity-merge ([ab66f2b](https://github.com/MyAvenCEO/avenOS/commit/ab66f2b186ed4ef7f228c0351a6090c4ad06707a))
* **aven-brain:** E1a — three-table rework (memories · entities · links) ([23190eb](https://github.com/MyAvenCEO/avenOS/commit/23190eb79beef802457d3d912eb90e3246fc0484))
* **aven-brain:** Extractor seam (TODO) + GLM-5.3 RedPill TEE board plan ([2c1c8aa](https://github.com/MyAvenCEO/avenOS/commit/2c1c8aae588639c912fd21505fbea1b64fcf088a))
* **aven-brain:** restore MemPalace strengths in engram schema ([d195345](https://github.com/MyAvenCEO/avenOS/commit/d195345d87eba6b640c9690e2dac1d8bd15efee0))
* **aven-brain:** scaffold the memory-brain crate + schema ([1b92f72](https://github.com/MyAvenCEO/avenOS/commit/1b92f7246ccf83337feaa5dea1a3a893a2e7ff4e))
* **aven-brain:** store round-out — idempotent remember, tags, scoped search ([dfb3701](https://github.com/MyAvenCEO/avenOS/commit/dfb370143614bddf118ba18c6c73471194f95250))
* **aven-ceo:** AvenTin persona, aventin skill routes, docs split ([ec9b620](https://github.com/MyAvenCEO/avenOS/commit/ec9b620de603161e22420fac0d92270aa2f2f302))
* **aven-ceo:** mock intent orchestrator dashboard on /me ([0f06ef1](https://github.com/MyAvenCEO/avenOS/commit/0f06ef1c436598939842918bcb31dc067d75b19c))
* **aven-ceo:** pricing page, landing refresh, drop skill board ([9ee46bd](https://github.com/MyAvenCEO/avenOS/commit/9ee46bd84006cfddaa8d065929298a0bbcfe2a97))
* **aven-ceo:** skills marketplace, pricing route, hero imagery ([2188be4](https://github.com/MyAvenCEO/avenOS/commit/2188be4b099455e9bc8ca3e158e8baf833476669))
* **aven-ceo:** waitlist flow, CTA wiring, copy & nav updates ([67087d4](https://github.com/MyAvenCEO/avenOS/commit/67087d41a36e556cc767da12726e5c0c7904ee0e))
* **aven-db:** BM25 `text_search` lexical-retrieval query ([7ca0387](https://github.com/MyAvenCEO/avenOS/commit/7ca0387e5321cbbe874de6c8e1027891ca4ff427))
* **aven-db:** board 0020 — one universal schema-checked CRUD, positional writes eliminated ([ac6ffbd](https://github.com/MyAvenCEO/avenOS/commit/ac6ffbde9dced6018fe988b7e6dd8731e8fa0547))
* **aven-db:** E1b — unseal-on-scan seam for nearest/text_search ([f094c2f](https://github.com/MyAvenCEO/avenOS/commit/f094c2fc47c54266e2e16926d3b163040ac20c85))
* **aven-db:** enforce owner invariant on the write path + admission roster (shadow) ([7a94b35](https://github.com/MyAvenCEO/avenOS/commit/7a94b35988deb24bd52f00a7877f2ade5129648d))
* **aven-db:** exact-cosine `nearest` vector-similarity query ([4579152](https://github.com/MyAvenCEO/avenOS/commit/45791525d1a5b500147a6fcf4f485d1460ef1dbb))
* **aven-db:** first-class Vector column type ([dcc2162](https://github.com/MyAvenCEO/avenOS/commit/dcc21626a92f3a35efb790a1b4c7bd1fbd98bdfd))
* **aven-db:** schema-checked create_checked (by column name) + migrate the brain ([fa24d83](https://github.com/MyAvenCEO/avenOS/commit/fa24d83b48fdc2d639b0b69e7d4ab0cf5b785eeb))
* **aven-node:** A3 relay apply gate fail-closed on spark-scoped rows + shared owner-scoped predicate ([0c27494](https://github.com/MyAvenCEO/avenOS/commit/0c2749437866f3198ec362e5bec8e1dbe27f2568))
* **aven-node:** enforce admission outbound — non-members denied content tables (no flag) ([b54c1f2](https://github.com/MyAvenCEO/avenOS/commit/b54c1f2fe67663ccab6f18db66bef378c6640883))
* **aven-server:** durable blind replica — RocksDB + real schema ([83cb31b](https://github.com/MyAvenCEO/avenOS/commit/83cb31b673080635bdfa5ac0f53363dd0b489e76))
* **aven-server:** implement Aven Server Mini — authenticated TLS transport + Docker→fly pipeline ([d38fa75](https://github.com/MyAvenCEO/avenOS/commit/d38fa752af8603e75dd8ad77dd85ef03df8e67ac))
* **aven-server:** P0 peeroxide transport + P1 app wiring (WIP) ([77fb952](https://github.com/MyAvenCEO/avenOS/commit/77fb9527fbf06b60660b345e1eccd23f50b7e04f))
* **aven-skills:** generic config-driven data ingestor + avenVICTORIO orders import ([5c37828](https://github.com/MyAvenCEO/avenOS/commit/5c37828c8fbec3177c66cefa9e2c16e76510c0fe))
* **aven-skills:** real POS schema, delimiter auto-detect, Order Table + Ingest debug views ([a80db5f](https://github.com/MyAvenCEO/avenOS/commit/a80db5f660abc4360a3c0f69711bdfd374bba96b))
* **aven-skills:** virtualize Orders/Table, memory-only source, monthly turnover view ([72b6d8c](https://github.com/MyAvenCEO/avenOS/commit/72b6d8c0c4c31b74251cf82bc5a9dc18882671b1))
* **aven-ui:** add bank-transfers split vibe view ([a9e6e58](https://github.com/MyAvenCEO/avenOS/commit/a9e6e58c892dabd66209d5317d9961c982735e72))
* aven.ceo landing refresh and AvenOS runtime documentation ([4967729](https://github.com/MyAvenCEO/avenOS/commit/49677296b5f83ad01f075dc3917856fec257b71c))
* aven.ceo landing, Jazz workspace at /me, fix Svelte context ([445dcf4](https://github.com/MyAvenCEO/avenOS/commit/445dcf4e2ec3944ffa985a8390865c1f7b3fef60))
* **avenCEO:** claim + addMember + self-publish IPCs — Phase A backend ([cbe7685](https://github.com/MyAvenCEO/avenOS/commit/cbe76855a05a63dcf37d594c2e2c51dbbb0783f0))
* **avenCEO:** default claim card in the spark list — Phase A frontend ([4f95cb9](https://github.com/MyAvenCEO/avenOS/commit/4f95cb98a5909d5756b5a681567fbf2b0a200692))
* **avenCEO:** deterministic well-known control-spark id — Phase A.2 keystone ([022a674](https://github.com/MyAvenCEO/avenOS/commit/022a674d1090ef84dfb811e90fa284596683c2b1))
* **avenCEO:** global invite-only app-shell gate (NetworkGate) ([c731f7d](https://github.com/MyAvenCEO/avenOS/commit/c731f7d0e42eca29cc0169cb26d05868ed632e41))
* **avenCEO:** members onboarding via bundle + self-publish UI — Phase A frontend ([9be8b82](https://github.com/MyAvenCEO/avenOS/commit/9be8b8241fb03e85294364b57f6f4198a5b71831))
* **avens:** add Avens app grid with avenVICTORIO, avenCEO, avenMAIA ([51146c9](https://github.com/MyAvenCEO/avenOS/commit/51146c9067203c6fc34de2faeed07f3951969332))
* **avens:** add sparks sub-grid layer to avenVICTORIO ([c0b0cc2](https://github.com/MyAvenCEO/avenOS/commit/c0b0cc20b6ebbda9e931ec50f436473568386524))
* **avens:** founder "My Goals" dashboard + Banking view ([7ae3dbb](https://github.com/MyAvenCEO/avenOS/commit/7ae3dbbc9a451fc4a9b705b694fa8a6f20929228))
* **avenSKILLS:** add SKR04 bookkeeping lookup tab ([b10c5ab](https://github.com/MyAvenCEO/avenOS/commit/b10c5ab5cbb9d88610c08354bb65a4442668aaef))
* **avenSKILLS:** video-edit skill (Hyperframes) + Editing tab ([fc77dd8](https://github.com/MyAvenCEO/avenOS/commit/fc77dd8da60b56fdd35ef500430745f33243e190))
* **avens:** make My Goals an aven-level dashboard above the sparks list ([0aa21ee](https://github.com/MyAvenCEO/avenOS/commit/0aa21ee46df37d88b7e883ae9c999a79a39ca267))
* **avenVICTORIO:** delete-file button in Files viewer + universal language icon ([91e8332](https://github.com/MyAvenCEO/avenOS/commit/91e8332c97ef9fa3d89edcf8e1ea5f2b0068112c))
* **avenVICTORIO:** Files viewer — type fallback, ref id, wider upload types ([912c774](https://github.com/MyAvenCEO/avenOS/commit/912c774532359edeee1744164c2f5017ebdad848))
* **avenVICTORIO:** Products view — per-position net/gross/tax + sales totals ([3ec0891](https://github.com/MyAvenCEO/avenOS/commit/3ec0891786d1d8a5e6f792fae01960aa61f35615))
* **board:** add aven-board kanban package and /board nav route ([17ee4b4](https://github.com/MyAvenCEO/avenOS/commit/17ee4b4cfee20feb32cd10e4438823489992e399))
* **board:** goal-driven work items + /board-goal hand-off command ([debab0b](https://github.com/MyAvenCEO/avenOS/commit/debab0b064bdce44d63deff4c7551a9947d5f31f))
* **board:** IPR playground with compact agent lanes ([977b9c5](https://github.com/MyAvenCEO/avenOS/commit/977b9c5607e2c6f86a08e91fd6395cb93da8bb60))
* **brain:** agentic memory tools — importance, forget/attest/link, graph+fact recall voice, CLOUD_TOOLS surface (board 0025) ([452d111](https://github.com/MyAvenCEO/avenOS/commit/452d111f0ce529b576a4a4c8246d7eaa46f1334b))
* **brain:** board 0021 — sealed at rest, no plaintext hits disk, every column ([fd052ba](https://github.com/MyAvenCEO/avenOS/commit/fd052ba276263da0bde7011ec74fe76872db1f86))
* **brain:** chunked memory ingest + recall eval harness + stemming ([bd57c6f](https://github.com/MyAvenCEO/avenOS/commit/bd57c6fd0fe4f9854662532c0c0241bc8da0a2b9))
* **brain:** cloud-LLM fact extraction in dreaming — Extractor seam filled, Tinfoil glm-5-1 adapter, live tokens (board 0024) ([c1b7c2d](https://github.com/MyAvenCEO/avenOS/commit/c1b7c2d6085b2d5b222731f150400a24fae3a384))
* **brain:** dreaming v2 + re-embed + Gemma download UX; remove identity DETAILS aside ([f3044fa](https://github.com/MyAvenCEO/avenOS/commit/f3044fa47709d37cc7814d41edd5f32ba44458b7))
* **brain:** multi-turn recall survives a second-doc ingest — MMR re-rank, window-enriched inner query, 100% receipt (board 0023) ([b70041b](https://github.com/MyAvenCEO/avenOS/commit/b70041b8b8daf832e673e7eca9261ce7f5726c92))
* **brain:** stepped dreaming off the main path + transparent 2-tab aside ([c632381](https://github.com/MyAvenCEO/avenOS/commit/c632381d2c3265541ec3320344089617d1b0c7c1))
* **brain:** visualize dreaming in the aside; surface embed-download failures ([2ec801f](https://github.com/MyAvenCEO/avenOS/commit/2ec801fac63612eb1cc7f535c076ac28d00cc814))
* **brand-design:** add Button2 tab (verbatim toggle copy to iterate on) ([707c5d2](https://github.com/MyAvenCEO/avenOS/commit/707c5d25b0b3fbae7cefe8c3e68d059fad71c287))
* **brand-design:** button = toggle knob; pressed = empty toggle track ([66e0f44](https://github.com/MyAvenCEO/avenOS/commit/66e0f440f97eab9bd017d5e9e91d849e77a98a5b))
* **brand-design:** emboss button icons/labels + softer bluish shadows ([8ad0d24](https://github.com/MyAvenCEO/avenOS/commit/8ad0d24ead06869c374ac25bc064223a361dcea3))
* **brand-design:** glowing-lamp todo check, softer emboss, soft aside glow ([9e2da99](https://github.com/MyAvenCEO/avenOS/commit/9e2da999a13b5a81edf3940065c912b857ca68bc))
* **brand-design:** matt-accent embossed labels + aside tabs match buttons ([9188abc](https://github.com/MyAvenCEO/avenOS/commit/9188abcdbf64f972ad4afec24da39d321bf611fa))
* **brand-design:** new "Brand Design" route + skeuomorphic toggle ([813e435](https://github.com/MyAvenCEO/avenOS/commit/813e43567c2052ebabdc9efea507510d6a906978))
* **brand-design:** skeuomorphic component selector + todo + button grid ([05733eb](https://github.com/MyAvenCEO/avenOS/commit/05733ebf6d20c715c1cf7d0d91d4e81f18173c8a)), closes [#1d2532](https://github.com/MyAvenCEO/avenOS/issues/1d2532) [#dedad3](https://github.com/MyAvenCEO/avenOS/issues/dedad3)
* **caps:** anti-lockout — every SAFE must keep ≥1 owner and ≥1 human owner ([b5b0f62](https://github.com/MyAvenCEO/avenOS/commit/b5b0f62d22c768c65de1b29bfacf969b0af56426))
* **caps:** delegated read cap + sparkReaderAdd (T0.2/T0.3) ([f1d4099](https://github.com/MyAvenCEO/avenOS/commit/f1d40990b0153f54f3b11991a4edba09e474f2b6))
* **caps:** granular subject-scoped grant(did,op,prefix) — Phase A.3 foundation ([ec0fa36](https://github.com/MyAvenCEO/avenOS/commit/ec0fa368c73b5809dcc4c0f7ee922eb95790f7ee))
* cascade rotation + remote controller-chain resolution ([b4e128a](https://github.com/MyAvenCEO/avenOS/commit/b4e128a969e37a02dd41c1a938bfed38eabadd97))
* **claude:** /aven-* slash commands — typed entry points for the board skills ([df5d32a](https://github.com/MyAvenCEO/avenOS/commit/df5d32a2889e35d1de96afdef7f9b4f09c67d9a7))
* **client:** membership-via-vault gate; delete client claim — S.5 ([8fec87d](https://github.com/MyAvenCEO/avenOS/commit/8fec87d4a68792e7440a89ba0e16968a89c11472))
* **debug:** Copy-debug button on Peers (console capture + state) ([34c80c3](https://github.com/MyAvenCEO/avenOS/commit/34c80c35916f8b8e11b3920fcedb5bb7d2c14a9e))
* **deploy:** ship-and-build the aven-node relay from the release commit (tarball mode) ([14538dd](https://github.com/MyAvenCEO/avenOS/commit/14538dd434b3674d2a1f61249d3ec0788d5b975f))
* **design:** [#6](https://github.com/MyAvenCEO/avenOS/issues/6) token sweep — brand primary buttons + brand pill tabs ([6a8f69c](https://github.com/MyAvenCEO/avenOS/commit/6a8f69c20101e4efe31a4616b8b52d6a5792abf1))
* **design:** add Files, Chat, Settings reference vibes ([#5](https://github.com/MyAvenCEO/avenOS/issues/5)) ([a7fe882](https://github.com/MyAvenCEO/avenOS/commit/a7fe882f55db88d28b2e5345b1eb6d15d316372c))
* **design:** add Members reference vibe (brand-primitive surface) ([f6f9f2f](https://github.com/MyAvenCEO/avenOS/commit/f6f9f2f7754ef9747b7dd3801bb0067b8c708b64)), closes [#5](https://github.com/MyAvenCEO/avenOS/issues/5)
* **design:** brand design-system foundation (tokens, ink, secondary, numbered nav) ([e5d5c03](https://github.com/MyAvenCEO/avenOS/commit/e5d5c035cb375aa1963568aa85e63457f400022d)), closes [#1f2a3d](https://github.com/MyAvenCEO/avenOS/issues/1f2a3d)
* **design:** card tones, grid-card pattern, DB degroup, chat tool-call cleanup ([f12be32](https://github.com/MyAvenCEO/avenOS/commit/f12be323dd186e1f4aaddf55a7b21f00bf6825a3))
* **design:** snap all vibe font sizes to the shared type scale ([09c2887](https://github.com/MyAvenCEO/avenOS/commit/09c28877ebe6da115567ddf67142993eb3484f19))
* **design:** standardize all vibes onto brand layer + unify aside nav ([c114b85](https://github.com/MyAvenCEO/avenOS/commit/c114b85ea293490cf70e5e924fad19758c59316a))
* **design:** standardize typography on self-hosted Chillax ([259b84a](https://github.com/MyAvenCEO/avenOS/commit/259b84a7f3e3ba452ea3eb2510616e963d0ef731))
* **dev:** single-instance app dev also runs the local aven-node server ([dc078ea](https://github.com/MyAvenCEO/avenOS/commit/dc078ea990c25b79e3c9c23b73f42c7048f63007))
* **dreams:** add /dreams screen — My Dreams + Next Up board with intent composer ([b6431ba](https://github.com/MyAvenCEO/avenOS/commit/b6431ba357035806c0ba09955db321c0ea1151b2))
* **gate:** recover the 'sovereign founders' invite copy; drop Connecting line ([9266098](https://github.com/MyAvenCEO/avenOS/commit/9266098fe3f431c1f2d1215e1bc25367f1215108))
* host aven-server on Sprites + graceful RocksDB shutdown + dev remote-relay ([edc7dcc](https://github.com/MyAvenCEO/avenOS/commit/edc7dcc1c623fd48ffce72b3b6d964ec94a02a88))
* **identities:** identity-wide intent bar + in-identity LLM tool nav ([b54e272](https://github.com/MyAvenCEO/avenOS/commit/b54e27294a0e47b1bea638611bd7d1f0169e2b0a))
* **identities:** one human self per device — no creating a second human SAFE ([925263a](https://github.com/MyAvenCEO/avenOS/commit/925263ac413a3ff80f4987e33269fa19d6be310b))
* **identities:** remove global DB viewer — data is identity-owned ([569585b](https://github.com/MyAvenCEO/avenOS/commit/569585b5b4c04fefc20a0d2264e20d46cb46f3c6))
* **identities:** restyle identity views + todos vibe ([f7bd8b3](https://github.com/MyAvenCEO/avenOS/commit/f7bd8b33b246c1e13a54ee02cee5228c95437818)), closes [#1e293b](https://github.com/MyAvenCEO/avenOS/issues/1e293b)
* **identity:** brain roundtrip as the permanent right aside on all sub-views ([84884b4](https://github.com/MyAvenCEO/avenOS/commit/84884b4d7d685984f37e172493cb92dc259fc25a))
* **invite:** add /invite to main nav + dev:app:* boots auth server ([e5584c3](https://github.com/MyAvenCEO/avenOS/commit/e5584c3d670e13890207ff396cab32a2dc9b6dec))
* **invite:** admin invite management UI (create link + open/claimed list) ([4f45b4e](https://github.com/MyAvenCEO/avenOS/commit/4f45b4e6b73a44d2bfcce550a1cecbd22f02b36e))
* **invite:** bearer auth, auto sign-in, and exclusive onboarding UX ([8823c77](https://github.com/MyAvenCEO/avenOS/commit/8823c776e892a482efb128010bd734874f73cfaa))
* **invite:** copy-paste invite code instead of deep link ([d083703](https://github.com/MyAvenCEO/avenOS/commit/d083703a5cda3b3b84a6f8df4894542f418f64f8))
* **ios-appstore:** harden TestFlight build script and docs. ([a091572](https://github.com/MyAvenCEO/avenOS/commit/a09157248c2f7529a5c61cedbc221dbacd8abce4))
* **ios:** ship the on-device LLM (LFM2.5-1.2B, llama.cpp/Metal) in mobile builds ([7e44b4f](https://github.com/MyAvenCEO/avenOS/commit/7e44b4fa48a1ed1fc4d3bea7f7b023160e2d1d8c))
* **ios:** wire Parakeet/sherpa-onnx STT into the iOS TestFlight build ([2e055c3](https://github.com/MyAvenCEO/avenOS/commit/2e055c347cea5aa75ef951cf69e471226744e817))
* **jaensen-bot:** add Flue getting started bot with minimax model ([9904c00](https://github.com/MyAvenCEO/avenOS/commit/9904c00a00b157c8d72b019f715e455b3ffc3ad7))
* **jaensen-bot:** add intent layer to architecture spec ([6b966d2](https://github.com/MyAvenCEO/avenOS/commit/6b966d29dfe3f4d0d7d6096c5e35235725077016))
* **jaensen-bot:** implement dispatcher-worker-intent architecture ([73ef2d3](https://github.com/MyAvenCEO/avenOS/commit/73ef2d3a4f56ee944171aa847c5a45df93ef3857))
* **jazz-shell:** biscuit ACC, sparks/DEKs, and sealed todos text ([c3ba113](https://github.com/MyAvenCEO/avenOS/commit/c3ba113d3c84bb038d1730c398b0ea45d8eff479))
* **jazz,app:** Groove files, intent uploads, gallery, and global file drop ([f4e39ef](https://github.com/MyAvenCEO/avenOS/commit/f4e39efe3438749f1d243367ef5dcf1024a585ad))
* **jazz,p2p:** unified reactive spine — peer fanout + single drain + jazzStore ([4804e40](https://github.com/MyAvenCEO/avenOS/commit/4804e4045f020f2edf43b0570290eeb3dc4a4782))
* **jazz,runtime:** Groove actor spine, mesh bridge, and spark grant sync ([629236d](https://github.com/MyAvenCEO/avenOS/commit/629236de4331a15fd44df35c02e5c37bceb33d23))
* **jazz,self:** reconcile Groove cache and expose peer DIDs over IPC ([f96b069](https://github.com/MyAvenCEO/avenOS/commit/f96b06963d86ac0b183f2548b341d8d4982cd082))
* **jazz,sparks:** lens migrations, Talk chat, and dev build fixes ([0da6c05](https://github.com/MyAvenCEO/avenOS/commit/0da6c0572fcbe6e0b5610aa95fc2abfc688a37e0))
* **jazz:** private-by-default sealing, extended AAD, biscuit on all IPC ([8cb3798](https://github.com/MyAvenCEO/avenOS/commit/8cb3798febe90fdba459abc9cef3f4eca82d26fb))
* **jazz:** table-change drain + rune store for receive-side reactivity ([55b401e](https://github.com/MyAvenCEO/avenOS/commit/55b401e073091edf5c04892b82b1819cee715c01))
* **llm:** add update_todo + delete_todo tools (read-first, single-turn) ([cd7dc23](https://github.com/MyAvenCEO/avenOS/commit/cd7dc23112425cab282cb64aa3f0dc6b4985b7c5))
* **llm:** id-based todo edit/delete — model selects the id, no regex ([3254f18](https://github.com/MyAvenCEO/avenOS/commit/3254f181f61b3e3aa03b4729ee7ae287ac22eb17))
* **llm:** on-device LFM2.5-8B-A1B (ONNX) streaming agent replies in Talk ([76ce0c5](https://github.com/MyAvenCEO/avenOS/commit/76ce0c517ea4d5e68da36ca486dbd810958f4c31))
* **llm:** tool calling on LFM2.5 (llama.cpp) + navigate_pages from Talk ([81cefda](https://github.com/MyAvenCEO/avenOS/commit/81cefdaa3c3b14c274fe0130d610fba0d2934e46))
* **llm:** tool-call-only agent + standard response field + malformed-call recovery ([c684cb5](https://github.com/MyAvenCEO/avenOS/commit/c684cb5c60cfc7b2a11f5cc76f5032c90e3c6ec5))
* **llm:** wire llama.cpp LFM2.5 (GGUF, Metal) as the on-device backend ([9d78733](https://github.com/MyAvenCEO/avenOS/commit/9d78733e5ccbcef5071b076e221c23d6a0dafeca))
* Maia seed layout, agent manifest UI, and memory deep links ([6110bde](https://github.com/MyAvenCEO/avenOS/commit/6110bde6b9a79b0b86415c185de7e5262c7ef9ca)), closes [#ctx-actor-config](https://github.com/MyAvenCEO/avenOS/issues/ctx-actor-config)
* **members:** 2 tabs + DRY caps single-source from the biscuit (B) ([b34f5c4](https://github.com/MyAvenCEO/avenOS/commit/b34f5c44dfb9e5ff2515ce49d9fa9d0a67cc1c5e))
* **members:** drop per-peer connection state; single-click Stop sharing ([22bf2c2](https://github.com/MyAvenCEO/avenOS/commit/22bf2c2346c5b1f91b786b18ced835d1b6df4aff))
* **members:** show signer type in the Members UI ([cffbae4](https://github.com/MyAvenCEO/avenOS/commit/cffbae47b3ada2a5e17921fd44357c5806c5c2d4))
* **members:** unified grant UI + role labels (fix dup badge), grant section on top ([2c32b90](https://github.com/MyAvenCEO/avenOS/commit/2c32b906e9a09cba33f1fb0f5cd36b2e607a1a2e))
* **memory,talk:** vault graph, full context inspector, self-contained Maia rules ([d4d1fe6](https://github.com/MyAvenCEO/avenOS/commit/d4d1fe6b6a64bf7e0a13b04e9c9e7242decb3df4))
* **onboarding:** create-new vs pair-existing choice at the human-SAFE step ([6e98666](https://github.com/MyAvenCEO/avenOS/commit/6e986668663b19e2731bb0eda1aa745f22e996cf))
* **onboarding:** human SAFE step + invite targets the human did:safe ([7dbc73d](https://github.com/MyAvenCEO/avenOS/commit/7dbc73d333fe2e11e41dadb681220d664bf64c02))
* **ownership:** cryptographic owner-binding enforcement (E2E, relay-proof) ([fc68288](https://github.com/MyAvenCEO/avenOS/commit/fc68288020a8faec0f85bd30bbca3dad84000972))
* **ownership:** private-by-default E2E — deny-flip + all-write-type stamping ([af014e0](https://github.com/MyAvenCEO/avenOS/commit/af014e0bf688f785fa6812caa3a97187eb2f8206))
* **ownership:** write-once owner — reject local relabel via update ([db72108](https://github.com/MyAvenCEO/avenOS/commit/db721080215744d813f6474a8013cb81ba143664))
* **p2p,ui:** mesh reliability, subscribe seeding, and header sync status ([ee4dc3a](https://github.com/MyAvenCEO/avenOS/commit/ee4dc3a9c40bebf58e5bcb0ebb9306d0fe101d34))
* **p2p:** consolidate mesh roundtrip, relay host, and mobile shell ([482d5eb](https://github.com/MyAvenCEO/avenOS/commit/482d5ebeebb332d68258a79d76e1fe74db4fcd1f))
* **peer-catchup:** Coalesce outbound Groove mesh flush per peer state. ([24b30e8](https://github.com/MyAvenCEO/avenOS/commit/24b30e8b0bc24f58b20d08fc1fbd57db70b3408c))
* **peer,jazz:** private spark P2P sync over Hyperswarm with biscuit ACL ([3e20cda](https://github.com/MyAvenCEO/avenOS/commit/3e20cda1aacc31962ee7d20c156f6e7126dd467b))
* Phase 1+2 — rename identities→safes, add safe_did/safe_controllers schema, SAFE_DID_PREFIX constants and helpers ([88c7f79](https://github.com/MyAvenCEO/avenOS/commit/88c7f79cad1bd9e6d0f8c8025866db1b284ce53c))
* Phase 5 — DEK propagation through SAFE controller chains ([2bdd4d1](https://github.com/MyAvenCEO/avenOS/commit/2bdd4d18729098fae2007ff57a4d0ed2aa109464))
* Phases 3+4 — SAFE-in-SAFE delegation with typed member enforcement ([1b6ca57](https://github.com/MyAvenCEO/avenOS/commit/1b6ca579aaa13aab9bf6aa50519502bd7492bc6c))
* **privacy:** seal peers.account_name + device_label (M5 — private-by-default names) ([2af5c37](https://github.com/MyAvenCEO/avenOS/commit/2af5c376aa414e6a050b289c9bb91c5300a311e0))
* **release:** bake AVENOS_SERVER_WS_URL into iOS + macOS App Store builds (M2.1) ([7c16104](https://github.com/MyAvenCEO/avenOS/commit/7c16104bc8c9056b909516771557563f4a5a1654))
* **release:** CalVer next-channel auto-versioning — tags + changelog (board 0038) ([23fe8d3](https://github.com/MyAvenCEO/avenOS/commit/23fe8d3b15bbdf65e8500b2ea7e72efd5c07158a))
* **safes:** avenCEO server grants ONLY the human SAFE, never the device key ([a261f16](https://github.com/MyAvenCEO/avenOS/commit/a261f16be68b9e4c0bbfc616fd73ce016e4a413b))
* **safes:** avens accept did:key + human did:safe owners; avenCEO is an aven ([cde45ce](https://github.com/MyAvenCEO/avenOS/commit/cde45ce5c2ab0c74e5ec7b4755b0ee0879e1808e))
* **safes:** per-SAFE wrap keypair — the did:safe: member key-delivery primitive ([e38ce82](https://github.com/MyAvenCEO/avenOS/commit/e38ce8248de62c1e21ef37537ae6783f13530c89))
* **safes:** promote avenCEO admin to the human SAFE, not the device signer ([b9edfd0](https://github.com/MyAvenCEO/avenOS/commit/b9edfd0e9184d7864c041cec43a8a46f4ea88291))
* **schema:** E0 — brain tables + vector type in the manifest ([fdaaffb](https://github.com/MyAvenCEO/avenOS/commit/fdaaffb36e0ad9fef26f594bac148f3479c0093c))
* **self,ui:** peer sync states, pairing list UX, and avenOS shell name ([b52aef6](https://github.com/MyAvenCEO/avenOS/commit/b52aef62d83539d7ba47ec94515f3a1ac35fafd4))
* **self,ui:** reorganize Self nav, peers flow, and Share spark access ([0e6e386](https://github.com/MyAvenCEO/avenOS/commit/0e6e386c294e6e2b1fc8847f01d0eab98b609ba3))
* **self,vault:** human-scoped vaults with onboarding and profile labels ([6d63767](https://github.com/MyAvenCEO/avenOS/commit/6d63767b5ddd03f5d69814cd921346ee4f650a38))
* **self:** Linux dev identity fallback and cross-platform Documents paths ([48808aa](https://github.com/MyAvenCEO/avenOS/commit/48808aa250d889c4b91af4b7e66457a0d7a0569d))
* **self:** onboarding lock screen with banner and auto device label ([2cf5cd8](https://github.com/MyAvenCEO/avenOS/commit/2cf5cd8c073929e067c91815652bcc5854d3b305))
* **self:** Secure Enclave device keys, genesis anchor, and Self settings ([140c06b](https://github.com/MyAvenCEO/avenOS/commit/140c06b84643f4bceb8c62f908e68e28af955b65))
* **server:** auto-grant first peer admin on avenCEO at connect — S.4 ([f42d4ba](https://github.com/MyAvenCEO/avenOS/commit/f42d4baaabc2ce9fb06c06b48ed142c280f1ccb9))
* **server:** biscuit cap vault from server seed + avenCEO id — S.2 ([d4be1e6](https://github.com/MyAvenCEO/avenOS/commit/d4be1e650bbaefcf037a3bc5629b450fc76eb0a7))
* **server:** mint + own the avenCEO genesis on startup — S.3 ([f32049a](https://github.com/MyAvenCEO/avenOS/commit/f32049a6e7bd999958cee3933c26b3ea672e66a5))
* **settings:** add Models section listing on-device models + live progress ([8c1b8eb](https://github.com/MyAvenCEO/avenOS/commit/8c1b8eb294ca712ded500e69e0d541b475dec3a9))
* **settings:** logout button in self-settings aside (switch accounts in-run) ([e245bf3](https://github.com/MyAvenCEO/avenOS/commit/e245bf3b247eae5862972dd9654bf763a834413c))
* **settings:** move vault UI into Self settings as its own category ([068535e](https://github.com/MyAvenCEO/avenOS/commit/068535ea08fbfe6009066abe106a740ee8d3f851))
* **settings:** show app version in the settings aside footer ([7a7d7a9](https://github.com/MyAvenCEO/avenOS/commit/7a7d7a98021c603bb09c05125f3742112a6d6cc1))
* **sharing:** biscuit-driven sharing — grant by DID is the only pairing step ([c7d6cf3](https://github.com/MyAvenCEO/avenOS/commit/c7d6cf3664164ddda530cd6d3ba6e23f47849660))
* **signers:** persist signer_type; consolidate login selector to label + type ([7ed03f7](https://github.com/MyAvenCEO/avenOS/commit/7ed03f73dfaf402a517fdf75dfad5c3176a69cbb))
* **skills:** day1-birth editing example (video-edit skill asset) ([0674d6b](https://github.com/MyAvenCEO/avenOS/commit/0674d6bc332b2ba3dc08b1c7fd75f59c2172e01a))
* **skills:** faithful Hyperframes port of the original video-edit skill + storytelling skill ([76d1c6a](https://github.com/MyAvenCEO/avenOS/commit/76d1c6ad0bcb70ef740f8bf5129cea9c01e99ab7))
* **sparks,peer,dev:** Talk/Todos spark views, pairing labels, and app2x linux ([c3649e2](https://github.com/MyAvenCEO/avenOS/commit/c3649e272863bfb48ef65212df7c918e14fbedd9))
* **sparks:** move Members from aside into own main-area view ([65e4afb](https://github.com/MyAvenCEO/avenOS/commit/65e4afbbbb975d5e13602ae8eba1ea43c5cb92a1))
* **sparks:** move Members from aside into own main-area view ([82d93a9](https://github.com/MyAvenCEO/avenOS/commit/82d93a953fecfd2a7aac2dd3ed5f9c8690457e51))
* **sparks:** spark-scoped DB viewer sub-tab ([722f227](https://github.com/MyAvenCEO/avenOS/commit/722f2273e35a43f0706a412c6481cc9df48afceb))
* **spark:** v2 per-spark revoke via DEK key rotation (end-to-end + tests) ([715e318](https://github.com/MyAvenCEO/avenOS/commit/715e318ca5c17b5ffa8ffb1b6523fcc8fc87b120))
* **stories:** day 0001 — The Birth of AGI (avenMAIA 5423-day storytelling challenge) ([9b13096](https://github.com/MyAvenCEO/avenOS/commit/9b130962fb6b78f54ec24c01ba7c7dc31e181a04))
* **sync:** auto-grant the connected relay blind-sync on every created identity ([613b8dc](https://github.com/MyAvenCEO/avenOS/commit/613b8dcbeccdd6d21cdfd9a385c9af25b9de23b8))
* **sync:** auto-reconnect the relay transport on the fly (network switch, hibernate, cellular) ([6d6f968](https://github.com/MyAvenCEO/avenOS/commit/6d6f9689aa617900f24454be126b4532b65f4de1))
* **sync:** blind replication capability — AccOp::Replicate + biscuit grant ([504b694](https://github.com/MyAvenCEO/avenOS/commit/504b6949f98ab7b3d2945c485d6f0d34f00526c7))
* **sync:** peers is a spark-scoped table — T0.1-core ([d6d728c](https://github.com/MyAvenCEO/avenOS/commit/d6d728c4b94bfbd9b44d47896295bafcbac83063))
* **talk:** board 0021 — Tinfoil cloud agent + one generic batch todos CRUD tool ([28cd6ae](https://github.com/MyAvenCEO/avenOS/commit/28cd6ae676a5c2a011d04f79c771099d213f269a))
* **talk:** feed brain auto-assembled context to the LLM + dream every turn ([3ecf2e5](https://github.com/MyAvenCEO/avenOS/commit/3ecf2e5d48e06233ea868a90e1840c693f0c58ee))
* **talk:** gemma4-31b + live tool-state badges on all identity views ([0db72c0](https://github.com/MyAvenCEO/avenOS/commit/0db72c04675eb713aefde3e9549cf60a7628ff0e))
* **talk:** HITL gate on todo deletion — human must confirm before delete runs ([c2d817b](https://github.com/MyAvenCEO/avenOS/commit/c2d817bfcbe213f1e280e01a01dd75a537db5739))
* **talk:** inline voice-model progress in composer pill; drop top-left indicator ([8d233e1](https://github.com/MyAvenCEO/avenOS/commit/8d233e1c06958c371fd19c109dd7a989707dd903))
* **talk:** label agent 'Aven' (drop LFM2.5); hide on-device Speak button ([8e08d3a](https://github.com/MyAvenCEO/avenOS/commit/8e08d3a2efde3114121140bb35dad7d75358663f))
* **talk:** on-device voice-note capture + transcription wiring (front-end) ([0cfc0b1](https://github.com/MyAvenCEO/avenOS/commit/0cfc0b1ec30762f7ba60754ed4ad538ae5b2bb09))
* **talk:** pure-cloud mode — all Talk LLM via Tinfoil; clear aven-brain dead code ([3b7ce86](https://github.com/MyAvenCEO/avenOS/commit/3b7ce86db28ce4b2552c64e1b63caa4ec93f4a62))
* **talk:** unify agent live-state into one indicator above the intent button ([af18148](https://github.com/MyAvenCEO/avenOS/commit/af18148377585fbe84cec18836a12521bd9f1019))
* **talk:** wire on-device TTS play button into agent message bubbles ([939cb66](https://github.com/MyAvenCEO/avenOS/commit/939cb66b874f3dd969b67fdfb3a173a6382e053b))
* **todos:** render the identity todos view via the dynamic JSON vibe ([04813e5](https://github.com/MyAvenCEO/avenOS/commit/04813e56de6ab923b9e7ed2593b07ea669589766))
* **tts:** live Speak state — "Generating… Ns" / "Playing… Ns" ([0b8897f](https://github.com/MyAvenCEO/avenOS/commit/0b8897fd1dd0f980315fbacac17a1b34601f5578))
* **tts:** run MOSS on the GPU/ANE via the CoreML execution provider (Apple) ([73f6b90](https://github.com/MyAvenCEO/avenOS/commit/73f6b9036786b628022a8ac78e7ce350d3057fb7))
* **tts:** show MOSS-TTS-Nano in Settings → Models with manual download ([43e08ec](https://github.com/MyAvenCEO/avenOS/commit/43e08ec8c0adbb1d21e976757c636a27b7e804d9))
* **tts:** stream audio as it generates (decode every ~0.5s, emit the tail) ([3c205a5](https://github.com/MyAvenCEO/avenOS/commit/3c205a55476227c0ce8208943329c0690e3402be))
* **tts:** use Bella as the single voice (drop the selectable picker) ([c6cd232](https://github.com/MyAvenCEO/avenOS/commit/c6cd232f0eab173fb6fc0732ba27fbf9d5283246))
* **tts:** wire 2 multilingual female voices (Ava, Bella) with a picker ([ed89560](https://github.com/MyAvenCEO/avenOS/commit/ed8956051609b3c54994d117f2c52c115a8c555f))
* **tts:** wire MOSS-TTS-Nano to the real prebuilt ONNX + verified tokenizer ([caf4a78](https://github.com/MyAvenCEO/avenOS/commit/caf4a7899358d9acfeb47c3e2420a2d01c5f7496))
* **ui:** grant a spark replication peer from Spark Members ([89f991a](https://github.com/MyAvenCEO/avenOS/commit/89f991ac8cf52b35dce3735feeefe1fc8e4143e4))
* **ui:** move "Copy debug logs" to Spark Members; drop redundant peers roster ([d167298](https://github.com/MyAvenCEO/avenOS/commit/d1672983d78fddf99dfc3ca3cd5ab4775cf2061f))
* **ui:** one-click "replicate this spark to the connected relay" ([4293ecf](https://github.com/MyAvenCEO/avenOS/commit/4293ecfb3770bd959fb15083068a8ec5132d0fa8))
* **ui:** Phase 1/7 — identity→safe rename in frontend + Sparks section ([14df2d8](https://github.com/MyAvenCEO/avenOS/commit/14df2d8bac3177b4611a45ebac1c19e1d26ad321))
* **ui:** Phase 6/7 — SAFE-in-SAFE member picker + typed member display ([d51ed70](https://github.com/MyAvenCEO/avenOS/commit/d51ed70d5423608f01f6ed2c658b162d5000c123))
* **vibe-apps:** Vertrags-Viewer (mehrere Parteien, Klauseln, Demo) ([9f54c5d](https://github.com/MyAvenCEO/avenOS/commit/9f54c5d32503f1e6cd89485cc005648fe26e397e))
* **vibes:** todos agent tool co-located in the vibe, executed in QuickJS sandbox ([10e96ea](https://github.com/MyAvenCEO/avenOS/commit/10e96eab9616cfee4a7c72f7cfb68948c68c78f2))
* **video-edit:** 1:1 default + 30s ocean short (multi-clip, music, MOSS VO) ([c9d8eb2](https://github.com/MyAvenCEO/avenOS/commit/c9d8eb272296126b6c941d450be948492f8217e1))
* **video-edit:** ocean-breath intro + audio polish ([8124898](https://github.com/MyAvenCEO/avenOS/commit/8124898bcef05cee04c6033adf61705cf1637a63))
* **voice:** auto-start audio-model download+load on first mic tap ([b44f814](https://github.com/MyAvenCEO/avenOS/commit/b44f814d5b9cba4be409e3ece9f51a8e719a8424))
* WebSocket sync transport — devices sync through the Sprite over the public URL ([e093aa5](https://github.com/MyAvenCEO/avenOS/commit/e093aa55464447c352a2b5b292214d02a4980b76))
* **workspace:** Jazz workers spawned when adding intents ([9b446ff](https://github.com/MyAvenCEO/avenOS/commit/9b446ff0ffe36d38085ccc6a0f873a88dfd2d8e6))


### Performance Improvements

* **tts:** 2 intra-op threads — MOSS now renders faster than real-time ([b19bb8e](https://github.com/MyAvenCEO/avenOS/commit/b19bb8e08d86d027e579a61dbbd1ec51d392f197))
* **unlock:** instant forward — hydrate Groove shell in the background ([59fb4b8](https://github.com/MyAvenCEO/avenOS/commit/59fb4b8ccf93e620fa30b132c37150422de92b43))


### Reverts

* Revert "chore(p2p): restore relay/signal dev plumbing scripts" ([0ea58d3](https://github.com/MyAvenCEO/avenOS/commit/0ea58d351522f244871b8d945948fc74cd203b2b))
* **0034:** drop the hardcoded predicate-synonym table — keep it fully generic ([46bf85b](https://github.com/MyAvenCEO/avenOS/commit/46bf85b853ea10271e20df3cbd0e44fa1058db30))
* drop legacy AAD fallback — vaults wiped, clean slate with safes table name ([f74a652](https://github.com/MyAvenCEO/avenOS/commit/f74a65222a61140a9bc00414d5cf6bc8fbfba0eb))
* **tts:** drop CoreML EP — it segfaults via ort load-dynamic ([2b7a8f0](https://github.com/MyAvenCEO/avenOS/commit/2b7a8f05f86922a77c8d617d79158d0c9fa86a5a))
# Changelog

All notable changes are recorded here. Versions follow CalVer (`YY.M.MICRO`); the
`-next.N` prereleases come from the `next` staging channel. Entries are generated
from conventional commits.
