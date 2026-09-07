<script setup lang="ts">
defineProps({
	preheader: { type: String, default: '' }
})
const { email } = useConfig()
</script>

<template>
	<Layout lang="en" body-class="m-0 bg-[#f8f6ef] py-10 font-sans text-[#1f2a3d]">
		<Preheader v-if="preheader">{{ preheader }}</Preheader>
		<Container class="mx-auto max-w-xl text-center">
			<Section class="px-8 pb-6 text-center">
				<img
					:src="`${email.baseUrl}/email/aven-logo.png`"
					width="80"
					alt="avenCEO"
					class="mx-auto block h-auto w-20 max-w-full"
				>
			</Section>
			<Section
				class="overflow-hidden rounded-3xl border border-solid border-[#e2ddd0] bg-[#fffdf7] px-8 py-8 text-center"
			>
				<slot />
			</Section>
			<AvenFooter />
		</Container>
	</Layout>
</template>
