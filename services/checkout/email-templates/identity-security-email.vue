<script setup lang="ts">
const { email } = useConfig()
</script>

<template>
	<AvenEmail preheader="An update about your aven.id account">
		<Text class="m-0 text-center text-[11px] uppercase leading-4 tracking-[0.08em] text-[#76808f]">Account security</Text>
		<Heading class="mb-0 mt-2 text-center text-[22px] font-semibold leading-7 tracking-[-0.02em] text-[#1f2a3d]">Your aven.id account</Heading>
		<Text class="mt-4 text-center text-[15px] leading-6 text-[#1f2a3d]">{{ email.message }}</Text>
		<Button :href="email.accessUrl" class="mt-6 box-border rounded-xl bg-[#1e293b] px-6 py-4 text-[15px] font-semibold text-[#f8fafc] no-underline">Open your account</Button>
		<Text class="mb-0 mt-6 text-center text-[12px] leading-5 text-[#76808f]">If you did not initiate this action, contact support through the official Aven website. Do not forward account setup links.</Text>
	</AvenEmail>
</template>
