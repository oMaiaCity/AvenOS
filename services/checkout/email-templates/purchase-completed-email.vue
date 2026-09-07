<script setup lang="ts">
const { email } = useConfig()
</script>

<template>
	<AvenEmail :preheader="`${email.name}.aven.ceo is yours`">
		<Text class="m-0 text-center text-[11px] uppercase leading-4 tracking-[0.08em] text-[#76808f]">
			Purchase complete
		</Text>
		<Heading
			class="mb-0 mt-2 text-center text-[22px] font-semibold leading-7 tracking-[-0.02em] text-[#1f2a3d]"
		>
			Welcome to {{ email.name }}.aven.ceo
		</Heading>
		<Text class="mt-4 text-center text-[15px] leading-6 text-[#1f2a3d]">
			Your purchase is complete. <strong>{{ email.name }}.aven.ceo</strong> is yours.
		</Text>
		<template v-if="email.accessUrl">
			<Text class="mt-4 text-center text-[15px] leading-6 text-[#1f2a3d]">
				Create your passkey to sign in to avenOS without a password.
			</Text>
			<Button
				:href="email.accessUrl"
				class="mt-6 box-border rounded-xl bg-[#1e293b] px-6 py-4 text-[15px] font-semibold text-[#f8fafc] no-underline"
			>
				Create passkey
			</Button>
			<Text class="mb-0 mt-6 text-center text-[12px] leading-5 text-[#76808f]">
				This link works for seven days, or until your first passkey is created.
			</Text>
		</template>
	</AvenEmail>
</template>
